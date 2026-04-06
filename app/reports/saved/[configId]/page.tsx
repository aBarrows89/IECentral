"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Protected from "@/app/protected";
import Sidebar, { MobileHeader } from "@/components/Sidebar";
import { useTheme } from "@/app/theme-context";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";

export default function SavedReportDetailPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const params = useParams();
  const configId = params.configId as string;

  const config = useQuery(api.savedReports.get, { id: configId as Id<"savedReportConfigs"> });
  const updateConfig = useMutation(api.savedReports.update);
  const removeConfig = useMutation(api.savedReports.remove);

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{ columns: { key: string; name: string }[]; rows: Record<string, string>[]; totalRows: number } | null>(null);
  const [error, setError] = useState("");

  const handleRun = useCallback(async () => {
    if (!config) return;
    setRunning(true);
    setError("");

    try {
      // Determine months from date range
      const months: string[] = [];
      if (config.customStartDate && config.customEndDate) {
        const s = new Date(config.customStartDate);
        const e = new Date(config.customEndDate);
        const cursor = new Date(s.getFullYear(), s.getMonth(), 1);
        while (cursor <= e) {
          months.push(`${cursor.getFullYear()}${String(cursor.getMonth() + 1).padStart(2, "0")}`);
          cursor.setMonth(cursor.getMonth() + 1);
        }
      } else {
        // Default to current month
        const now = new Date();
        months.push(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`);
      }

      const res = await fetch("/api/reports/custom-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: config.sources[0],
          months,
          selectedColumns: config.selectedColumns,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Apply filters from config
      let rows = data.rows;
      if (config.excludeTransactions?.length) {
        rows = rows.filter((r: Record<string, string>) => !config.excludeTransactions!.includes(r.transaction || ""));
      }
      if (config.filterBrand) {
        rows = rows.filter((r: Record<string, string>) => r.brand === config.filterBrand);
      }
      if (config.filterAccount) {
        rows = rows.filter((r: Record<string, string>) => (r.accountId || "").includes(config.filterAccount!));
      }
      if (config.negateQty && config.sources[0] === "OEA07V") {
        rows = rows.map((r: Record<string, string>) => {
          const copy = { ...r };
          if (copy.qty) copy.qty = String(-parseFloat(copy.qty) || 0);
          if (copy.extCost) copy.extCost = String(-parseFloat(copy.extCost) || 0);
          return copy;
        });
      }

      setResults({ columns: data.columns, rows, totalRows: rows.length });

      // Update last run
      await updateConfig({
        id: configId as Id<"savedReportConfigs">,
        lastRunAt: Date.now(),
        lastRunRowCount: rows.length,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run report");
    } finally {
      setRunning(false);
    }
  }, [config, configId, updateConfig]);

  const handleExportCSV = useCallback(() => {
    if (!results) return;
    const headers = results.columns.map((c) => c.name);
    const csv = [headers.join(","), ...results.rows.map((row) =>
      results.columns.map((c) => {
        const val = row[c.key] || "";
        return val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(",")
    )].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${config?.name || "report"}-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  }, [results, config]);

  const handleExportExcel = useCallback(async () => {
    if (!results) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const data = [results.columns.map((c) => c.name), ...results.rows.map((row) => results.columns.map((c) => row[c.key] || ""))];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "Report");
    XLSX.writeFile(wb, `${config?.name || "report"}-${new Date().toISOString().split("T")[0]}.xlsx`);
  }, [results, config]);

  if (!config) {
    return (
      <Protected>
        <div className="flex h-screen theme-bg-primary">
          <Sidebar />
          <main className="flex-1 flex items-center justify-center">
            <MobileHeader />
            <div className={`text-center ${isDark ? "text-slate-400" : "text-gray-500"}`}>Loading...</div>
          </main>
        </div>
      </Protected>
    );
  }

  const scheduleLabel = config.autoRun ? "Auto-runs on new data" : "Manual only";

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
                  <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{config.name}</h1>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                    {config.sources.join(" + ")} — {scheduleLabel}
                    {config.lastRunAt && ` — Last run: ${new Date(config.lastRunAt).toLocaleString()}`}
                    {config.lastRunRowCount != null && ` (${config.lastRunRowCount} rows)`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleRun} disabled={running}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 ${isDark ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>
                  {running ? "Running..." : "Run Now"}
                </button>
                {results && (
                  <>
                    <button onClick={handleExportCSV} className={`px-3 py-2 rounded-lg text-sm font-medium ${isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-100 text-emerald-700"}`}>CSV</button>
                    <button onClick={handleExportExcel} className={`px-3 py-2 rounded-lg text-sm font-medium ${isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-700"}`}>Excel</button>
                  </>
                )}
                <button onClick={async () => { if (confirm("Delete this saved report?")) { await removeConfig({ id: configId as Id<"savedReportConfigs"> }); window.location.href = "/reports"; } }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium ${isDark ? "bg-red-500/20 text-red-400" : "bg-red-100 text-red-700"}`}>Delete</button>
              </div>
            </div>
          </header>

          <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
            {/* Config summary */}
            <div className={`rounded-xl border p-5 ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className={`text-[10px] uppercase tracking-wider font-medium ${isDark ? "text-slate-500" : "text-gray-400"}`}>Sources</p>
                  <p className={`text-sm mt-1 ${isDark ? "text-white" : "text-gray-900"}`}>{config.sources.join(" + ")}</p>
                </div>
                <div>
                  <p className={`text-[10px] uppercase tracking-wider font-medium ${isDark ? "text-slate-500" : "text-gray-400"}`}>Columns</p>
                  <p className={`text-sm mt-1 ${isDark ? "text-white" : "text-gray-900"}`}>{config.selectedColumns.length} selected</p>
                </div>
                <div>
                  <p className={`text-[10px] uppercase tracking-wider font-medium ${isDark ? "text-slate-500" : "text-gray-400"}`}>Filters</p>
                  <p className={`text-sm mt-1 ${isDark ? "text-white" : "text-gray-900"}`}>
                    {[
                      config.excludeTransactions?.length && `Excl: ${config.excludeTransactions.join(",")}`,
                      config.filterBrand && `Brand: ${config.filterBrand}`,
                      config.filterAccount && `Acct: ${config.filterAccount}`,
                    ].filter(Boolean).join(", ") || "None"}
                  </p>
                </div>
                <div>
                  <p className={`text-[10px] uppercase tracking-wider font-medium ${isDark ? "text-slate-500" : "text-gray-400"}`}>Date Range</p>
                  <p className={`text-sm mt-1 ${isDark ? "text-white" : "text-gray-900"}`}>
                    {config.customStartDate && config.customEndDate ? `${config.customStartDate} to ${config.customEndDate}` : config.dateRangeType}
                  </p>
                </div>
              </div>
            </div>

            {error && <div className={`rounded-xl border p-4 ${isDark ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}>{error}</div>}

            {/* Results table */}
            {results && (
              <div className={`rounded-xl border overflow-hidden ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                <div className={`px-4 py-3 border-b ${isDark ? "bg-slate-800 border-slate-700" : "bg-gray-50 border-gray-200"}`}>
                  <span className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>{results.totalRows.toLocaleString()} rows</span>
                </div>
                <div className="overflow-x-auto max-h-[60vh]">
                  <table className="w-full text-xs">
                    <thead className={`sticky top-0 ${isDark ? "bg-slate-800" : "bg-gray-50"}`}>
                      <tr>
                        {results.columns.map((col) => (
                          <th key={col.key} className={`text-left px-3 py-2 font-semibold whitespace-nowrap ${isDark ? "text-slate-300 border-b border-slate-700" : "text-gray-600 border-b border-gray-200"}`}>{col.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.rows.slice(0, 500).map((row, i) => (
                        <tr key={i} className={`border-b ${i % 2 ? isDark ? "bg-slate-800/30" : "bg-gray-50/50" : ""} ${isDark ? "border-slate-700/30" : "border-gray-100"}`}>
                          {results.columns.map((col) => (
                            <td key={col.key} className={`px-3 py-1.5 whitespace-nowrap ${isDark ? "text-slate-300" : "text-gray-700"}`}>{row[col.key] || ""}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {results.rows.length > 500 && (
                    <p className={`text-center py-3 text-xs ${isDark ? "text-slate-500" : "text-gray-400"}`}>Showing 500 of {results.rows.length.toLocaleString()} — export for full data</p>
                  )}
                </div>
              </div>
            )}

            {!results && !error && (
              <div className={`rounded-xl border p-12 text-center ${isDark ? "bg-slate-800/30 border-slate-700 text-slate-500" : "bg-gray-50 border-gray-200 text-gray-400"}`}>
                Click <strong>Run Now</strong> to generate this report
              </div>
            )}
          </div>
        </main>
      </div>
    </Protected>
  );
}
