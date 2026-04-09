/**
 * Build a computed tire description from catalog fields.
 * Format: {Brand} {Model} {Size} {LoadIndex}{SpeedRating} {XL/RF} {Sidewall}
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
  if (tire.mfgName) parts.push(tire.mfgName);
  if (tire.model) parts.push(tire.model);
  if (tire.size) parts.push(tire.size);
  if (tire.loadIndex || tire.speedRating) {
    parts.push(`${tire.loadIndex || ""}${tire.speedRating || ""}`);
  }
  if (tire.xlrf) parts.push(tire.xlrf);
  if (tire.plyRating) parts.push(tire.plyRating);
  if (tire.sidewall) parts.push(tire.sidewall);
  return parts.join(" ").trim();
}
