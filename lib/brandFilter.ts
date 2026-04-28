// Excludes non-tire-brand manufacturerName values that show up in OEIVAL.
// Curated from the full brand list (286 unique entries as of 2026-04-28)
// against the IET-oeival.csv extract — verified that no real tire brand
// in the source data is incidentally matched.
//
// Add patterns here as new junk entries surface.

const EXCLUDE_PATTERNS: RegExp[] = [
  // Internal account / department prefixes
  /^iet\b/i,                 // IET 'PART', IET 'TIRE', IET G/L TYPE ENTRY, IET RETREADING
  /^trd\b/i,                 // TRD FEE, TRD G, TRD MISC PART/TIRE/WHEEL
  /^aws\b/i,                 // AWS INC
  /^impwh\b/i,               // IMPWH (does not match IMPERIAL)
  // Account / ledger / fee labels
  /\bg\/?l\b/i,              // GL or G/L
  /\bentry\b/i,              // ... TYPE ENTRY
  /\bfee\b/i,                // TRD FEE
  /\bmisc(ellaneous)?\b/i,   // MISCELLANEOUS, ... MISC ...
  // Distributors / suppliers
  /\bsales\b/i,              // MOHAWK RUBBER SALES
  /\bsupply\b/i,             // MYERS TIRE SUPPLY
  /\bpurchase\b/i,           // OUTSIDE PURCHASE
  /\bparts?\b/i,             // HALKO PARTS, IET 'PART', TRD MISC PART
  /^co[\s-]?op\b/i,          // CO-OP TUBES (does not match COOPER)
  /\bcable\s+ties?\b/i,      // CABLE TIES AND MORE
  // Services
  /\bretreading\b/i,         // MM/IET/TTC RETREADING
  /\bprotect\w*\b/i,         // TIRE PROTECTION + TIRE PROTECTON (typo) variants
  // Non-tire products
  /\btubes?\b/i,             // CO-OP TUBES
  /\bwheels?\b/i,            // PAC WHEELS, TRD MISC WHEEL
  /\bplombco\b/i,            // wheel-weight manufacturer, not tires
  /^equal$/i,                // EQUAL = balance beads, not tires
];

export function isReportableBrand(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim();
  if (!n) return false;
  return !EXCLUDE_PATTERNS.some((re) => re.test(n));
}
