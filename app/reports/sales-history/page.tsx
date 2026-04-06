"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Protected from "@/app/protected";
import Sidebar, { MobileHeader } from "@/components/Sidebar";
import { useTheme } from "@/app/theme-context";
import Link from "next/link";

const PAGE_SIZES = [25, 50, 100];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtMonth(m: string): string { const [y, mo] = m.split("-"); return `${MONTH_NAMES[parseInt(mo) - 1]} ${y?.slice(2)}`; }

interface SalesItem {
  itemId: string; dclass: string; mfgItemId: string; brand: string;
  manufacturerName?: string; model: string; description: string; productType: string;
  monthlySales: Record<string, number>; total: number; availableStock?: number;
  isColonRow?: boolean; [key: string]: unknown;
}

interface Filters { brands: string[]; productTypes: string[]; dclasses: string[] }

export default function SalesHistoryReportPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [brand, setBrand] = useState("");
  const [productType, setProductType] = useState("");
  const [dclass, setDclass] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [showAllRows, setShowAllRows] = useState(false);
  const [sortCol, setSortCol] = useState("manufacturerName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<SalesItem[]>([]);
  const [monthColumns, setMonthColumns] = useState<string[]>([]);
  const [allMonths, setAllMonths] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>({ brands: [], productTypes: [], dclasses: [] });
  const [fileDate, setFileDate] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (brand) params.set("brand", brand);
    if (productType) params.set("productType", productType);
    if (dclass) params.set("dclass", dclass);
    if (startMonth) params.set("startMonth", startMonth);
    if (endMonth) params.set("endMonth", endMonth);
    if (showAllRows) params.set("showAllRows", "true");

    fetch(`/api/reports/sales-history-data?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setItems(data.items || []);
        setMonthColumns(data.monthColumns || []);
        setAllMonths(data.allAvailableMonths || []);
        setFilters(data.filters || { brands: [], productTypes: [], dclasses: [] });
        setFileDate(data.fileDate);
        setError("");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [brand, productType, dclass, startMonth, endMonth, showAllRows]);

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

  const handleExportCSV = useCallback(() => {
    if (sorted.length === 0) return;
    const headers = ["Description", "Brand", "Model", "Item ID", "Type", "D-Class", ...monthColumns.map(fmtMonth), "Total", "Available"];
    const csv = [headers.join(","), ...sorted.map((r) => [
      `"${r.description}"`, r.manufacturerName, r.model, r.itemId, r.productType, r.dclass,
      ...monthColumns.map((m) => r.monthlySales[m] || 0), r.total, r.availableStock ?? "",
    ].join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `sales-history-${new Date().toISOString().split("T")[0]}.csv`; link.click();
  }, [sorted, monthColumns]);

  const handleExportExcel = useCallback(async () => {
    if (sorted.length === 0) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const headers = ["Description", "Brand", "Model", "Item ID", "Type", "D-Class", ...monthColumns.map(fmtMonth), "Total", "Available"];
    const data = [headers, ...sorted.map((r) => [r.description, r.manufacturerName, r.model, r.itemId, r.productType, r.dclass, ...monthColumns.map((m) => r.monthlySales[m] || 0), r.total, r.availableStock ?? ""])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "Sales History");
    XLSX.writeFile(wb, `sales-history-${new Date().toISOString().split("T")[0]}.xlsx`);
  }, [sorted, monthColumns]);

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
                  <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Sales History</h1>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                    {fileDate ? `Data from ${new Date(fileDate).toLocaleDateString()}` : loading ? "Loading..." : "No data — upload an OEA07V Sales History report"}
                    {sorted.length > 0 && ` — ${sorted.length} items, ${monthColumns.length} months`}
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
            <div className={`flex flex-wrap items-center gap-3 mb-4 p-4 rounded-xl border ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
              <select value={brand} onChange={(e) => { setBrand(e.target.value); setPage(0); }} className={`px-3 py-1.5 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`}>
                <option value="">All Brands</option>
                {filters.brands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <select value={productType} onChange={(e) => { setProductType(e.target.value); setPage(0); }} className={`px-3 py-1.5 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`}>
                <option value="">All Types</option>
                {filters.productTypes.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={dclass} onChange={(e) => { setDclass(e.target.value); setPage(0); }} className={`px-3 py-1.5 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`}>
                <option value="">All D-Classes</option>
                {filters.dclasses.map((d) => <option key={d} value={d}>{d || "(blank)"}</option>)}
              </select>

              <div className={`h-6 w-px ${isDark ? "bg-slate-700" : "bg-gray-200"}`} />

              {/* Date Range */}
              <select value={startMonth} onChange={(e) => { setStartMonth(e.target.value); setPage(0); }} className={`px-3 py-1.5 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`}>
                <option value="">Start Month</option>
                {allMonths.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
              </select>
              <span className={`text-xs ${isDark ? "text-slate-500" : "text-gray-400"}`}>to</span>
              <select value={endMonth} onChange={(e) => { setEndMonth(e.target.value); setPage(0); }} className={`px-3 py-1.5 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`}>
                <option value="">End Month</option>
                {allMonths.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
              </select>

              <label className={`flex items-center gap-1.5 text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                <input type="checkbox" checked={showAllRows} onChange={(e) => setShowAllRows(e.target.checked)} className="rounded" />
                All rows
              </label>

              {(brand || productType || dclass || startMonth || endMonth) && (
                <button onClick={() => { setBrand(""); setProductType(""); setDclass(""); setStartMonth(""); setEndMonth(""); setPage(0); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${isDark ? "text-red-400" : "text-red-600"}`}>Clear</button>
              )}
            </div>

            {/* Table */}
            <div className={`rounded-xl border overflow-hidden ${isDark ? "border-slate-700" : "border-gray-200"}`}>
              {loading ? (
                <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : !fileDate && items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <svg className={`w-14 h-14 mb-4 ${isDark ? "text-slate-700" : "text-gray-300"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className={`text-sm font-medium mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>No sales history data available</p>
                  <p className={`text-xs text-center max-w-sm ${isDark ? "text-slate-500" : "text-gray-400"}`}>
                    Upload OEA07V daily sales reports through{" "}
                    <Link href="/reports/upload" className={`underline ${isDark ? "text-cyan-400" : "text-blue-600"}`}>Upload Reports</Link>{" "}
                    to see monthly sales totals here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className={`sticky top-0 ${isDark ? "bg-slate-800" : "bg-gray-50"}`}>
                      <tr>
                        {[
                          { key: "description", label: "Description" }, { key: "manufacturerName", label: "Brand" },
                          { key: "model", label: "Model" }, { key: "itemId", label: "Item ID" },
                          { key: "productType", label: "Type" }, { key: "dclass", label: "D-Class" },
                          ...monthColumns.map((m) => ({ key: `m_${m}`, label: fmtMonth(m) })),
                          { key: "total", label: "Total" }, { key: "availableStock", label: "Avail" },
                        ].map((col) => (
                          <th key={col.key} onClick={() => !col.key.startsWith("m_") && handleSort(col.key)}
                            className={`px-3 py-2.5 font-semibold whitespace-nowrap ${col.key.startsWith("m_") || col.key === "total" || col.key === "availableStock" ? "text-right" : "text-left"} ${!col.key.startsWith("m_") ? "cursor-pointer select-none" : ""} ${isDark ? "text-slate-300 border-b border-slate-700 hover:bg-slate-700" : "text-gray-600 border-b border-gray-200 hover:bg-gray-100"}`}>
                            {col.label}{sortCol === col.key && <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paged.length === 0 ? (
                        <tr><td colSpan={6 + monthColumns.length + 2} className={`px-3 py-8 text-center ${isDark ? "text-slate-500" : "text-gray-400"}`}>No data</td></tr>
                      ) : paged.map((item, i) => (
                        <tr key={i} className={`border-b ${i % 2 ? isDark ? "bg-slate-800/30" : "bg-gray-50/50" : ""} ${isDark ? "border-slate-700/30 hover:bg-slate-700/20" : "border-gray-100 hover:bg-gray-50"}`}>
                          <td className={`px-3 py-1.5 font-medium min-w-[220px] ${isDark ? "text-white" : "text-gray-900"}`}>{item.description}</td>
                          <td className={`px-3 py-1.5 ${isDark ? "text-slate-300" : "text-gray-700"}`}>{item.brand || item.manufacturerName}</td>
                          <td className={`px-3 py-1.5 ${isDark ? "text-slate-400" : "text-gray-500"}`}>{item.model}</td>
                          <td className={`px-3 py-1.5 font-mono text-[10px] ${isDark ? "text-slate-500" : "text-gray-400"}`}>{item.itemId}</td>
                          <td className={`px-3 py-1.5 ${isDark ? "text-slate-400" : "text-gray-500"}`}>{item.productType}</td>
                          <td className={`px-3 py-1.5 font-mono ${isDark ? "text-slate-400" : "text-gray-500"}`}>{item.dclass || "—"}</td>
                          {monthColumns.map((m) => {
                            const val = item.monthlySales[m];
                            return (
                              <td key={m} className={`px-3 py-1.5 text-right ${val ? (val < 0 ? "text-red-400" : isDark ? "text-emerald-400" : "text-emerald-600") : isDark ? "text-slate-700" : "text-gray-200"}`}>
                                {val || "—"}
                              </td>
                            );
                          })}
                          <td className={`px-3 py-1.5 text-right font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{item.total}</td>
                          <td className={`px-3 py-1.5 text-right ${isDark ? "text-cyan-400" : "text-blue-600"}`}>{item.availableStock ?? "—"}</td>
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
