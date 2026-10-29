/**
 * Cloudflare adapter (API v4, token auth).
 * Needs a token scoped to Zone > DNS > Edit on the got-a.page zone only,
 * plus the zone id. Both come from secrets; neither is ever printed.
 */

import type { DnsProvider, DnsRecord, RecordType } from "./provider.js";
import { parseRecordTag, recordTag } from "./provider.js";

const API = "https://api.cloudflare.com/client/v4";

interface CfRecord {
  id: string;
  name: string;
  type: string;
  content: string;
  ttl: number;
  comment?: string;
}

export class CloudflareProvider implements DnsProvider {
  readonly name = "cloudflare";
  constructor(
    private token: string,
    private zoneId: string
  ) {
    if (!token || !zoneId) throw new Error("CF_API_TOKEN and CF_ZONE_ID are required.");
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const body = (await res.json()) as { success: boolean; errors?: unknown[]; result: T };
    if (!res.ok || !body.success) {
      // Error payloads can echo request data; log codes only, never bodies.
      throw new Error(`Cloudflare API call failed with HTTP ${res.status}.`);
    }
    return body.result;
  }

  async listRecords(): Promise<DnsRecord[]> {
    const out: DnsRecord[] = [];
    let page = 1;
    for (;;) {
      const result = await this.request<CfRecord[]>(
        `/zones/${this.zoneId}/dns_records?per_page=100&page=${page}`
      );
      for (const r of result) {
        if (!["CNAME", "A", "AAAA", "TXT"].includes(r.type)) continue;
        out.push({
          id: r.id,
          name: r.name,
          type: r.type as RecordType,
          content: r.content,
          ttl: r.ttl,
          ...parseRecordTag(r.name, r.type, r.comment),
        });
      }
      if (result.length < 100) return out;
      page += 1;
    }
  }

  async createRecord(record: Omit<DnsRecord, "id">): Promise<void> {
    await this.request(`/zones/${this.zoneId}/dns_records`, {
      method: "POST",
      body: JSON.stringify({
        name: record.name,
        type: record.type,
        content: record.content,
        ttl: record.ttl,
        comment: recordTag(record),
        proxied: false,
      }),
    });
  }

  async updateRecord(record: DnsRecord): Promise<void> {
    await this.request(`/zones/${this.zoneId}/dns_records/${record.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        content: record.content,
        ttl: record.ttl,
        comment: recordTag(record),
      }),
    });
  }

  async deleteRecord(record: DnsRecord): Promise<void> {
    await this.request(`/zones/${this.zoneId}/dns_records/${record.id}`, { method: "DELETE" });
  }
}
