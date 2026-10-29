/** Shared shapes for page claims, kept dependency-free so every script speaks the same language. */

export type Mode = "point" | "instant";
export type InstantType = "person" | "product" | "project" | "community" | "event";

export interface Owner {
  github: string;
  contact?: string;
}

export interface DnsRecords {
  CNAME?: string;
  A?: string[];
  AAAA?: string[];
  TXT?: string[];
}

export interface PageLink {
  label: string;
  url: string;
}

export interface PageSection {
  heading: string;
  text?: string;
}

export interface ProductExtras {
  launchDate?: string;
  cta?: { label: string; url: string };
  features?: string[];
  screenshots?: string[];
}

export interface InstantPage {
  type: InstantType;
  title: string;
  tagline?: string;
  avatar?: string;
  theme?: string;
  links?: PageLink[];
  sections?: PageSection[];
  product?: ProductExtras;
}

export interface PageClaim {
  mode: Mode;
  owner: Owner;
  purpose?: string;
  showcase?: boolean;
  records?: DnsRecords;
  /** Exact Vercel TXT value for this claim only; destination is fixed by the sync. */
  verification?: { vercel: string };
  page?: InstantPage;
}

/** One validated file: the subdomain plus the claim it carries. */
export interface ClaimedPage {
  name: string;
  claim: PageClaim;
}

export interface Limits {
  maxPagesPerAccount: number;
  dnsRecordBudget: number;
  supportedInstantTypes: InstantType[];
  features: { mxRecords: boolean };
}
