// Maps OEIVAL location codes to display names used in report titles.
// Codes confirmed by Andy 2026-04-28.

export const LOCATION_LABELS: Record<string, string> = {
  R10: "Everson",
  R15: "Rodgers",
  R20: "Essey Tire",
  R25: "Export",
  R30: "Jeannette",
  R35: "King's Super Tire",
  W07: "Uniontown",
  W08: "Latrobe",
  W09: "Chestnut Ridge",
};

export function locationLabel(code: string): string {
  return LOCATION_LABELS[code.toUpperCase()] ?? code;
}
