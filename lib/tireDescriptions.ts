/**
 * Format a compressed tire size (e.g., "2055517") into standard format (e.g., "205/55R17").
 * Also handles already-formatted sizes like "205/55R17" or "LT275/55R20".
 */
function formatTireSize(raw: string): string {
  if (!raw) return "";
  // Already formatted
  if (raw.includes("/")) return raw;
  // Compressed: try to parse as width+aspect+rim
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length >= 7) {
    // e.g., 2055517 → 205/55R17, 2756520 → 275/65R20
    const width = digits.slice(0, 3);
    const aspect = digits.slice(3, 5);
    const rim = digits.slice(5);
    return `${width}/${aspect}R${rim}`;
  }
  if (digits.length === 6) {
    // e.g., 185514 → 185/51R4? Unlikely. Try 3+2+1 or 3+1+2
    const width = digits.slice(0, 3);
    const aspect = digits.slice(3, 5);
    const rim = digits.slice(5);
    return `${width}/${aspect}R${rim}`;
  }
  return raw;
}

/**
 * Build a computed tire description from catalog fields.
 * Format: {Size} {LoadIndex}{SpeedRating} {Brand} {Model} {XL/RF} {Ply} {Sidewall}
 */
export function buildTireDescription(tire: {
  mfgName?: string;
  model?: string;
  size?: string;
  loadIndex?: string;
  speedRating?: string;
  xlrf?: string;
  plyRating?: string;
  sidewall?: string;
}): string {
  const parts: string[] = [];
  if (tire.size) parts.push(formatTireSize(tire.size));
  if (tire.loadIndex || tire.speedRating) {
    parts.push(`${tire.loadIndex || ""}${tire.speedRating || ""}`);
  }
  if (tire.mfgName) parts.push(tire.mfgName);
  if (tire.model) parts.push(tire.model);
  if (tire.xlrf) parts.push(tire.xlrf);
  if (tire.plyRating) parts.push(tire.plyRating);
  if (tire.sidewall) parts.push(tire.sidewall);
  return parts.join(" ").trim();
}
