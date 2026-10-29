/**
 * Loading and rule-checking page claims.
 * Everything here is pure functions over parsed JSON so tests stay fast and
 * the same code powers PR validation, the index build and the DNS sync.
 */

import { isPrivateIpv4, isPrivateIpv6, isValidIpv4, isValidIpv6 } from "./ips.js";
import { nameProblems } from "./names.js";
import type { ClaimedPage, Limits, PageClaim } from "./types.js";

export interface RuleResult {
  errors: string[];
  warnings: string[];
}

const HOSTNAME = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i;
const HTTPS_URL = /^https:\/\/[^\s]+$/i;

/** Content rules that apply to every claim, whatever the change. */
export function checkClaim(name: string, claim: PageClaim, limits: Limits): RuleResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const problem of nameProblems(name)) {
    errors.push(`The name "${name}" ${problem}.`);
  }

  if (claim.mode === "point") {
    const records = claim.records ?? {};
    const kinds = (Object.keys(records) as Array<keyof typeof records>).filter(
      (k) => records[k] !== undefined
    );
    if (kinds.length === 0) {
      errors.push("Point mode needs at least one DNS record (CNAME, A, AAAA or TXT).");
    }
    if (records.CNAME !== undefined && kinds.length > 1) {
      errors.push("A CNAME cannot be combined with other record types. Pick CNAME only, or drop it.");
    }
    if (records.CNAME !== undefined && !HOSTNAME.test(records.CNAME)) {
      errors.push(`"${records.CNAME}" does not look like a hostname.`);
    }
    for (const ip of records.A ?? []) {
      if (!isValidIpv4(ip)) errors.push(`"${ip}" is not a valid IPv4 address.`);
      else if (isPrivateIpv4(ip)) errors.push(`"${ip}" is a private or reserved IPv4 address and cannot be used.`);
    }
    for (const ip of records.AAAA ?? []) {
      if (!isValidIpv6(ip)) errors.push(`"${ip}" is not a valid IPv6 address.`);
      else if (isPrivateIpv6(ip)) errors.push(`"${ip}" is a private or reserved IPv6 address and cannot be used.`);
    }
  }

  if (claim.verification) {
    if (claim.mode !== "point") errors.push("Verification is only supported for point claims.");
    const prefix = `vc-domain-verify=${name}.got-a.page,`;
    const value = claim.verification.vercel;
    if (typeof value !== "string" || !value.startsWith(prefix) ||
        !/^[a-zA-Z0-9_-]{1,200}$/.test(value.slice(prefix.length))) {
      errors.push(`Vercel verification must be the exact vc-domain-verify=${name}.got-a.page,<token> value for this claim. Apex, wildcard and other-domain values are not allowed.`);
    }
    warnings.push("Vercel verification changes require maintainer review of the exact Domains record before merge. This publishes TXT at the shared _vercel.got-a.page label.");
  }

  if (claim.mode === "instant") {
    const page = claim.page;
    if (!page) {
      errors.push("Instant mode needs a \"page\" object with your content.");
    } else {
      if (!limits.supportedInstantTypes.includes(page.type)) {
        errors.push(
          `"${page.type}" pages are not rendering yet (person and product are live today; the rest arrive in Phase 2).`
        );
      }
      for (const link of page.links ?? []) {
        if (!HTTPS_URL.test(link.url)) errors.push(`Link "${link.label}" must start with https://`);
      }
      if (page.avatar && !HTTPS_URL.test(page.avatar)) {
        errors.push("The avatar URL must start with https://");
      }
      for (const shot of page.product?.screenshots ?? []) {
        if (!HTTPS_URL.test(shot)) errors.push("Screenshot URLs must start with https://");
      }
      if (page.product?.cta && !HTTPS_URL.test(page.product.cta.url)) {
        errors.push("The button URL must start with https://");
      }
      if (page.type === "product" && !page.product?.cta) {
        warnings.push("Product pages shine with a call-to-action button. Consider adding product.cta.");
      }
    }
  }

  return { errors, warnings };
}

/** How many DNS records a point-mode claim will occupy. */
export function recordCount(claim: PageClaim): number {
  if (claim.mode !== "point" || !claim.records) return 0;
  const r = claim.records;
  return (
    (r.CNAME !== undefined ? 1 : 0) +
    (r.A?.length ?? 0) +
    (r.AAAA?.length ?? 0) +
    (r.TXT?.length ?? 0) +
    (claim.verification?.vercel ? 1 : 0)
  );
}

/** Total records across every point-mode page, checked against the zone budget. */
export function budgetProblems(pages: ClaimedPage[], limits: Limits): string[] {
  const used = pages.reduce((sum, p) => sum + recordCount(p.claim), 0);
  if (used > limits.dnsRecordBudget) {
    return [
      `This change would take point-mode records to ${used}, over the budget of ${limits.dnsRecordBudget}. ` +
        `Free DNS zones cap at 200 records and we keep headroom. Ask a maintainer about the upgrade path.`,
    ];
  }
  return [];
}

/** Per-account claim limit (maintainers are exempt; enforced on new files). */
export function limitProblems(
  pages: ClaimedPage[],
  owner: string,
  limits: Limits
): string[] {
  const mine = pages.filter(
    (p) => p.claim.owner.github.toLowerCase() === owner.toLowerCase()
  );
  if (mine.length > limits.maxPagesPerAccount) {
    return [
      `@${owner} would have ${mine.length} pages; the launch limit is ${limits.maxPagesPerAccount} per GitHub account.`,
    ];
  }
  return [];
}

/** Case-insensitive GitHub username comparison. */
export function sameUser(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
