"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Protected from "@/app/protected";
import Sidebar, { MobileHeader } from "@/components/Sidebar";
import { useTheme } from "@/app/theme-context";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { LOCATION_LABELS, locationLabel } from "@/lib/locationLabels";
import { tireSortKey } from "@/lib/tireSize";

interface InventoryItem {
  location: string;
  manufacturerName: string;
  mfgItemId: string;
  description: string;
  qtyOnHand: number;
  qtyCommitted: number;
  qtyAvailable: number;
}

function brandAbbr(brand: string): string {
  return brand.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
}

function formatReportDateMMDDYY(ymd: string | null | undefined): string {
  if (!ymd) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return `${m[2]}/${m[3]}/${m[1].slice(2)}`;
}

export default function FilteredInventoryReportPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [location, setLocation] = useState("");
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);

  const latestUpload = useQuery(api.jmkUploads.getLatestByType, { reportType: "oeival" });
  const reportDate = latestUpload?.reportDate ?? null;

  useEffect(() => {
    if (!location) {
      setItems([]);
      setSelectedBrands(new Set());
      return;
    }
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ location });
    fetch(`/api/reports/inventory-data?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setItems(data.items || []);
        setSelectedBrands(new Set());
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [location]);

  const brandsAtLocation = useMemo(() => {
    return [...new Set(items.map((i) => i.manufacturerName).filter(Boolean))].sort();
  }, [items]);

  const toggleBrand = useCallback((brand: string) => {
    setSelectedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand); else next.add(brand);
      return next;
    });
  }, []);

  const selectAllBrands = useCallback(() => setSelectedBrands(new Set(brandsAtLocation)), [brandsAtLocation]);
  const clearBrands = useCallback(() => setSelectedBrands(new Set()), []);

  const filteredRows = useMemo(() => {
    if (!location || selectedBrands.size === 0) return [];
    const rows = items.filter((i) => selectedBrands.has(i.manufacturerName));
    rows.sort((a, b) => {
      const brandCmp = a.manufacturerName.localeCompare(b.manufacturerName);
      if (brandCmp !== 0) return brandCmp;
      const ka = tireSortKey(a.description);
      const kb = tireSortKey(b.description);
      for (let i = 0; i < ka.length; i++) {
        if (ka[i] !== kb[i]) return ka[i] - kb[i];
      }
      return a.description.localeCompare(b.description);
    });
    return rows;
  }, [items, location, selectedBrands]);

  const handleGenerate = useCallback(async () => {
    if (filteredRows.length === 0) return;
    setGenerating(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTableModule = await import("jspdf-autotable");
      const autoTable = (autoTableModule.default || autoTableModule) as typeof import("jspdf-autotable").default;

      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const storeName = locationLabel(location);
      const sortedBrands = [...selectedBrands].sort();
      const abbrs = sortedBrands.map(brandAbbr).join("/");
      const title = `${storeName} - Inventory (${abbrs})`;
      const dateStr = formatReportDateMMDDYY(reportDate);
      const footerLeft = `${storeName} Filtered - ${dateStr}`;

      const head = [["Manufacturer", "Mfg Number", "Description", "Qty On Hand", "Qty Committed", "Qty Available"]];
      const body = filteredRows.map((r) => [
        r.manufacturerName,
        r.mfgItemId,
        r.description,
        String(r.qtyOnHand),
        String(r.qtyCommitted),
        String(r.qtyAvailable),
      ]);

      autoTable(doc, {
        head,
        body,
        startY: 60,
        margin: { top: 60, bottom: 50, left: 36, right: 36 },
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [37, 99, 154], textColor: 255, fontStyle: "bold", halign: "center" },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 80 },
          2: { cellWidth: 200 },
          3: { halign: "center", cellWidth: 60 },
          4: { halign: "center", cellWidth: 60 },
          5: { halign: "center", cellWidth: 60 },
        },
        didDrawPage: () => {
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text(title, pageWidth / 2, 36, { align: "center" });
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          const pageNum = doc.getNumberOfPages();
          const pageLabel = `Page ${doc.getCurrentPageInfo().pageNumber} of ${pageNum}`;
          doc.text(footerLeft, 36, pageHeight - 24);
          doc.text(pageLabel, pageWidth - 36, pageHeight - 24, { align: "right" });
        },
      });

      const total = doc.getNumberOfPages();
      for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(`Page ${i} of ${total}`, pageWidth - 36, pageHeight - 24, { align: "right" });
      }

      const fileSlug = storeName.replace(/[^A-Za-z0-9]+/g, "_");
      const fileDate = dateStr.replace(/\//g, "");
      doc.save(`${fileSlug}_filtered_${fileDate || "snapshot"}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF generation failed");
    } finally {
      setGenerating(false);
    }
  }, [filteredRows, location, selectedBrands, reportDate]);

  const locationOptions = useMemo(() => Object.keys(LOCATION_LABELS).sort(), []);

  return (
    <Protected>
      <div className="flex h-screen theme-bg-primary">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <MobileHeader />
          <header className={`sticky top-0 z-10 border-b px-4 sm:px-6 py-4 ${isDark ? "bg-slate-900/95 backdrop-blur border-slate-700" : "bg-white/95 backdrop-blur border-gray-200"}`}>
            <div className="flex items-center gap-3">
              <Link href="/reports/inventory" className={`p-2 rounded-lg transition-colors ${isDark ? "hover:bg-slate-800 text-slate-400" : "hover:bg-gray-200 text-gray-500"}`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Filtered Inventory Report</h1>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                  {reportDate
                    ? `Snapshot date: ${formatReportDateMMDDYY(reportDate)}`
                    : "No OEIVAL upload found — upload one to set the snapshot date"}
                </p>
              </div>
            </div>
          </header>

          <div className="px-4 sm:px-6 py-6 max-w-3xl space-y-5">
            {error && (
              <div className={`rounded-xl border p-4 ${isDark ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}>
                {error}
              </div>
            )}

            {/* Location picker */}
            <div className={`rounded-xl border p-5 ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
              <label className={`block text-xs font-medium mb-2 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Location</label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300 text-gray-900"}`}
              >
                <option value="">— Select a location —</option>
                {locationOptions.map((code) => (
                  <option key={code} value={code}>{code} — {LOCATION_LABELS[code]}</option>
                ))}
              </select>
            </div>

            {/* Brand picker */}
            {location && (
              <div className={`rounded-xl border p-5 ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-gray-600"}`}>
                    Brands ({selectedBrands.size} selected)
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllBrands}
                      disabled={brandsAtLocation.length === 0}
                      className={`text-xs px-2 py-1 rounded disabled:opacity-40 ${isDark ? "text-cyan-400 hover:bg-slate-700" : "text-blue-600 hover:bg-gray-100"}`}
                    >Select all</button>
                    <button
                      type="button"
                      onClick={clearBrands}
                      disabled={selectedBrands.size === 0}
                      className={`text-xs px-2 py-1 rounded disabled:opacity-40 ${isDark ? "text-slate-400 hover:bg-slate-700" : "text-gray-500 hover:bg-gray-100"}`}
                    >Clear</button>
                  </div>
                </div>
                {loading ? (
                  <p className={`text-xs py-3 ${isDark ? "text-slate-500" : "text-gray-400"}`}>Loading inventory...</p>
                ) : brandsAtLocation.length === 0 ? (
                  <p className={`text-xs py-3 ${isDark ? "text-slate-500" : "text-gray-400"}`}>No items at this location.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-72 overflow-y-auto">
                    {brandsAtLocation.map((brand) => {
                      const checked = selectedBrands.has(brand);
                      return (
                        <label key={brand} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs ${isDark ? "hover:bg-slate-700 text-slate-300" : "hover:bg-gray-50 text-gray-700"}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleBrand(brand)} className="rounded w-3.5 h-3.5" />
                          <span className="truncate">{brand}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Generate */}
            {location && selectedBrands.size > 0 && (
              <div className={`rounded-xl border p-5 ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>
                      {filteredRows.length.toLocaleString()} items will appear in the report
                    </p>
                    <p className={`text-xs mt-0.5 ${isDark ? "text-slate-500" : "text-gray-500"}`}>
                      {locationLabel(location)} — {[...selectedBrands].sort().map(brandAbbr).join("/")}
                    </p>
                  </div>
                  <button
                    onClick={handleGenerate}
                    disabled={generating || filteredRows.length === 0}
                    className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${isDark ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
                  >
                    {generating ? "Generating..." : "Generate PDF"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </Protected>
  );
}
