"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Protected from "@/app/protected";
import Sidebar, { MobileHeader } from "@/components/Sidebar";
import { useTheme } from "@/app/theme-context";
import Link from "next/link";

const PAGE_SIZES = [25, 50, 100];

interface InventoryItem {
  location: string; productType: string; dclass: string; manufacturerCode: string;
  manufacturerName: string; model: string; itemId: string; mfgItemId: string;
  description: string; qtyOnHand: number; qtyCommitted: number; qtyAvailable: number;
  lastCost: number; avgCost: number; extendedValue: number;
  priceRetail: number; priceCommercial: number; priceWholesale: number;
  [key: string]: unknown;
}

interface Filters { locations: string[]; brands: string[]; productTypes: string[]; dclasses: string[] }

export default function InventoryReportPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [location, setLocation] = useState("");
  const [brand, setBrand] = useState("");
  const [productType, setProductType] = useState("");
  const [dclass, setDclass] = useState("");
  const [sortCol, setSortCol] = useState("manufacturerName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [filters, setFilters] = useState<Filters>({ locations: [], brands: [], productTypes: [], dclasses: [] });
  const [fileDate, setFileDate] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Fetch data from S3-backed API
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (location) params.set("location", location);
    if (brand) params.set("brand", brand);
    if (productType) params.set("productType", productType);
    if (dclass) params.set("dclass", dclass);

    fetch(`/api/reports/inventory-data?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setItems(data.items || []);
        setFilters(data.filters || { locations: [], brands: [], productTypes: [], dclasses: [] });
        setFileDate(data.fileDate);
        setError("");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [location, brand, productType, dclass]);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const av = a[sortCol]; const bv = b[sortCol];
      const cmp = String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [items, sortCol, sortDir]);

  const paged = useMemo(() => sorted.slice(page * pageSize, (page + 1) * pageSize), [sorted, page, pageSize]);
  const totalPages = Math.ceil(sorted.length / pageSize);

  const handleSort = useCallback((col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
    setPage(0);
  }, [sortCol]);

  const fmtCurrency = (n: number) => `$${n.toFixed(2)}`;

  const handleExportCSV = useCallback(() => {
    if (sorted.length === 0) return;
    const headers = ["Location", "Description", "Product Type", "D-Class", "Brand", "Model", "Item ID", "Qty On Hand", "Qty Committed", "Qty Available", "Last Cost", "Avg Cost", "Extended Value"];
    const csv = [headers.join(","), ...sorted.map((r) => [r.location, `"${r.description}"`, r.productType, r.dclass, r.manufacturerName, r.model, r.itemId, r.qtyOnHand, r.qtyCommitted, r.qtyAvailable, r.lastCost, r.avgCost, r.extendedValue].join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `inventory-${new Date().toISOString().split("T")[0]}.csv`; link.click();
  }, [sorted]);

  const handleExportExcel = useCallback(async () => {
    if (sorted.length === 0) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const data = [["Location", "Description", "Product Type", "D-Class", "Brand", "Model", "Item ID", "On Hand", "Committed", "Available", "Last Cost", "Avg Cost", "Ext Value"], ...sorted.map((r) => [r.location, r.description, r.productType, r.dclass, r.manufacturerName, r.model, r.itemId, r.qtyOnHand, r.qtyCommitted, r.qtyAvailable, r.lastCost, r.avgCost, r.extendedValue])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "Inventory");
    XLSX.writeFile(wb, `inventory-${new Date().toISOString().split("T")[0]}.xlsx`);
  }, [sorted]);

  const cols: { key: string; label: string; align?: string }[] = [
    { key: "location", label: "Location" }, { key: "description", label: "Description" },
    { key: "productType", label: "Type" }, { key: "dclass", label: "D-Class" },
    { key: "manufacturerName", label: "Brand" }, { key: "model", label: "Model" },
    { key: "itemId", label: "Item ID" }, { key: "qtyOnHand", label: "On Hand", align: "right" },
    { key: "qtyCommitted", label: "Committed", align: "right" }, { key: "qtyAvailable", label: "Available", align: "right" },
    { key: "lastCost", label: "Last Cost", align: "right" }, { key: "avgCost", label: "Avg Cost", align: "right" },
    { key: "extendedValue", label: "Ext Value", align: "right" },
  ];

  return (
    <Protected>
      <div className="flex h-screen theme-bg-primary">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <MobileHeader />
          <header className={`sticky top-0 z-10 border-b px-6 py-4 ${isDark ? "bg-slate-900/95 backdrop-blur border-slate-700" : "bg-white/95 backdrop-blur border-gray-200"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link href="/reports" className={`p-2 rounded-lg transition-colors ${isDark ? "hover:bg-slate-800 text-slate-400" : "hover:bg-gray-200 text-gray-500"}`}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                </Link>
                <div>
                  <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Inventory Report</h1>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                    {fileDate ? `Data from ${new Date(fileDate).toLocaleDateString()}` : loading ? "Loading..." : "No data — upload an OEIVAL report"}
                    {sorted.length > 0 && ` — ${sorted.length} items`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleExportCSV} disabled={sorted.length === 0} className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-100 text-emerald-700"}`}>CSV</button>
                <button onClick={handleExportExcel} disabled={sorted.length === 0} className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700"}`}>Excel</button>
              </div>
            </div>
          </header>

          <div className="px-6 py-4">
            {error && <div className={`rounded-xl border p-4 mb-4 ${isDark ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}>{error}</div>}

            {/* Filters */}
            <div className={`flex flex-wrap gap-3 mb-4 p-4 rounded-xl border ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
              {[
                { val: location, set: setLocation, opts: filters.locations, label: "All Warehouses" },
                { val: brand, set: setBrand, opts: filters.brands, label: "All Brands" },
                { val: productType, set: setProductType, opts: filters.productTypes, label: "All Product Types" },
                { val: dclass, set: setDclass, opts: filters.dclasses, label: "All D-Classes" },
              ].map(({ val, set, opts, label }) => (
                <select key={label} value={val} onChange={(e) => { set(e.target.value); setPage(0); }} className={`px-3 py-1.5 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`}>
                  <option value="">{label}</option>
                  {opts.map((o) => <option key={o} value={o}>{o || "(blank)"}</option>)}
                </select>
              ))}
              {(location || brand || productType || dclass) && (
                <button onClick={() => { setLocation(""); setBrand(""); setProductType(""); setDclass(""); setPage(0); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${isDark ? "text-red-400" : "text-red-600"}`}>Clear</button>
              )}
            </div>

            {/* Table */}
            <div className={`rounded-xl border overflow-hidden ${isDark ? "border-slate-700" : "border-gray-200"}`}>
              {loading ? (
                <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className={`sticky top-0 ${isDark ? "bg-slate-800" : "bg-gray-50"}`}>
                      <tr>
                        {cols.map((col) => (
                          <th key={col.key} onClick={() => handleSort(col.key)}
                            className={`px-3 py-2.5 font-semibold whitespace-nowrap cursor-pointer select-none ${col.align === "right" ? "text-right" : "text-left"} ${isDark ? "text-slate-300 border-b border-slate-700 hover:bg-slate-700" : "text-gray-600 border-b border-gray-200 hover:bg-gray-100"}`}>
                            {col.label}{sortCol === col.key && <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paged.length === 0 ? (
                        <tr><td colSpan={cols.length} className={`px-3 py-8 text-center ${isDark ? "text-slate-500" : "text-gray-400"}`}>No data</td></tr>
                      ) : paged.map((item, i) => (
                        <tr key={i} className={`border-b ${i % 2 ? isDark ? "bg-slate-800/30" : "bg-gray-50/50" : ""} ${isDark ? "border-slate-700/30 hover:bg-slate-700/20" : "border-gray-100 hover:bg-gray-50"}`}>
                          <td className={`px-3 py-1.5 ${isDark ? "text-slate-300" : "text-gray-700"}`}>{item.location}</td>
                          <td className={`px-3 py-1.5 font-medium min-w-[250px] ${isDark ? "text-white" : "text-gray-900"}`}>{item.description}</td>
                          <td className={`px-3 py-1.5 ${isDark ? "text-slate-400" : "text-gray-500"}`}>{item.productType}</td>
                          <td className={`px-3 py-1.5 font-mono ${isDark ? "text-slate-400" : "text-gray-500"}`}>{item.dclass || "—"}</td>
                          <td className={`px-3 py-1.5 ${isDark ? "text-slate-300" : "text-gray-700"}`}>{item.manufacturerName}</td>
                          <td className={`px-3 py-1.5 ${isDark ? "text-slate-400" : "text-gray-500"}`}>{item.model}</td>
                          <td className={`px-3 py-1.5 font-mono text-[10px] ${isDark ? "text-slate-500" : "text-gray-400"}`}>{item.itemId}</td>
                          <td className={`px-3 py-1.5 text-right font-medium ${isDark ? "text-white" : "text-gray-900"}`}>{item.qtyOnHand}</td>
                          <td className={`px-3 py-1.5 text-right ${isDark ? "text-slate-400" : "text-gray-500"}`}>{item.qtyCommitted}</td>
                          <td className={`px-3 py-1.5 text-right ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>{item.qtyAvailable}</td>
                          <td className={`px-3 py-1.5 text-right ${isDark ? "text-slate-300" : "text-gray-700"}`}>{fmtCurrency(item.lastCost)}</td>
                          <td className={`px-3 py-1.5 text-right ${isDark ? "text-slate-300" : "text-gray-700"}`}>{fmtCurrency(item.avgCost)}</td>
                          <td className={`px-3 py-1.5 text-right font-medium ${isDark ? "text-cyan-400" : "text-blue-600"}`}>{fmtCurrency(item.extendedValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {sorted.length > 0 && (
                <div className={`flex items-center justify-between px-4 py-3 border-t ${isDark ? "bg-slate-800 border-slate-700" : "bg-gray-50 border-gray-200"}`}>
                  <span className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} of {sorted.length}</span>
                  <div className="flex items-center gap-2">
                    <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} className={`px-2 py-1 rounded border text-xs ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`}>
                      {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}/page</option>)}
                    </select>
                    <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className={`px-2 py-1 rounded text-xs disabled:opacity-30 ${isDark ? "text-slate-300" : "text-gray-700"}`}>Prev</button>
                    <span className={`text-xs ${isDark ? "text-slate-500" : "text-gray-400"}`}>{page + 1}/{totalPages || 1}</span>
                    <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className={`px-2 py-1 rounded text-xs disabled:opacity-30 ${isDark ? "text-slate-300" : "text-gray-700"}`}>Next</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </Protected>
  );
}
