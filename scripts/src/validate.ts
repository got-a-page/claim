/**
 * PR validation entry point.
 *
 * Checks every page file a pull request touches and writes two artifacts the
 * workflow picks up:
 *   - validation-report.json  (machine result: ok flag, labels, summaries)
 *   - comment.md              (the friendly review comment the bot posts)
 *
 * Usage: tsx scripts/src/validate.ts --repo . --base origin/main --author <login>
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkClaim, budgetProblems, limitProblems, sameUser } from "./lib/claims.js";
import { reservedReason } from "./lib/reserved.js";
import { schemaErrors } from "./lib/schema.js";
import { changedPages, loadPagesAtRef, loadRepo, readJsonFile } from "./lib/store.js";
import type { ChangedFile } from "./lib/store.js";

function arg(flag: string, fallback = ""): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const repo = arg("--repo", ".");
const baseRef = arg("--base", "origin/main");
const author = arg("--author");
const maintainers = arg("--maintainers", "")
  .split(",")
  .map((m) => m.trim().toLowerCase())
  .filter(Boolean);

interface FileReport {
  file: string;
  name: string;
  change: ChangedFile["status"];
  errors: string[];
  warnings: string[];
  summary: string;
}

const data = loadRepo(repo);
const basePages = loadPagesAtRef(repo, baseRef);
const changes = changedPages(repo, baseRef);
const isMaintainer = maintainers.includes(author.toLowerCase());

const reports: FileReport[] = [];
const labels = new Set<string>();
const modes = new Set<string>();

for (const change of changes) {
  const name = change.path.split("/").pop()!.slice(0, -5);
  const report: FileReport = {
    file: change.path,
    name,
    change: change.status,
    errors: [],
    warnings: [],
    summary: "",
  };
  labels.add(change.status === "added" ? "new-page" : change.status === "modified" ? "update" : "delete");

  if (change.status === "deleted") {
    const before = basePages.get(name);
    if (before && !sameUser(before.owner.github, author) && !isMaintainer) {
      report.errors.push(`Only @${before.owner.github} (or a maintainer) can remove ${name}.got-a.page.`);
    }
    if (before?.verification) labels.add("needs-review");
    report.summary = `${name}.got-a.page would be released.`;
    reports.push(report);
    continue;
  }

  let parsed: unknown;
  try {
    parsed = readJsonFile(join(repo, change.path));
  } catch {
    report.errors.push("This file is not valid JSON. A comma or quote is probably missing.");
    reports.push(report);
    continue;
  }

  report.errors.push(...schemaErrors(data.schema, parsed));
  if (report.errors.length > 0) {
    reports.push(report);
    continue;
  }

  const claim = parsed as import("./lib/types.js").PageClaim;
  if (claim.verification || basePages.get(name)?.verification) labels.add("needs-review");
  labels.add(claim.mode);
  modes.add(claim.mode);

  const before = basePages.get(name);
  if (change.status === "added") {
    if (before) report.errors.push(`${name}.got-a.page is already taken.`);
    const reserved = reservedReason(name, data.reserved);
    if (reserved) report.errors.push(reserved);
    if (!sameUser(claim.owner.github, author) && !isMaintainer) {
      report.errors.push(
        `"owner.github" is @${claim.owner.github} but this PR comes from @${author}. ` +
          `Claim pages under your own account so everyone can tell who looks after what.`
      );
    }
  } else {
    // modified: ownership is frozen to the original claimant
    if (before && !sameUser(before.owner.github, author) && !isMaintainer) {
      report.errors.push(`Only @${before.owner.github} (or a maintainer) can edit ${name}.got-a.page.`);
    }
    if (before && !sameUser(before.owner.github, claim.owner.github)) {
      report.errors.push("Ownership cannot be transferred by editing the file. Ask a maintainer for help.");
    }
  }

  const rules = checkClaim(name, claim, data.limits);
  report.errors.push(...rules.errors);
  report.warnings.push(...rules.warnings);

  // Repo-wide checks run against the would-be state after merging.
  const after = data.pages.filter((p) => p.name !== name);
  after.push({ name, claim });
  report.errors.push(...budgetProblems(after, data.limits));
  if (change.status === "added") {
    report.errors.push(...limitProblems(after, claim.owner.github, data.limits));
  }

  if (claim.mode === "point") {
    const target =
      claim.records?.CNAME ??
      claim.records?.A?.[0] ??
      claim.records?.AAAA?.[0] ??
      "your DNS records";
    report.summary = `${name}.got-a.page will point to ${target}.`;
  } else {
    const kind = claim.page?.type === "product" ? "product page" : "page";
    report.summary = `${name}.got-a.page will show "${claim.page?.title}" - a ${kind} we host for you.`;
  }

  reports.push(report);
}

// Files outside pages/ never block a PR; they just get a human review label.
const pageChangeCount = changes.length;
if (pageChangeCount === 0) labels.add("needs-review");

const errors = reports.flatMap((r) => r.errors);
const ok = errors.length === 0;

const lines: string[] = [];
if (ok) {
  lines.push("### Everything looks good", "");
  for (const r of reports) lines.push(`- ${r.summary}`);
  lines.push("", "A maintainer will take a final look and merge.");
  if (modes.has("instant")) {
    lines.push(
      "",
      "**Instant pages go live within a few minutes of merge.** Until the index republishes, your address may " +
        'still show the "unclaimed" page - that\'s normal, check back shortly.'
    );
  }
  if (modes.has("point")) {
    lines.push(
      "",
      "**Point mode pages go live in stages after merge:** first DNS sync, then your host verifies the domain " +
        "and issues its HTTPS certificate. Until the certificate exists, browsers show a privacy error for your " +
        "new address - and, on GitHub Pages, for your old `github.io` URL too, since it redirects to the custom " +
        "domain. That window is normal and can last from minutes to hours; GitHub documents up to 24 hours " +
        "before Enforce HTTPS becomes available. If the host setup is not finished yet, the " +
        "[connect-host guide](https://github.com/got-a-page/claim/blob/main/docs/CONNECT-HOST.md#after-your-pr-merges) " +
        "has the steps."
    );
  }
  lines.push("", "Welcome aboard.");
} else {
  lines.push("### A few things to fix", "");
  for (const r of reports) {
    if (r.errors.length === 0) continue;
    lines.push(`**\`${r.file}\`**`);
    for (const e of r.errors) lines.push(`- ${e}`);
    lines.push("");
  }
  lines.push(
    "Push another commit to this PR when it is fixed and I will check again.",
    "Stuck? The [claim guide](https://got-a.page/docs) walks through an example."
  );
}
const warnList = reports.flatMap((r) => r.warnings.map((w) => `- ${w}`));
if (warnList.length > 0) {
  lines.push("", "**Worth a thought (not blocking):**", ...warnList);
}

writeFileSync(join(repo, "validation-report.json"), JSON.stringify({ ok, labels: [...labels], reports }, null, 2));
writeFileSync(join(repo, "comment.md"), lines.join("\n") + "\n");

console.log(ok ? "VALIDATION PASSED" : "VALIDATION FAILED");
for (const r of reports) {
  console.log(`  ${r.change.padEnd(8)} ${r.file} - ${r.errors.length} error(s), ${r.warnings.length} warning(s)`);
}
process.exit(ok ? 0 : 1);
