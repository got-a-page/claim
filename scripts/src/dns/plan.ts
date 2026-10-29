/** Pure DNS planning: no credentials or network access. */
import { budgetProblems, checkClaim } from "../lib/claims.js";
import { schemaErrors } from "../lib/schema.js";
import type { RepoData } from "../lib/store.js";
import type { DnsRecord } from "./provider.js";

export type DesiredRecord = Omit<DnsRecord, "id">;
export interface Plan { create: DesiredRecord[]; update: DnsRecord[]; remove: DnsRecord[] }
export const ZONE = "got-a.page";
export const VERCEL_NAME = `_vercel.${ZONE}`;

export function desiredRecords(data: RepoData): DesiredRecord[] {
  const errors = [...budgetProblems(data.pages, data.limits)];
  for (const { name, claim } of data.pages) {
    errors.push(...schemaErrors(data.schema, claim), ...checkClaim(name, claim, data.limits).errors);
  }
  if (errors.length) throw new Error(`Refusing invalid DNS input:\n${errors.join("\n")}`);
  const desired: DesiredRecord[] = [];
  for (const { name, claim } of data.pages) {
    if (claim.mode !== "point") continue;
    const r = claim.records!;
    const add = (type: DnsRecord["type"], content: string) =>
      desired.push({ name: `${name}.${ZONE}`, type, content, ttl: 300, managed: true });
    if (r.CNAME) add("CNAME", r.CNAME);
    for (const ip of r.A ?? []) add("A", ip);
    for (const ip of r.AAAA ?? []) add("AAAA", ip);
    for (const txt of r.TXT ?? []) add("TXT", txt);
    if (claim.verification?.vercel) {
      desired.push({ name: VERCEL_NAME, type: "TXT", content: claim.verification.vercel,
        ttl: 300, managed: true, verificationClaim: name });
    }
  }
  return desired;
}

/** Verification records never share an ownership bucket with routing records. */
export function diff(desired: DesiredRecord[], live: DnsRecord[]): Plan {
  const key = (r: DesiredRecord) => `${r.name}|${r.type}|${r.verificationClaim ?? ""}`;
  const plan: Plan = { create: [], update: [], remove: [] };
  const matched = new Set<string>();
  const unmatched: DesiredRecord[] = [];
  // Reserve ALL exact matches first, so rotation of one TXT never consumes another.
  for (const want of desired) {
    const exact = live.find(r => r.managed && !matched.has(r.id) && key(r) === key(want) && r.content === want.content);
    if (exact) matched.add(exact.id);
    else unmatched.push(want);
  }
  for (const want of unmatched) {
    const reusable = live.find(r => r.managed && !matched.has(r.id) && key(r) === key(want));
    if (reusable) {
      matched.add(reusable.id);
      plan.update.push({ ...reusable, content: want.content, ttl: want.ttl });
    } else plan.create.push(want);
  }
  for (const r of live) {
    // Legacy generic tags at the shared verification label are not ours to migrate.
    if (r.name === VERCEL_NAME && !r.verificationClaim) continue;
    if (r.managed && !matched.has(r.id)) plan.remove.push(r);
  }
  return plan;
}
