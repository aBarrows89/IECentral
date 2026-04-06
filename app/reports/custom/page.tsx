"use client";

import { useState, useCallback } from "react";
import Protected from "@/app/protected";
import Sidebar, { MobileHeader } from "@/components/Sidebar";
import { useTheme } from "@/app/theme-context";
import Link from "next/link";

const SOURCE_TYPES = [
  { code: "OEA07V", label: "OEA07V — Sales Activity Detail" },
  { code: "ART24T", label: "ART24T — Transaction Analysis" },
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
};

// Generate last 12 months as YYYYMM options
function getMonthOptions(): { value: string; label: string }[] {
  const months: { value: string; label: string }[] = [];
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({ value: val, label: `${names[d.getMonth()]} ${d.getFullYear()}` });
  }
  return months;
}

type RunState = "idle" | "loading" | "success" | "error";

export default function CustomReportPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [sourceType, setSourceType] = useState("OEA07V");
  const [selectedMonths, setSelectedMonths] = useState<string[]>([getMonthOptions()[0].value]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    COLUMN_OPTIONS.OEA07V.filter((c) => c.defaultOn).map((c) => c.key)
  );
  const [runState, setRunState] = useState<RunState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [columns, setColumns] = useState<{ key: string; name: string }[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [truncated, setTruncated] = useState(false);

  const monthOptions = getMonthOptions();
  const columnOptions = COLUMN_OPTIONS[sourceType] || [];

  const handleSourceChange = useCallback((code: string) => {
    setSourceType(code);
    setSelectedColumns((COLUMN_OPTIONS[code] || []).filter((c) => c.defaultOn).map((c) => c.key));
    setRows([]);
    setRunState("idle");
  }, []);

  const toggleMonth = useCallback((m: string) => {
    setSelectedMonths((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);
  }, []);

  const toggleColumn = useCallback((key: string) => {
    setSelectedColumns((prev) => prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (selectedMonths.length === 0 || selectedColumns.length === 0) return;
    setRunState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/reports/custom-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType: sourceType, months: selectedMonths, selectedColumns }),
      });
      const data = await res.json();
      if (!res.ok) { setRunState("error"); setErrorMsg(data.error); return; }

      setColumns(data.columns);
      setRows(data.rows);
      setTotalRows(data.totalRows);
      setTruncated(data.truncated);
      setRunState("success");
    } catch (err) {
      setRunState("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to generate report");
    }
  }, [sourceType, selectedMonths, selectedColumns]);

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
    link.download = `custom-report-${sourceType}-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  }, [rows, columns, sourceType]);

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
            {/* Configuration */}
            <div className={`rounded-xl border p-6 ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
              {/* Source Type */}
              <div className="mb-5">
                <label className={`block text-xs font-medium mb-2 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Source Report</label>
                <div className="flex gap-2">
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
                      {t.code}
                    </button>
                  ))}
                </div>
              </div>

              {/* Month Selection */}
              <div className="mb-5">
                <label className={`block text-xs font-medium mb-2 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Date Range (select months with data)</label>
                <div className="flex flex-wrap gap-2">
                  {monthOptions.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => toggleMonth(m.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        selectedMonths.includes(m.value)
                          ? isDark ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" : "bg-emerald-100 text-emerald-700 border-emerald-300"
                          : isDark ? "bg-slate-900 text-slate-500 border-slate-700 hover:border-slate-600" : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Column Selection */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-gray-600"}`}>
                    Columns ({selectedColumns.length}/{columnOptions.length} selected)
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedColumns(columnOptions.map((c) => c.key))}
                      className={`text-[10px] px-2 py-0.5 rounded ${isDark ? "text-cyan-400 hover:bg-slate-800" : "text-blue-600 hover:bg-gray-100"}`}
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => setSelectedColumns([])}
                      className={`text-[10px] px-2 py-0.5 rounded ${isDark ? "text-slate-500 hover:bg-slate-800" : "text-gray-400 hover:bg-gray-100"}`}
                    >
                      Clear
                    </button>
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

              {/* Generate */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleGenerate}
                  disabled={runState === "loading" || selectedMonths.length === 0 || selectedColumns.length === 0}
                  className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${isDark ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
                >
                  {runState === "loading" ? "Generating..." : "Generate Report"}
                </button>
                {runState === "success" && (
                  <button
                    onClick={handleExportCSV}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${isDark ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" : "bg-blue-100 text-blue-700 hover:bg-blue-200"}`}
                  >
                    Export CSV
                  </button>
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
                      Showing 500 of {rows.length.toLocaleString()} rows — export CSV for full data
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
