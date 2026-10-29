import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkClaim, recordCount, budgetProblems } from "../src/lib/claims.js";
import { schemaErrors } from "../src/lib/schema.js";
import { diff, desiredRecords, VERCEL_NAME } from "../src/dns/plan.js";
import { parseRecordTag, recordTag, MANAGED_TAG } from "../src/dns/provider.js";
import type { DnsRecord } from "../src/dns/provider.js";
import type { PageClaim, Limits } from "../src/lib/types.js";
const schema = JSON.parse(readFileSync(new URL("../../schema/page.schema.json", import.meta.url), "utf8"));
const limits: Limits = { maxPagesPerAccount: 2, dnsRecordBudget: 190, supportedInstantTypes: ["person", "product"], features: { mxRecords: false } };
const value = (name: string, token = "abc123") => `vc-domain-verify=${name}.got-a.page,${token}`;
const claim = (name: string): PageClaim => ({mode: "point", owner: {github: "octocat"}, records: {CNAME: "project.vercel-dns-017.com"}, verification: {vercel: value(name)}});
const data = (names = ["alice", "bob"]) => ({schema, limits, reserved: {infrastructure: [], brands: [], blocked: []}, pages: names.map(name => ({name, claim: claim(name)}))});
const live = (name: string, id: string, token = "abc123"): DnsRecord => ({id, name: VERCEL_NAME, type: "TXT", content: value(name, token), ttl: 300, managed: true, verificationClaim: name});

test("Vercel claim coexists with CNAME only at separate fixed label", () => {
  assert.deepEqual(schemaErrors(schema, claim("alice")), []);
  assert.deepEqual(checkClaim("alice", claim("alice"), limits).errors, []);
  const desired = desiredRecords(data(["alice"]));
  assert.deepEqual(desired.map(r => [r.name, r.type]), [["alice.got-a.page", "CNAME"], [VERCEL_NAME, "TXT"]]);
  assert.equal(recordCount(claim("alice")), 2);
  assert.equal(budgetProblems(data().pages, {...limits, dnsRecordBudget: 3}).length, 1);
});
test("reject apex, wildcard, other claimant, suffix confusion, malformed and arbitrary destination", () => {
  for (const v of ["vc-domain-verify=got-a.page,abc", "vc-domain-verify=*.got-a.page,abc", value("bob"), "vc-domain-verify=alice.got-a.page.evil.test,abc", value("alice", ""), value("alice", "x,evil"), value("alice", "abc\n")]) {
    const c = claim("alice"); c.verification!.vercel = v;
    assert.ok(checkClaim("alice", c, limits).errors.length, v);
  }
  assert.ok(schemaErrors(schema, {...claim("alice"), verification: {vercel: value("alice"), name: "_vercel.got-a.page"}}).length);
  assert.ok(schemaErrors(schema, {mode: "instant", owner: {github: "octocat"}, page: {type: "person", title: "Hi"}, verification: {vercel: value("alice")}}).length);
});
test("DNS planning rejects invalid binding or budget before provider mutation", () => {
  const bad = data(); bad.pages[0].claim.verification!.vercel = value("bob");
  assert.throws(() => desiredRecords(bad), /Refusing invalid DNS/);
  assert.throws(() => desiredRecords({...data(), limits: {...limits, dnsRecordBudget: 1}}), /budget/);
});
test("shared label supports multivalue, idempotence and order-independent exact matching", () => {
  const desired = desiredRecords(data()).filter(r => r.verificationClaim);
  assert.deepEqual(diff(desired, [live("bob", "b"), live("alice", "a")]), {create: [], update: [], remove: []});
  const rotation = desired.map(r => r.verificationClaim === "alice" ? {...r, content: value("alice", "new")} : r);
  const plan = diff(rotation, [live("bob", "b"), live("alice", "a")]);
  assert.deepEqual(plan.update.map(r => r.id), ["a"]); assert.equal(plan.remove.length, 0);
});
test("removal only drops removed claim tag and preserves foreign/manual/legacy apex TXT", () => {
  const manual = {...live("manual", "m"), managed: false, verificationClaim: undefined};
  const legacy = {...live("old", "l"), verificationClaim: undefined};
  const desired = desiredRecords(data(["bob"])).filter(r => r.verificationClaim);
  const plan = diff(desired, [manual, legacy, live("alice", "a"), live("bob", "b")]);
  assert.deepEqual(plan.remove.map(r => r.id), ["a"]);
  assert.equal(plan.create.length, 0); assert.equal(plan.update.length, 0);
});
test("removing verification or changing mode releases its tagged TXT", () => {
  assert.deepEqual(diff([], [live("alice", "a")]).remove.map(r => r.id), ["a"]);
});
test("tags parse only the fixed verification label and TXT type", () => {
  const tag = recordTag({verificationClaim: "alice"});
  assert.deepEqual(parseRecordTag(VERCEL_NAME, "TXT", tag), {managed: true, verificationClaim: "alice"});
  assert.deepEqual(parseRecordTag("alice.got-a.page", "TXT", tag), {managed: false});
  assert.deepEqual(parseRecordTag(VERCEL_NAME, "CNAME", tag), {managed: false});
  assert.deepEqual(parseRecordTag(VERCEL_NAME, "TXT", `${tag}.evil`), {managed: false});
  assert.equal(recordTag({}), MANAGED_TAG);
});
test("routing multivalue rotation reserves exact matches before reusing rows", () => {
  const record = (id: string, content: string): DnsRecord => ({id, name: "alice.got-a.page", type: "TXT", content, ttl: 300, managed: true});
  const plan = diff([record("", "new"), record("", "keep")], [record("k", "keep"), record("o", "old")]);
  assert.deepEqual(plan.update.map(r => [r.id, r.content]), [["o", "new"]]);
});

