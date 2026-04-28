// Excludes non-tire-brand manufacturerName values that show up in OEIVAL
// (internal account categories, GL type entries, misc wheel buckets, etc.).
// Add patterns here as new junk entries surface.

const EXCLUDE_PATTERNS: RegExp[] = [
  /^(iet|trd)\b/i,        // internal-account prefixes
  /\bg\/?l\b/i,           // "G/L" or "GL " ledger entries
  /\bmisc\b/i,            // never a real brand
  /\bentry\b/i,           // account-label suffix
  /\bsales\b/i,           // distributors: "MOHAWK RUBBER SALES"
  /\bsupply\b/i,          // distributors: "MYERS TIRE SUPPLY"
  /\bpurchase\b/i,        // "OUTSIDE PURCHASE"
  /\bprotection\b/i,      // "TIRE PROTECTION" service
  /\bretreading\b/i,      // services: "MM RETREADING"
  /\btubes?\b/i,          // "CO OP TUBES" — separate product
  /\bwheels?\b/i,         // "PAC WHEELS" — wheels, not tires
  /^co[\s-]?op\b/i,       // "CO OP ..." cooperative supplier
];

export function isReportableBrand(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim();
  if (!n) return false;
  return !EXCLUDE_PATTERNS.some((re) => re.test(n));
}
