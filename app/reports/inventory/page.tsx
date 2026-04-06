"use client";

import { useState, useMemo, useCallback } from "react";
import Protected from "@/app/protected";
import Sidebar, { MobileHeader } from "@/components/Sidebar";
import { useTheme } from "@/app/theme-context";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";

const PAGE_SIZES = [25, 50, 100];

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

  const report = useQuery(api.reportData.getInventoryReport, {
    location: location || undefined,
    brand: brand || undefined,
    productType: productType || undefined,
    dclass: dclass || undefined,
  });

  const sorted = useMemo(() => {
    if (!report?.items) return [];
    return [...report.items].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortCol];
      const bv = (b as Record<string, unknown>)[sortCol];
      const cmp = String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [report?.items, sortCol, sortDir]);

  const paged = useMemo(() => sorted.slice(page * pageSize, (page + 1) * pageSize), [sorted, page, pageSize]);
  const totalPages = Math.ceil(sorted.length / pageSize);

  const handleSort = useCallback((col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
    setPage(0);
  }, [sortCol]);

  const handleExportCSV = useCallback(() => {
    if (sorted.length === 0) return;
    const headers = ["Location", "Description", "Product Type", "D-Class", "Brand", "Model", "Item ID", "Qty On Hand", "Qty Committed", "Qty Available", "Last Cost", "Avg Cost", "Extended Value"];
    const csv = [
      headers.join(","),
      ...sorted.map((r) => [
        r.location, `"${r.computedDescription}"`, r.productType, r.dclass, r.manufacturerName, r.model || "",
        r.itemId, r.qtyOnHand, r.qtyCommitted, r.qtyAvailable, r.lastCost, r.avgCost, r.extendedValue,
      ].join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `inventory-report-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  }, [sorted]);

  const filters = report?.filters;
  const fmtCurrency = (n: number) => `$${n.toFixed(2)}`;

  const cols = [
    { key: "location", label: "Location", w: "w-16" },
    { key: "computedDescription", label: "Description", w: "min-w-[250px]" },
    { key: "productType", label: "Type", w: "w-12" },
    { key: "dclass", label: "D-Class", w: "w-14" },
    { key: "manufacturerName", label: "Brand", w: "w-24" },
    { key: "model", label: "Model", w: "w-28" },
    { key: "itemId", label: "Item ID", w: "w-32" },
    { key: "qtyOnHand", label: "On Hand", w: "w-16 text-right" },
    { key: "qtyCommitted", label: "Committed", w: "w-16 text-right" },
    { key: "qtyAvailable", label: "Available", w: "w-16 text-right" },
    { key: "lastCost", label: "Last Cost", w: "w-20 text-right" },
    { key: "avgCost", label: "Avg Cost", w: "w-20 text-right" },
    { key: "extendedValue", label: "Ext Value", w: "w-24 text-right" },
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
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </Link>
                <div>
                  <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Inventory Report</h1>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                    {report?.uploadDate ? `Data from ${new Date(report.uploadDate).toLocaleDateString()}` : "No data uploaded yet"}
                    {sorted.length > 0 && ` — ${sorted.length} items`}
                  </p>
                </div>
              </div>
              <button onClick={handleExportCSV} disabled={sorted.length === 0} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${isDark ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"}`}>
                Export CSV
              </button>
            </div>
          </header>

          <div className="px-6 py-4">
            {/* Filters */}
            <div className={`flex flex-wrap gap-3 mb-4 p-4 rounded-xl border ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
              <select value={location} onChange={(e) => { setLocation(e.target.value); setPage(0); }} className={`px-3 py-1.5 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`}>
                <option value="">All Warehouses</option>
                {(filters?.locations || []).map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <select value={brand} onChange={(e) => { setBrand(e.target.value); setPage(0); }} className={`px-3 py-1.5 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`}>
                <option value="">All Brands</option>
                {(filters?.brands || []).map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <select value={productType} onChange={(e) => { setProductType(e.target.value); setPage(0); }} className={`px-3 py-1.5 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`}>
                <option value="">All Product Types</option>
                {(filters?.productTypes || []).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={dclass} onChange={(e) => { setDclass(e.target.value); setPage(0); }} className={`px-3 py-1.5 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`}>
                <option value="">All D-Classes</option>
                {(filters?.dclasses || []).map((d) => <option key={d} value={d}>{d || "(blank)"}</option>)}
              </select>
              {(location || brand || productType || dclass) && (
                <button onClick={() => { setLocation(""); setBrand(""); setProductType(""); setDclass(""); setPage(0); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${isDark ? "text-red-400 hover:bg-red-500/10" : "text-red-600 hover:bg-red-50"}`}>
                  Clear Filters
                </button>
              )}
            </div>

            {/* Table */}
            <div className={`rounded-xl border overflow-hidden ${isDark ? "border-slate-700" : "border-gray-200"}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className={`sticky top-0 ${isDark ? "bg-slate-800" : "bg-gray-50"}`}>
                    <tr>
                      {cols.map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          className={`px-3 py-2.5 font-semibold whitespace-nowrap cursor-pointer select-none ${col.w} ${isDark ? "text-slate-300 border-b border-slate-700 hover:bg-slate-700" : "text-gray-600 border-b border-gray-200 hover:bg-gray-100"}`}
                        >
                          {col.label}
                          {sortCol === col.key && <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paged.length === 0 ? (
                      <tr><td colSpan={cols.length} className={`px-3 py-8 text-center ${isDark ? "text-slate-500" : "text-gray-400"}`}>{report === undefined ? "Loading..." : "No data — upload an OEIVAL report first"}</td></tr>
                    ) : paged.map((item, i) => (
                      <tr key={i} className={`border-b ${i % 2 === 0 ? "" : isDark ? "bg-slate-800/30" : "bg-gray-50/50"} ${isDark ? "border-slate-700/30 hover:bg-slate-700/20" : "border-gray-100 hover:bg-gray-50"}`}>
                        <td className={`px-3 py-1.5 ${isDark ? "text-slate-300" : "text-gray-700"}`}>{item.location}</td>
                        <td className={`px-3 py-1.5 font-medium ${isDark ? "text-white" : "text-gray-900"}`}>{item.computedDescription}</td>
                        <td className={`px-3 py-1.5 ${isDark ? "text-slate-400" : "text-gray-500"}`}>{item.productType}</td>
                        <td className={`px-3 py-1.5 font-mono ${isDark ? "text-slate-400" : "text-gray-500"}`}>{item.dclass || "—"}</td>
                        <td className={`px-3 py-1.5 ${isDark ? "text-slate-300" : "text-gray-700"}`}>{item.manufacturerName}</td>
                        <td className={`px-3 py-1.5 ${isDark ? "text-slate-400" : "text-gray-500"}`}>{item.model || ""}</td>
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

              {/* Pagination */}
              {sorted.length > 0 && (
                <div className={`flex items-center justify-between px-4 py-3 border-t ${isDark ? "bg-slate-800 border-slate-700" : "bg-gray-50 border-gray-200"}`}>
                  <div className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                    Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} of {sorted.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} className={`px-2 py-1 rounded border text-xs ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`}>
                      {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}/page</option>)}
                    </select>
                    <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className={`px-2 py-1 rounded text-xs disabled:opacity-30 ${isDark ? "text-slate-300 hover:bg-slate-700" : "text-gray-700 hover:bg-gray-200"}`}>Prev</button>
                    <span className={`text-xs ${isDark ? "text-slate-500" : "text-gray-400"}`}>{page + 1}/{totalPages}</span>
                    <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className={`px-2 py-1 rounded text-xs disabled:opacity-30 ${isDark ? "text-slate-300 hover:bg-slate-700" : "text-gray-700 hover:bg-gray-200"}`}>Next</button>
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
