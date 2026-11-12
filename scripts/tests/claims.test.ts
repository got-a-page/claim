/** Rule checks: names, reserved list, records, budgets and limits. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { nameIssues, nameProblems } from "../src/lib/names.js";
import { reservedReason } from "../src/lib/reserved.js";
import { budgetProblems, checkClaim, limitProblems, recordCount } from "../src/lib/claims.js";
import { isPrivateIpv4 } from "../src/lib/ips.js";
import type { ClaimedPage, Limits, PageClaim } from "../src/lib/types.js";

const limits: Limits = {
  maxPagesPerAccount: 2,
  dnsRecordBudget: 190,
  supportedInstantTypes: ["person", "product"],
  features: { mxRecords: false },
};

const reserved = {
  infrastructure: ["www", "api", "status"],
  brands: ["google", "github"],
  blocked: ["casino"],
};

function instant(overrides: Partial<PageClaim> = {}): PageClaim {
  return {
    mode: "instant",
    owner: { github: "octocat" },
    page: { type: "person", title: "Octo Cat" },
    ...overrides,
  };
}

test("names: valid examples pass", () => {
  for (const name of ["ab", "dhanush", "my-page", "a1", "x".repeat(40)]) {
    assert.deepEqual(nameProblems(name), [], name);
  }
});

test("names: too short, too long, bad characters, edge hyphens", () => {
  assert.ok(nameProblems("a").length > 0);
  assert.ok(nameProblems("x".repeat(41)).length > 0);
  assert.ok(nameProblems("UPPER").length > 0);
  assert.ok(nameProblems("under_score").length > 0);
  assert.ok(nameProblems("-lead").length > 0);
  assert.ok(nameProblems("trail-").length > 0);
  assert.ok(nameProblems("has space").length > 0);
});

test("names: problems come with a concrete suggestion", () => {
  // too long: the suggestion drops a trailing word and is itself a valid name
  const tooLong = nameIssues("my-very-long-page-name-that-keeps-going-on");
  assert.equal(tooLong.length, 1);
  assert.match(tooLong[0].suggestion ?? "", /Try dropping a word, like "my-very-long-page-name-that-keeps-going"/);
  assert.deepEqual(nameProblems("my-very-long-page-name-that-keeps-going"), []);

  // a single over-long word is truncated to the limit
  const oneWord = nameIssues("x".repeat(41));
  assert.match(oneWord[0].suggestion ?? "", new RegExp(`"${"x".repeat(40)}"`));

  // bad characters: the suggestion is the sanitized name
  assert.equal(nameIssues("UPPER")[0].suggestion, 'Try "upper"');
  assert.equal(nameIssues("under_score")[0].suggestion, 'Try "under-score"');
  assert.equal(nameIssues("has space")[0].suggestion, 'Try "has-space"');

  // edge hyphens: the suggestion is the trimmed name
  assert.equal(nameIssues("-lead")[0].suggestion, 'Try "lead"');
  assert.equal(nameIssues("trail-")[0].suggestion, 'Try "trail"');

  // too short: the suggestion states the minimum
  assert.match(nameIssues("a")[0].suggestion ?? "", /at least 2 characters/);

  // and the suggestion reaches the error text produced for the PR comment
  const result = checkClaim(
    "my-very-long-page-name-that-keeps-going-on",
    { mode: "point", owner: { github: "octocat" }, records: { CNAME: "octocat.github.io" } },
    limits
  );
  assert.match(result.errors[0], /must be 2-40 characters \(got 42\)\. Try dropping a word/);
});

test("reserved: infrastructure, brands and blocked words", () => {
  assert.match(reservedReason("www", reserved) ?? "", /reserved/);
  assert.match(reservedReason("google", reserved) ?? "", /brand/);
  assert.match(reservedReason("casino", reserved) ?? "", /not available/);
  assert.equal(reservedReason("dhanush", reserved), null);
});

test("point mode: CNAME cannot be combined with other records", () => {
  const claim: PageClaim = {
    mode: "point",
    owner: { github: "octocat" },
    records: { CNAME: "octocat.github.io", A: ["1.2.3.4"] },
  };
  const { errors } = checkClaim("ok-name", claim, limits);
  assert.ok(errors.some((e) => e.includes("CNAME cannot be combined")));
});

test("point mode: private and invalid IPs are rejected", () => {
  const claim: PageClaim = {
    mode: "point",
    owner: { github: "octocat" },
    records: { A: ["192.168.1.1", "999.1.1.1"] },
  };
  const { errors } = checkClaim("ok-name", claim, limits);
  assert.equal(errors.length, 2);
  assert.ok(isPrivateIpv4("10.0.0.5"));
  assert.ok(isPrivateIpv4("172.20.1.1"));
  assert.ok(!isPrivateIpv4("172.15.1.1"));
});

test("point mode: empty records object fails", () => {
  const claim: PageClaim = { mode: "point", owner: { github: "octocat" }, records: {} };
  assert.ok(checkClaim("ok-name", claim, limits).errors.length > 0);
});

test("instant mode: non-https links are rejected", () => {
  const claim = instant({
    page: { type: "person", title: "T", links: [{ label: "Site", url: "http://example.com" }] },
  });
  assert.ok(checkClaim("ok-name", claim, limits).errors.some((e) => e.includes("https://")));
});

test("instant mode: unsupported types get a friendly phase message", () => {
  const claim = instant({ page: { type: "event", title: "Hack Day" } });
  assert.ok(checkClaim("ok-name", claim, limits).errors.some((e) => e.includes("Phase 2")));
});

test("budget: total point records must stay within the zone budget", () => {
  const pages: ClaimedPage[] = Array.from({ length: 96 }, (_, i) => ({
    name: `p${i}`,
    claim: {
      mode: "point",
      owner: { github: `u${i}` },
      records: { A: ["1.1.1.1", "2.2.2.2"] },
    },
  }));
  assert.equal(pages.reduce((s, p) => s + recordCount(p.claim), 0), 192);
  assert.ok(budgetProblems(pages, limits).length > 0);
  assert.equal(budgetProblems(pages.slice(0, 50), limits).length, 0);
});

test("limit: one account can hold at most maxPagesPerAccount pages", () => {
  const pages: ClaimedPage[] = [1, 2, 3].map((i) => ({ name: `n${i}`, claim: instant() }));
  assert.ok(limitProblems(pages, "OctoCat", limits).length > 0);
  assert.equal(limitProblems(pages.slice(0, 2), "octocat", limits).length, 0);
});
