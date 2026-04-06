"use client";

import { useState, useCallback, useEffect } from "react";
import Protected from "@/app/protected";
import Sidebar, { MobileHeader } from "@/components/Sidebar";
import { useTheme } from "@/app/theme-context";
import Link from "next/link";

const SOURCE_TYPES = [
  { code: "OEA07V", label: "OEA07V — Sales Activity Detail" },
  { code: "ART24T", label: "ART24T — Transaction Analysis" },
  { code: "ART30S", label: "ART30S — Sales Summary" },
];

const COLUMN_OPTIONS: Record<string, { key: string; name: string; defaultOn: boolean }[]> = {
  OEA07V: [
    { key: "itemId", name: "Item ID", defaultOn: true },
    { key: "description", name: "Description", defaultOn: true },
    { key: "sidewall", name: "Sidewall", defaultOn: false },
    { key: "productType", name: "Product Type", defaultOn: true },
    { key: "brand", name: "Brand", defaultOn: true },
    { key: "mfgItemId", name: "MFG Item ID", defaultOn: true },
    { key: "location", name: "Location", defaultOn: true },
    { key: "transaction", name: "Transaction", defaultOn: true },
    { key: "qty", name: "Qty", defaultOn: true },
    { key: "unitCost", name: "Unit Cost", defaultOn: true },
    { key: "extCost", name: "Ext Cost", defaultOn: true },
    { key: "unitSell", name: "Unit Sell", defaultOn: false },
    { key: "extSell", name: "Ext Sell", defaultOn: false },
    { key: "accountId", name: "Account ID", defaultOn: true },
    { key: "invoiceId", name: "Invoice ID", defaultOn: false },
    { key: "activityDate", name: "Activity Date", defaultOn: true },
    { key: "customerName", name: "Customer Name", defaultOn: true },
  ],
  ART24T: [
    { key: "arAccountId", name: "A/R Account ID", defaultOn: true },
    { key: "invoiceId", name: "Invoice ID", defaultOn: true },
    { key: "transDate", name: "Trans Date", defaultOn: true },
    { key: "location", name: "Location", defaultOn: true },
    { key: "productType", name: "Product Type", defaultOn: true },
    { key: "brand", name: "Brand", defaultOn: true },
    { key: "itemId", name: "Item ID", defaultOn: true },
    { key: "description", name: "Description", defaultOn: true },
    { key: "qty", name: "Qty Delivered", defaultOn: true },
    { key: "totalAmt", name: "Total Amount", defaultOn: true },
    { key: "totalCost", name: "Total Cost", defaultOn: true },
    { key: "grossProfit", name: "Gross Profit", defaultOn: false },
    { key: "unitPrice", name: "Unit Price", defaultOn: false },
    { key: "unitCogs", name: "Unit COGS", defaultOn: false },
    { key: "profitPct", name: "Profit %", defaultOn: false },
    { key: "customerName", name: "Customer Name", defaultOn: true },
  ],
  ART30S: [
    { key: "accountId", name: "Account", defaultOn: true },
    { key: "invoiceId", name: "Invoice", defaultOn: true },
    { key: "transDate", name: "Trans Date", defaultOn: true },
    { key: "location", name: "Location", defaultOn: true },
    { key: "itemId", name: "Item", defaultOn: true },
    { key: "description", name: "Description", defaultOn: true },
    { key: "qty", name: "Qty", defaultOn: true },
    { key: "amount", name: "Amount", defaultOn: true },
  ],
};

type RunState = "idle" | "loading" | "success" | "error";