test("claim validation enforces existing owner for verification edits and deletion", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFileSync, spawnSync } = await import("node:child_process");
  const repo = mkdtempSync(join(tmpdir(), "claim-verification-"));
  const root = new URL("../../", import.meta.url).pathname;
  try {
    mkdirSync(join(repo, "pages")); mkdirSync(join(repo, "schema"));
    writeFileSync(join(repo, "schema/page.schema.json"), JSON.stringify(schema));
    writeFileSync(join(repo, "config.json"), JSON.stringify(limits));
    writeFileSync(join(repo, "reserved.json"), JSON.stringify(data().reserved));
    writeFileSync(join(repo, "pages/alice.json"), JSON.stringify(claim("alice")));
    const git = (...args: string[]) => execFileSync("git", args, {cwd: repo, stdio: "pipe"});
    git("init"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "Test");
    git("add", "."); git("commit", "-m", "base"); git("branch", "base");
    const changed = claim("alice"); changed.verification!.vercel = value("alice", "rotated");
    writeFileSync(join(repo, "pages/alice.json"), JSON.stringify(changed));
    git("add", "."); git("commit", "-m", "rotate");
    const validate = (author: string) => {
      const run = spawnSync(process.execPath, [join(root, "node_modules/tsx/dist/cli.mjs"), join(root, "scripts/src/validate.ts"), "--repo", repo, "--base", "base", "--author", author], {encoding: "utf8"});
      const report = JSON.parse(readFileSync(join(repo, "validation-report.json"), "utf8"));
      return {status: run.status, report};
    };
    assert.equal(validate("intruder").status, 1);
    const own = validate("octocat"); assert.equal(own.status, 0); assert.ok(own.report.labels.includes("needs-review"));
    rmSync(join(repo, "pages/alice.json")); git("add", "pages"); git("commit", "-m", "remove");
    assert.equal(validate("intruder").status, 1);
    assert.equal(validate("octocat").status, 0);
  } finally { rmSync(repo, {recursive: true, force: true}); }
});
