/**
 * Subdomain name rules.
 * A name is the JSON filename without ".json" and becomes <name>.got-a.page.
 * Rules mirror what DNS and TLS allow, so a name that passes here works everywhere.
 *
 * The rules are a table: each row knows how to detect its problem, how to
 * state it, and how to suggest a concrete fix, so the PR comment can say what
 * to change instead of only what is wrong.
 */

export const NAME_MIN = 2;
export const NAME_MAX = 40;

const NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export interface NameProblem {
  problem: string;
  suggestion?: string;
}

/**
 * A concrete shorter name to offer when `raw` is over the limit: drop whole
 * trailing words (hyphen-separated) until it fits, hard-truncating a single
 * over-long word. The result never has an edge hyphen.
 */
function shortenedCandidate(raw: string): string {
  let candidate = raw;
  while (candidate.length > NAME_MAX) {
    const cut = candidate.lastIndexOf("-");
    if (cut < NAME_MIN) {
      candidate = candidate.slice(0, NAME_MAX);
      break;
    }
    candidate = candidate.slice(0, cut);
  }
  return candidate.replace(/-+$/, "");
}

/** Lowercase, map any run of disallowed characters to one hyphen, trim edge hyphens. */
function sanitizedCandidate(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The name with any leading/trailing hyphens removed. */
function trimmedCandidate(raw: string): string {
  return raw.replace(/^-+|-+$/g, "");
}

interface NameRule {
  applies: (raw: string) => boolean;
  problem: (raw: string) => string;
  suggestion?: (raw: string) => string | undefined;
}

const NAME_RULES: NameRule[] = [
  {
    applies: (raw) => raw.length > NAME_MAX,
    problem: (raw) => `must be ${NAME_MIN}-${NAME_MAX} characters (got ${raw.length})`,
    suggestion: (raw) => `Try dropping a word, like "${shortenedCandidate(raw)}"`,
  },
  {
    applies: (raw) => raw.length < NAME_MIN,
    problem: (raw) => `must be ${NAME_MIN}-${NAME_MAX} characters (got ${raw.length})`,
    suggestion: () => `Make it at least ${NAME_MIN} characters long`,
  },
  {
    applies: (raw) => !/^[a-z0-9-]+$/.test(raw),
    problem: () => "only lowercase a-z, 0-9 and hyphens are allowed",
    suggestion: (raw) => {
      const candidate = sanitizedCandidate(raw);
      return candidate && candidate !== raw ? `Try "${candidate}"` : undefined;
    },
  },
  {
    applies: (raw) => raw.startsWith("-") || raw.endsWith("-"),
    problem: () => "cannot start or end with a hyphen",
    suggestion: (raw) => {
      const candidate = trimmedCandidate(raw);
      return candidate && candidate !== raw ? `Try "${candidate}"` : undefined;
    },
  },
];

/** Returns the name's problems, each with a suggested fix where one can be offered. */
export function nameIssues(raw: string): NameProblem[] {
  const issues: NameProblem[] = [];
  for (const rule of NAME_RULES) {
    if (rule.applies(raw)) {
      issues.push({ problem: rule.problem(raw), suggestion: rule.suggestion?.(raw) });
    }
  }
  if (raw.length >= NAME_MIN && !NAME_PATTERN.test(raw) && issues.length === 0) {
    issues.push({ problem: "is not a valid DNS name" });
  }
  return issues;
}

/** Returns a list of human-friendly problems; empty list means the name is valid. */
export function nameProblems(raw: string): string[] {
  return nameIssues(raw).map((issue) => issue.problem);
}