export default function CustomReportPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [sourceType, setSourceType] = useState("OEA07V");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    COLUMN_OPTIONS.OEA07V.filter((c) => c.defaultOn).map((c) => c.key)
  );
  const [excludeTransactions, setExcludeTransactions] = useState<string[]>([]);
  const [negateQty, setNegateQty] = useState(true);
  const [filterBrand, setFilterBrand] = useState("");
  const [filterAccount, setFilterAccount] = useState("");
  const [runState, setRunState] = useState<RunState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [columns, setColumns] = useState<{ key: string; name: string }[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [availableTransactions, setAvailableTransactions] = useState<string[]>([]);
  const [availableBrands, setAvailableBrands] = useState<string[]>([]);

  const columnOptions = COLUMN_OPTIONS[sourceType] || [];

  // Set default dates (current month)
  useEffect(() => {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    setStartDate(firstOfMonth.toISOString().split("T")[0]);
    setEndDate(now.toISOString().split("T")[0]);
  }, []);

  const handleSourceChange = useCallback((code: string) => {
    setSourceType(code);
    setSelectedColumns((COLUMN_OPTIONS[code] || []).filter((c) => c.defaultOn).map((c) => c.key));
    setRows([]);
    setRunState("idle");
  }, []);

  const toggleColumn = useCallback((key: string) => {
    setSelectedColumns((prev) => prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]);
  }, []);

  // Derive months from date range
  function getMonthsFromRange(start: string, end: string): string[] {
    if (!start || !end) return [];
    const months: string[] = [];
    const s = new Date(start);
    const e = new Date(end);
    const cursor = new Date(s.getFullYear(), s.getMonth(), 1);
    while (cursor <= e) {
      months.push(`${cursor.getFullYear()}${String(cursor.getMonth() + 1).padStart(2, "0")}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  }

  const handleGenerate = useCallback(async () => {
    if (!startDate || !endDate || selectedColumns.length === 0) return;
    const months = getMonthsFromRange(startDate, endDate);
    if (months.length === 0) return;

    setRunState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/reports/custom-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType: sourceType, months, selectedColumns }),
      });
      const data = await res.json();
      if (!res.ok) { setRunState("error"); setErrorMsg(data.error); return; }

      setColumns(data.columns);
      setAllRows(data.rows);
      setTotalRows(data.totalRows);
      setTruncated(data.truncated);
      setAvailableMonths(months);

      // Extract unique transaction codes and brands for filter dropdowns
      const txns = new Set<string>();
      const brands = new Set<string>();
      for (const row of data.rows) {
        if (row.transaction) txns.add(row.transaction);
        if (row.brand) brands.add(row.brand);
      }
      setAvailableTransactions([...txns].sort());
      setAvailableBrands([...brands].sort());

      // Apply filters
      let filtered = data.rows;
      if (excludeTransactions.length > 0) {
        filtered = filtered.filter((r: Record<string, string>) => !excludeTransactions.includes(r.transaction || ""));
      }
      if (filterBrand) {
        filtered = filtered.filter((r: Record<string, string>) => r.brand === filterBrand);
      }
      if (filterAccount) {
        filtered = filtered.filter((r: Record<string, string>) => (r.accountId || "").includes(filterAccount));
      }
      // Negate quantities for display (sales are negative in OEA07V)
      if (negateQty && sourceType === "OEA07V") {
        filtered = filtered.map((r: Record<string, string>) => {
          const copy = { ...r };
          if (copy.qty) copy.qty = String(-parseFloat(copy.qty) || 0);
          if (copy.extCost) copy.extCost = String(-parseFloat(copy.extCost) || 0);
          if (copy.extSell) copy.extSell = String(-parseFloat(copy.extSell) || 0);
          return copy;
        });
      }
      setRows(filtered);
      setRunState("success");
    } catch (err) {
      setRunState("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to generate report");
    }
  }, [sourceType, startDate, endDate, selectedColumns]);

  const handleExportCSV = useCallback(() => {
    if (rows.length === 0) return;
    const headers = columns.map((c) => c.name);
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        columns.map((c) => {
          const val = row[c.key] || "";
          return val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
        }).join(",")
      ),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `custom-${sourceType}-${startDate}-to-${endDate}.csv`;
    link.click();
  }, [rows, columns, sourceType, startDate, endDate]);

  const handleExportExcel = useCallback(async () => {
    if (rows.length === 0) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const data = [
      columns.map((c) => c.name),
      ...rows.map((row) => columns.map((c) => row[c.key] || "")),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sourceType);
    XLSX.writeFile(wb, `custom-${sourceType}-${startDate}-to-${endDate}.xlsx`);
  }, [rows, columns, sourceType, startDate, endDate]);

  return (
    <Protected>
      <div className="flex h-screen theme-bg-primary">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <MobileHeader />

          <header className={`sticky top-0 z-10 border-b px-6 py-4 ${isDark ? "bg-slate-900/95 backdrop-blur border-slate-700" : "bg-white/95 backdrop-blur border-gray-200"}`}>
            <div className="flex items-center gap-3">
              <Link href="/reports" className={`p-2 rounded-lg transition-colors ${isDark ? "hover:bg-slate-800 text-slate-400" : "hover:bg-gray-200 text-gray-500"}`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Custom Report Builder</h1>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>Build a report from uploaded JMK data</p>
              </div>
            </div>
          </header>

          <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
            <div className={`rounded-xl border p-6 ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
              {/* Source Type */}
              <div className="mb-5">
                <label className={`block text-xs font-medium mb-2 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Source Report</label>
                <div className="flex flex-wrap gap-2">
                  {SOURCE_TYPES.map((t) => (
                    <button
                      key={t.code}
                      onClick={() => handleSourceChange(t.code)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        sourceType === t.code
                          ? isDark ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40" : "bg-blue-100 text-blue-700 border-blue-300"
                          : isDark ? "bg-slate-900 text-slate-400 border-slate-600 hover:border-slate-500" : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date Range */}
              <div className="mb-5">
                <label className={`block text-xs font-medium mb-2 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Date Range</label>
                <div className="flex items-center gap-3">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={`px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                  />
                  <span className={`text-sm ${isDark ? "text-slate-500" : "text-gray-400"}`}>to</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={`px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                  />
                </div>
              </div>

              {/* Column Selection */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-gray-600"}`}>
                    Columns ({selectedColumns.length}/{columnOptions.length})
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedColumns(columnOptions.map((c) => c.key))} className={`text-[10px] px-2 py-0.5 rounded ${isDark ? "text-cyan-400 hover:bg-slate-800" : "text-blue-600 hover:bg-gray-100"}`}>All</button>
                    <button onClick={() => setSelectedColumns([])} className={`text-[10px] px-2 py-0.5 rounded ${isDark ? "text-slate-500 hover:bg-slate-800" : "text-gray-400 hover:bg-gray-100"}`}>Clear</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {columnOptions.map((col) => (
                    <button
                      key={col.key}
                      onClick={() => toggleColumn(col.key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        selectedColumns.includes(col.key)
                          ? isDark ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" : "bg-blue-50 text-blue-700 border-blue-200"
                          : isDark ? "bg-slate-900/50 text-slate-600 border-slate-700" : "bg-gray-50 text-gray-400 border-gray-200"
                      }`}
                    >
                      {col.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filters */}
              {sourceType === "OEA07V" && (
                <div className="mb-5">
                  <label className={`block text-xs font-medium mb-2 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Filters</label>
                  <div className="flex flex-wrap items-center gap-3">
                    <div>
                      <label className={`block text-[10px] mb-0.5 ${isDark ? "text-slate-500" : "text-gray-400"}`}>Exclude Transactions</label>
                      <div className="flex flex-wrap gap-1">
                        {(availableTransactions.length > 0 ? availableTransactions : ["Sld", "Adj/RS", "Rcv", "Trn"]).map((t) => (
                          <button key={t} onClick={() => setExcludeTransactions((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])}
                            className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                              excludeTransactions.includes(t)
                                ? isDark ? "bg-red-500/20 text-red-400 border-red-500/30 line-through" : "bg-red-50 text-red-600 border-red-200 line-through"
                                : isDark ? "bg-slate-900 text-slate-400 border-slate-700" : "bg-white text-gray-500 border-gray-200"
                            }`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className={`block text-[10px] mb-0.5 ${isDark ? "text-slate-500" : "text-gray-400"}`}>Brand</label>
                      <input type="text" value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)} placeholder="Filter brand..."
                        className={`px-2 py-1 rounded-lg border text-xs w-28 ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`} />
                    </div>
                    <div>
                      <label className={`block text-[10px] mb-0.5 ${isDark ? "text-slate-500" : "text-gray-400"}`}>Account ID</label>
                      <input type="text" value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)} placeholder="Filter account..."
                        className={`px-2 py-1 rounded-lg border text-xs w-28 ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`} />
                    </div>
                    <label className={`flex items-center gap-1.5 text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                      <input type="checkbox" checked={negateQty} onChange={(e) => setNegateQty(e.target.checked)} className="rounded" />
                      Show sales as positive
                    </label>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleGenerate}
                  disabled={runState === "loading" || !startDate || !endDate || selectedColumns.length === 0}
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${isDark ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
                >
                  {runState === "loading" ? "Generating..." : "Generate Report"}
                </button>
                {runState === "success" && (
                  <>
                    <button onClick={handleExportCSV} className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isDark ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" : "bg-blue-100 text-blue-700 hover:bg-blue-200"}`}>
                      Export CSV
                    </button>
                    <button onClick={handleExportExcel} className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isDark ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"}`}>
                      Export Excel
                    </button>
                    <button onClick={() => window.print()} className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}>
                      Print
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Error */}
            {runState === "error" && (
              <div className={`rounded-xl border p-4 ${isDark ? "bg-red-500/10 border-red-500/30" : "bg-red-50 border-red-200"}`}>
                <p className={`text-sm ${isDark ? "text-red-400" : "text-red-700"}`}>{errorMsg}</p>
              </div>
            )}

            {/* Results */}
            {runState === "success" && (
              <div className={`rounded-xl border overflow-hidden ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
                <div className={`px-4 py-3 border-b flex items-center justify-between ${isDark ? "bg-slate-800 border-slate-700" : "bg-gray-50 border-gray-200"}`}>
                  <span className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>
                    {totalRows.toLocaleString()} rows
                    {truncated && <span className={`ml-1 text-xs ${isDark ? "text-amber-400" : "text-amber-600"}`}>(showing first 10,000)</span>}
                  </span>
                  <span className={`text-xs ${isDark ? "text-slate-500" : "text-gray-400"}`}>
                    {startDate} to {endDate} — {sourceType}
                  </span>
                </div>
                <div className="overflow-x-auto max-h-[60vh]">
                  <table className="w-full text-xs">
                    <thead className={`sticky top-0 ${isDark ? "bg-slate-800" : "bg-gray-50"}`}>
                      <tr>
                        {columns.map((col) => (
                          <th key={col.key} className={`text-left px-3 py-2 font-semibold whitespace-nowrap ${isDark ? "text-slate-300 border-b border-slate-700" : "text-gray-600 border-b border-gray-200"}`}>
                            {col.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 500).map((row, i) => (
                        <tr key={i} className={`border-b ${isDark ? "border-slate-700/30 hover:bg-slate-700/20" : "border-gray-50 hover:bg-gray-50"}`}>
                          {columns.map((col) => (
                            <td key={col.key} className={`px-3 py-1.5 whitespace-nowrap ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                              {row[col.key] || ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 500 && (
                    <p className={`text-center py-3 text-xs ${isDark ? "text-slate-500" : "text-gray-400"}`}>
                      Showing 500 of {rows.length.toLocaleString()} rows — export for full data
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </Protected>
  );
}
