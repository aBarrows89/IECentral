// Tire-size search helper: lets users type a size with no separators
// ("2656018") and match a description like "265/60R18 H/T BLK".
//
// When the search query reduces to ≥5 digits/letters and the row's
// description contains a tire size (e.g. "265/60R18", "LT265/65R20",
// "215/45ZR17"), match if the joined width+aspect+rim digits contain
// the query digits in either direction (so partial sizes like "26560"
// still hit, and the user can still type the full "26560R18" form).

const TIRE_SIZE_RE = /(\d{2,3})\s*\/\s*(\d{2,3})\s*Z?R\s*(\d{2})/i;

export function tireSizeMatchesQuery(description: string | null | undefined, query: string): boolean {
  if (!description || !query) return false;
  const qNoSep = query.replace(/[^a-z0-9]/gi, "");
  if (qNoSep.length < 5) return false;
  const m = TIRE_SIZE_RE.exec(description);
  if (!m) return false;
  const sizeDigits = m[1] + m[2] + m[3];
  return sizeDigits.includes(qNoSep) || qNoSep.includes(sizeDigits);
}
