// Schedule for OEIVAL inventory snapshot dates.
// Stores are closed Sat/Sun, so a Mon-morning snapshot reflects Friday close.
//   Mon, Sat, Sun → previous Friday
//   Tue–Fri      → previous day

export function computeInventoryReportDate(uploadDate: Date = new Date()): string {
  const d = new Date(uploadDate.getFullYear(), uploadDate.getMonth(), uploadDate.getDate());
  const dow = d.getDay(); // 0=Sun, 1=Mon, 6=Sat
  const daysBack = dow === 1 ? 3 : dow === 0 ? 2 : dow === 6 ? 1 : 1;
  d.setDate(d.getDate() - daysBack);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const INVENTORY_SCHEDULE_NOTE =
  "Inventory snapshots are auto-dated based on upload day:\n" +
  "• Mon → previous Friday (covers Sat/Sun, store closed)\n" +
  "• Tue–Fri → previous day\n" +
  "• Sat/Sun → previous Friday";
