/**
 * DNS provider contract.
 *
 * Point mode only: instant pages all ride the single wildcard record, so the
 * sync never touches them. A second provider (e.g. deSEC) implements this
 * same interface; the sync logic above does not change.
 */

export type RecordType = "CNAME" | "A" | "AAAA" | "TXT";

export interface DnsRecord {
  /** Provider-side id, empty when the record only exists in our plan. */
  id: string;
  name: string; // fully qualified, e.g. dhanush.got-a.page
  type: RecordType;
  content: string;
  ttl: number; // seconds; 1 means "automatic" on Cloudflare
  /** Our ownership tag lives in the record comment so foreign records are never touched. */
  managed: boolean;
  /** Present only for claim-bound Vercel verification records. */
  verificationClaim?: string;
}

export interface DnsProvider {
  readonly name: string;
  listRecords(zoneName: string): Promise<DnsRecord[]>;
  createRecord(record: Omit<DnsRecord, "id">): Promise<void>;
  updateRecord(record: DnsRecord): Promise<void>;
  deleteRecord(record: DnsRecord): Promise<void>;
}

/** The comment we stamp on every record we create; used to recognise our own. */
export const MANAGED_TAG = "managed-by:got-a.page";

/** Per-claim tags keep shared TXT records isolated from routing and manual DNS. */
export function recordTag(record: Pick<DnsRecord, "verificationClaim">): string {
  return record.verificationClaim
    ? `${MANAGED_TAG};verification:vercel:${record.verificationClaim}` : MANAGED_TAG;
}

export function parseRecordTag(name: string, type: string, comment?: string): Pick<DnsRecord, "managed" | "verificationClaim"> {
  if (comment === MANAGED_TAG) return { managed: true };
  const match = /^managed-by:got-a\.page;verification:vercel:([a-z0-9][a-z0-9-]{0,38}[a-z0-9])$/.exec(comment ?? "");
  if (match && name === "_vercel.got-a.page" && type === "TXT") {
    return { managed: true, verificationClaim: match[1] };
  }
  return { managed: false };
}
