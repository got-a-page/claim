/**
 * Syncs point-mode DNS records with the provider, diff-based and idempotent.
 *
 *   tsx scripts/src/dns-sync.ts --repo .            dry run (default, prints the plan)
 *   tsx scripts/src/dns-sync.ts --repo . --apply    make the changes
 *
 * Safety rails:
 *   - only records tagged MANAGED_TAG are ever updated or deleted
 *   - records present in DNS but not in the repo are left alone unless tagged
 *   - the run refuses to apply a plan that would exceed the record budget
 */

import { loadRepo } from "./lib/store.js";
import type { DnsProvider } from "./dns/provider.js";
import { CloudflareProvider } from "./dns/cloudflare.js";
import { desiredRecords, diff, ZONE } from "./dns/plan.js";

function arg(flag: string, fallback = ""): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const apply = process.argv.includes("--apply");
const repo = arg("--repo", ".");

const providerName = arg("--provider", "cloudflare");
let provider: DnsProvider;
if (providerName === "cloudflare") {
  provider = new CloudflareProvider(process.env.CF_API_TOKEN ?? "", process.env.CF_ZONE_ID ?? "");
} else {
  console.error(`Unknown provider "${providerName}". Only cloudflare exists today; the interface is ready for more.`);
  process.exit(1);
}

const desired = desiredRecords(loadRepo(repo));
const live = await provider.listRecords(ZONE);
const plan = diff(desired, live);

console.log(`${apply ? "Applying" : "Dry run - would apply"} on ${provider.name}:`);
for (const r of plan.create) console.log(`  + ${r.type} ${r.name} -> ${r.content}`);
for (const r of plan.update) console.log(`  ~ ${r.type} ${r.name} -> ${r.content}`);
for (const r of plan.remove) console.log(`  - ${r.type} ${r.name} (was ${r.content})`);
if (plan.create.length + plan.update.length + plan.remove.length === 0) {
  console.log("  nothing to do, DNS already matches the repo.");
}

if (apply) {
  for (const r of plan.create) await provider.createRecord(r);
  for (const r of plan.update) await provider.updateRecord(r);
  for (const r of plan.remove) await provider.deleteRecord(r);
  console.log("Done.");
} else {
  console.log("Re-run with --apply to make these changes.");
}
