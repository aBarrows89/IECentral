// Extract tire dimensions from a description string for stable sorting.
// Handles forms like "195/60R15", "LT265/70R17", "P225/75R16", "215/45ZR17".

const TIRE_RE = /(?:LT|P|ST)?(\d{2,3})\/(\d{2,3})(?:Z?R)(\d{2})/i;

export interface TireDims {
  width: number;  // section width (mm)
  aspect: number; // aspect ratio
  rim: number;    // rim diameter (in)
}

export function parseTireDims(description: string): TireDims | null {
  const m = TIRE_RE.exec(description);
  if (!m) return null;
  return { width: parseInt(m[1], 10), aspect: parseInt(m[2], 10), rim: parseInt(m[3], 10) };
}

// Sort key: rim → width → aspect, ascending. Returns Infinity for unparseable rows
// so they sink to the bottom of their brand group.
export function tireSortKey(description: string): [number, number, number] {
  const d = parseTireDims(description);
  if (!d) return [Infinity, Infinity, Infinity];
  return [d.rim, d.width, d.aspect];
}
