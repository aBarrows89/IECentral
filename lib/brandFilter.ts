// Excludes non-tire-brand manufacturerName values that show up in OEIVAL
// (internal account categories, GL type entries, misc wheel buckets, etc.).
// Add patterns here as new junk entries surface.

const EXCLUDE_PATTERNS: RegExp[] = [
  /^(iet|trd)\b/i,   // internal-account prefixes: "IET PART", "TRD MISC WHEEL", etc.
  /\bg\/?l\b/i,      // anything containing "G/L" or "GL " (account-ledger entries)
  /\bmisc\b/i,       // "MISC WHEEL", "MISC TIRE", etc. — never a real brand
  /\bentry\b/i,      // catch-all for "... ENTRY" account labels
];

export function isReportableBrand(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim();
  if (!n) return false;
  return !EXCLUDE_PATTERNS.some((re) => re.test(n));
}
