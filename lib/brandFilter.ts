// Excludes non-tire-brand manufacturerName values that show up in OEIVAL
// (internal account categories, GL type entries, misc wheel buckets, etc.).
// Add patterns here as new junk entries surface.

const EXCLUDE_PATTERNS: RegExp[] = [
  /^iet\b/i,           // "IET PART", "IET G/L TYPE ENTRY", etc.
  /\bmisc\s+wheel\b/i, // "TRD MISC WHEEL"
  /^g\/?l\b/i,         // "G/L ..." or "GL ..."
  /\btype\s+entry\b/i, // catch-all for "... TYPE ENTRY"
];

export function isReportableBrand(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim();
  if (!n) return false;
  return !EXCLUDE_PATTERNS.some((re) => re.test(n));
}
