"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import Protected from "@/app/protected";
import Sidebar, { MobileHeader } from "@/components/Sidebar";
import { useTheme } from "@/app/theme-context";
import { useAuth } from "@/app/auth-context";
import { usePermissions } from "@/lib/usePermissions";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";

// ─── TYPES ──────────────────────────────────────────────────────────────────

interface S3Row {
  itemId: string;
  description: string;
  dclass: string;
  brand: string;
  mfgItemId: string;
  trnPur: string;
  qty: number;
  unitCost: number;
  unitSell: number;
  accountId: string;
  orderNo: string;
  activityDate: string;
  customerName: string;
}

interface CustomerConfig {
  _id: string;
  customerName: string;
  customerNumber: string;
  qualifyingDclasses: string[];
  qualifyingBrands: string[];
  commissionType: string;
  commissionValue: number;
  isActive: boolean;
}

interface CommissionLineItem {
  orderNo: string;
  brand: string;
  mfgItemId: string;
  description: string;
  qty: number;
  unitCost: number;
  commissionAmount: number;
}

interface CustomerReport {
  customerName: string;
  customerNumber: string;
  commissionType: string;
  commissionValue: number;
  lineItems: CommissionLineItem[];
  grandTotal: number;
}

type RunState = "idle" | "loading" | "success" | "error";

// ─── MAIN PAGE ──────────────────────────────────────────────────────────────

export default function WTDCommissionReportPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { user } = useAuth();
  const permissions = usePermissions();
  const printRef = useRef<HTMLDivElement>(null);

  const customers = useQuery(api.wtdCommission.getActiveCustomers);
  const hasOverrideAccess = useQuery(
    api.wtdCommission.checkAccess,
    user?._id ? { userId: user._id } : "skip"
  );

  // Access: T4+ or on override list
  const canAccess = permissions.tier >= 4 || hasOverrideAccess === true;

  const reportHistory = useQuery(api.wtdCommission.listReports);
  const saveReport = useMutation(api.wtdCommission.saveReport);
  const deleteReport = useMutation(api.wtdCommission.deleteReport);

  const [activeTab, setActiveTab] = useState<"generate" | "history">("generate");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [runState, setRunState] = useState<RunState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [reports, setReports] = useState<CustomerReport[]>([]);
  const [rawRowCount, setRawRowCount] = useState(0);
  const [viewingReportId, setViewingReportId] = useState<string | null>(null);

  // Load a historical report for viewing
  const viewingReport = useQuery(
    api.wtdCommission.getReport,
    viewingReportId ? { id: viewingReportId as Id<"wtdCommissionReports"> } : "skip"
  );

  const typedCustomers = customers as CustomerConfig[] | undefined;

  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId || !typedCustomers) return null;
    return typedCustomers.find((c: CustomerConfig) => c._id === selectedCustomerId) ?? null;
  }, [selectedCustomerId, typedCustomers]);

  // ─── RUN REPORT ─────────────────────────────────────────────────────────

  const handleRun = useCallback(async () => {
    if (!startDate || !endDate || !typedCustomers || typedCustomers.length === 0) return;

    setRunState("loading");
    setErrorMsg("");
    setReports([]);

    try {
      // Fetch S3 data
      const res = await fetch("/api/wtd-commission/s3-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRunState("error");
        setErrorMsg(data.error || "Failed to fetch data from S3");
        return;
      }

      const rows: S3Row[] = data.rows;
      setRawRowCount(rows.length);

      // Filter and calculate for each active customer config (or selected one)
      const configsToRun = selectedCustomerId
        ? typedCustomers.filter((c: CustomerConfig) => c._id === selectedCustomerId)
        : typedCustomers;

      const generatedReports: CustomerReport[] = [];

      for (const config of configsToRun) {
        const qualifying = rows.filter((row) => {
          // Must match customer number (account ID)
          if (row.accountId.toUpperCase() !== config.customerNumber.toUpperCase()) return false;

          // Item ID must end with a qualifying suffix (. or ^ etc)
          if (config.qualifyingDclasses.length > 0) {
            if (!config.qualifyingDclasses.some((suffix: string) => row.itemId.endsWith(suffix))) return false;
          }

          // Brand must match (unless "ALL")
          if (!config.qualifyingBrands.includes("ALL")) {
            if (!config.qualifyingBrands.some((b) => b.toUpperCase() === row.brand.toUpperCase())) return false;
          }

          return true;
        });

        const lineItems: CommissionLineItem[] = qualifying.map((row) => {
          let commissionAmount: number;
          if (config.commissionType === "percentage") {
            commissionAmount = Math.abs(row.qty) * row.unitCost * (config.commissionValue / 100);
          } else {
            commissionAmount = Math.abs(row.qty) * config.commissionValue;
          }

          return {
            orderNo: row.orderNo,
            brand: row.brand,
            mfgItemId: row.mfgItemId,
            description: row.description,
            qty: Math.abs(row.qty),
            unitCost: row.unitCost,
            commissionAmount: Math.round(commissionAmount * 100) / 100,
          };
        });

        const grandTotal = lineItems.reduce((sum, li) => sum + li.commissionAmount, 0);

        if (lineItems.length > 0) {
          generatedReports.push({
            customerName: config.customerName,
            customerNumber: config.customerNumber,
            commissionType: config.commissionType,
            commissionValue: config.commissionValue,
            lineItems,
            grandTotal: Math.round(grandTotal * 100) / 100,
          });
        }
      }

      setReports(generatedReports);
      setRunState("success");

      // Auto-save each report to history
      if (user?._id && generatedReports.length > 0) {
        for (const report of generatedReports) {
          await saveReport({
            customerName: report.customerName,
            customerNumber: report.customerNumber,
            startDate,
            endDate,
            commissionType: report.commissionType,
            commissionValue: report.commissionValue,
            lineItems: report.lineItems,
            grandTotal: report.grandTotal,
            generatedBy: user._id,
            generatedByName: user.name || "Unknown",
          });
        }
      }
    } catch (err) {
      setRunState("error");
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
    }
  }, [startDate, endDate, typedCustomers, selectedCustomerId, saveReport, user]);

  // ─── EXPORTS ──────────────────────────────────────────────────────────────

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleExportPDF = useCallback(async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const doc = new jsPDF();

    for (let i = 0; i < reports.length; i++) {
      const report = reports[i];
      if (i > 0) doc.addPage();

      let y = 20;
      doc.setFontSize(16);
      doc.text(`WTD Commission Report`, 14, y);
      y += 8;

      doc.setFontSize(11);
      doc.text(`Customer: ${report.customerName} (${report.customerNumber})`, 14, y);
      y += 6;
      doc.text(`Date Range: ${startDate} to ${endDate}`, 14, y);
      y += 6;
      const commLabel = report.commissionType === "percentage"
        ? `${report.commissionValue}% of product cost`
        : `$${report.commissionValue.toFixed(2)} per unit`;
      doc.text(`Commission: ${commLabel}`, 14, y);
      y += 10;

      autoTable(doc, {
        startY: y,
        head: [["Order #", "Brand", "Mfg Code", "Description", "Qty", "Commission"]],
        body: report.lineItems.map((li) => [
          li.orderNo,
          li.brand,
          li.mfgItemId,
          li.description,
          String(li.qty),
          `$${li.commissionAmount.toFixed(2)}`,
        ]),
        foot: [["", "", "", "", "Grand Total", `$${report.grandTotal.toFixed(2)}`]],
        theme: "grid",
        headStyles: { fillColor: [16, 185, 129] },
        footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
        styles: { fontSize: 9 },
      });
    }

    doc.save(`wtd-commission-${startDate}-to-${endDate}.pdf`);
  }, [reports, startDate, endDate]);

  const handleExportExcel = useCallback(async () => {
    const XLSX = await import("xlsx");

    const wb = XLSX.utils.book_new();

    for (const report of reports) {
      const sheetData = [
        ["WTD Commission Report"],
        [`Customer: ${report.customerName} (${report.customerNumber})`],
        [`Date Range: ${startDate} to ${endDate}`],
        [
          `Commission: ${
            report.commissionType === "percentage"
              ? `${report.commissionValue}% of product cost`
              : `$${report.commissionValue.toFixed(2)} per unit`
          }`,
        ],
        [],
        ["Order #", "Brand", "Mfg Code", "Description", "Qty", "Unit Cost", "Commission"],
        ...report.lineItems.map((li) => [
          li.orderNo,
          li.brand,
          li.mfgItemId,
          li.description,
          li.qty,
          li.unitCost,
          li.commissionAmount,
        ]),
        [],
        ["", "", "", "", "", "Grand Total", report.grandTotal],
      ];

      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      // Set column widths
      ws["!cols"] = [
        { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 35 }, { wch: 8 }, { wch: 12 }, { wch: 14 },
      ];

      const safeName = report.customerName.replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 28);
      XLSX.utils.book_append_sheet(wb, ws, safeName);
    }

    XLSX.writeFile(wb, `wtd-commission-${startDate}-to-${endDate}.xlsx`);
  }, [reports, startDate, endDate]);

  // ─── RENDER ───────────────────────────────────────────────────────────────

  if (!canAccess) {
    return (
      <Protected>
        <div className="flex h-screen theme-bg-primary">
          <Sidebar />
          <main className="flex-1 flex items-center justify-center">
            <MobileHeader />
            <div className={`text-center p-8 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
              <p className="text-lg font-medium">Access Denied</p>
              <p className="text-sm mt-1">You do not have permission to access WTD Commission Report.</p>
            </div>
          </main>
        </div>
      </Protected>
    );
  }

  return (
    <Protected>
      <div className="flex h-screen theme-bg-primary">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <MobileHeader />

          {/* Header */}
          <header className={`sticky top-0 z-10 border-b px-6 py-4 print:hidden ${isDark ? "bg-slate-900/95 backdrop-blur border-slate-700" : "bg-white/95 backdrop-blur border-gray-200"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-gradient-to-br from-emerald-500/20 to-teal-600/20" : "bg-gradient-to-br from-emerald-100 to-teal-100"}`}>
                  <svg className={`w-5 h-5 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>WTD Commission Report</h1>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>Generate commission detail reports for WTD</p>
                </div>
              </div>
              {permissions.tier >= 4 && (
                <Link
                  href="/tools/wtd-commission/setup"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
                >
                  Setup
                </Link>
              )}
            </div>
            {/* Tabs */}
            <div className="flex gap-1 mt-4">
              {(["generate", "history"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setViewingReportId(null); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                    activeTab === tab
                      ? isDark ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-emerald-100 text-emerald-700 border border-emerald-300"
                      : isDark ? "text-slate-400 hover:text-slate-300 hover:bg-slate-800" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {tab === "generate" ? "Generate Report" : `History (${reportHistory?.length ?? 0})`}
                </button>
              ))}
            </div>
          </header>

          <div className="max-w-6xl mx-auto px-6 py-6">
            {/* ─── HISTORY TAB ─── */}
            {activeTab === "history" && (
              <div>
                {viewingReportId && viewingReport ? (
                  // Viewing a specific historical report
                  <div>
                    <button
                      onClick={() => setViewingReportId(null)}
                      className={`mb-4 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
                    >
                      &larr; Back to History
                    </button>
                    <div className={`rounded-xl border overflow-hidden ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
                      <div className={`px-6 py-4 border-b ${isDark ? "bg-slate-800 border-slate-700" : "bg-gray-50 border-gray-200"}`}>
                        <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{viewingReport.customerName}</h2>
                        <div className={`text-xs mt-1 space-x-4 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                          <span>Account: {viewingReport.customerNumber}</span>
                          <span>Date Range: {viewingReport.startDate} to {viewingReport.endDate}</span>
                          <span>Commission: {viewingReport.commissionType === "percentage" ? `${viewingReport.commissionValue}% of product cost` : `$${viewingReport.commissionValue.toFixed(2)} per unit`}</span>
                          <span>Generated: {new Date(viewingReport.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className={isDark ? "border-b border-slate-700" : "border-b border-gray-200"}>
                              <th className={`text-left px-4 py-3 font-semibold ${isDark ? "text-slate-300" : "text-gray-700"}`}>Order #</th>
                              <th className={`text-left px-4 py-3 font-semibold ${isDark ? "text-slate-300" : "text-gray-700"}`}>Brand</th>
                              <th className={`text-left px-4 py-3 font-semibold ${isDark ? "text-slate-300" : "text-gray-700"}`}>Mfg Code</th>
                              <th className={`text-left px-4 py-3 font-semibold ${isDark ? "text-slate-300" : "text-gray-700"}`}>Description</th>
                              <th className={`text-right px-4 py-3 font-semibold ${isDark ? "text-slate-300" : "text-gray-700"}`}>Qty</th>
                              <th className={`text-right px-4 py-3 font-semibold ${isDark ? "text-slate-300" : "text-gray-700"}`}>Commission</th>
                            </tr>
                          </thead>
                          <tbody>
                            {viewingReport.lineItems.map((li: CommissionLineItem, i: number) => (
                              <tr key={i} className={`border-b ${isDark ? "border-slate-700/50 hover:bg-slate-700/30" : "border-gray-100 hover:bg-gray-50"}`}>
                                <td className={`px-4 py-2.5 font-mono text-xs ${isDark ? "text-slate-300" : "text-gray-700"}`}>{li.orderNo}</td>
                                <td className={`px-4 py-2.5 font-mono text-xs font-semibold ${isDark ? "text-slate-300" : "text-gray-700"}`}>{li.brand}</td>
                                <td className={`px-4 py-2.5 font-mono text-xs ${isDark ? "text-slate-300" : "text-gray-700"}`}>{li.mfgItemId}</td>
                                <td className={`px-4 py-2.5 ${isDark ? "text-white" : "text-gray-900"}`}>{li.description}</td>
                                <td className={`px-4 py-2.5 text-right ${isDark ? "text-slate-300" : "text-gray-700"}`}>{li.qty}</td>
                                <td className={`px-4 py-2.5 text-right font-medium ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>${li.commissionAmount.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className={isDark ? "bg-slate-800" : "bg-gray-50"}>
                              <td colSpan={5} className={`px-4 py-3 text-right font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Grand Total</td>
                              <td className={`px-4 py-3 text-right font-bold text-lg ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>${viewingReport.grandTotal.toFixed(2)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  // History list
                  <>
                    {!reportHistory || reportHistory.length === 0 ? (
                      <div className={`rounded-xl border p-8 text-center ${isDark ? "bg-slate-800/30 border-slate-700 text-slate-400" : "bg-gray-50 border-gray-200 text-gray-500"}`}>
                        No saved reports yet. Generate a report to save it automatically.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {reportHistory.map((r) => (
                          <div
                            key={r._id}
                            className={`rounded-xl border p-4 flex items-center justify-between ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>{r.customerName}</span>
                                <span className={`px-2 py-0.5 rounded text-xs font-mono ${isDark ? "bg-slate-700 text-slate-300" : "bg-gray-100 text-gray-600"}`}>{r.customerNumber}</span>
                              </div>
                              <div className={`text-xs space-x-3 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                                <span>{r.startDate} to {r.endDate}</span>
                                <span>{r.lineItemCount} items</span>
                                <span className={`font-semibold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>${r.grandTotal.toFixed(2)}</span>
                                <span>by {r.generatedByName}</span>
                                <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                                <span className={`${isDark ? "text-slate-500" : "text-gray-400"}`}>expires {new Date(r.expiresAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setViewingReportId(r._id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDark ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" : "bg-blue-100 text-blue-700 hover:bg-blue-200"}`}
                              >
                                View
                              </button>
                              <button
                                onClick={() => { if (confirm("Delete this report?")) deleteReport({ id: r._id }); }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDark ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-red-100 text-red-700 hover:bg-red-200"}`}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ─── GENERATE TAB ─── */}
            {activeTab === "generate" && <>
            {/* Controls */}
            <div className={`rounded-xl border p-5 mb-6 print:hidden ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={`px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-gray-600"}`}>End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={`px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Customer (optional)</label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className={`px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                  >
                    <option value="">All Customers</option>
                    {(typedCustomers ?? []).map((c: CustomerConfig) => (
                      <option key={c._id} value={c._id}>
                        {c.customerName} ({c.customerNumber})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleRun}
                  disabled={runState === "loading" || !startDate || !endDate}
                  className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${isDark ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
                >
                  {runState === "loading" ? "Loading..." : "Run Report"}
                </button>
              </div>

              {/* Quick status */}
              {runState === "loading" && (
                <p className={`mt-3 text-sm ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                  Fetching OEA07V data from S3...
                </p>
              )}
            </div>

            {/* Error */}
            {runState === "error" && (
              <div className={`rounded-xl border p-5 mb-6 ${isDark ? "bg-red-500/10 border-red-500/30" : "bg-red-50 border-red-200"}`}>
                <p className={`text-sm font-medium ${isDark ? "text-red-400" : "text-red-700"}`}>{errorMsg}</p>
              </div>
            )}

            {/* Results */}
            {runState === "success" && (
              <>
                {/* Export bar */}
                <div className={`flex items-center justify-between rounded-xl border p-4 mb-6 print:hidden ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
                  <div className={`text-sm ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                    {rawRowCount.toLocaleString()} total rows scanned
                    {reports.length > 0 && ` — ${reports.reduce((s, r) => s + r.lineItems.length, 0)} qualifying line items`}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handlePrint}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
                    >
                      Print
                    </button>
                    <button
                      onClick={handleExportPDF}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDark ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" : "bg-blue-100 text-blue-700 hover:bg-blue-200"}`}
                    >
                      Export PDF
                    </button>
                    <button
                      onClick={handleExportExcel}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDark ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"}`}
                    >
                      Export Excel
                    </button>
                  </div>
                </div>

                {/* Report tables */}
                {reports.length === 0 ? (
                  <div className={`rounded-xl border p-8 text-center ${isDark ? "bg-slate-800/30 border-slate-700 text-slate-400" : "bg-gray-50 border-gray-200 text-gray-500"}`}>
                    No qualifying line items found for the selected date range and customer configurations.
                  </div>
                ) : (
                  <div ref={printRef} className="space-y-8">
                    {reports.map((report, idx) => (
                      <div
                        key={idx}
                        className={`rounded-xl border overflow-hidden print:break-inside-avoid ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}
                      >
                        {/* Report header */}
                        <div className={`px-6 py-4 border-b ${isDark ? "bg-slate-800 border-slate-700" : "bg-gray-50 border-gray-200"}`}>
                          <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{report.customerName}</h2>
                          <div className={`text-xs mt-1 space-x-4 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                            <span>Account: {report.customerNumber}</span>
                            <span>Date Range: {startDate} to {endDate}</span>
                            <span>
                              Commission:{" "}
                              {report.commissionType === "percentage"
                                ? `${report.commissionValue}% of product cost`
                                : `$${report.commissionValue.toFixed(2)} per unit`}
                            </span>
                          </div>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className={isDark ? "border-b border-slate-700" : "border-b border-gray-200"}>
                                <th className={`text-left px-4 py-3 font-semibold ${isDark ? "text-slate-300" : "text-gray-700"}`}>Order #</th>
                                <th className={`text-left px-4 py-3 font-semibold ${isDark ? "text-slate-300" : "text-gray-700"}`}>Brand</th>
                                <th className={`text-left px-4 py-3 font-semibold ${isDark ? "text-slate-300" : "text-gray-700"}`}>Mfg Code</th>
                                <th className={`text-left px-4 py-3 font-semibold ${isDark ? "text-slate-300" : "text-gray-700"}`}>Description</th>
                                <th className={`text-right px-4 py-3 font-semibold ${isDark ? "text-slate-300" : "text-gray-700"}`}>Qty</th>
                                <th className={`text-right px-4 py-3 font-semibold ${isDark ? "text-slate-300" : "text-gray-700"}`}>Commission</th>
                              </tr>
                            </thead>
                            <tbody>
                              {report.lineItems.map((li, liIdx) => (
                                <tr
                                  key={liIdx}
                                  className={`border-b ${isDark ? "border-slate-700/50 hover:bg-slate-700/30" : "border-gray-100 hover:bg-gray-50"}`}
                                >
                                  <td className={`px-4 py-2.5 font-mono text-xs ${isDark ? "text-slate-300" : "text-gray-700"}`}>{li.orderNo}</td>
                                  <td className={`px-4 py-2.5 font-mono text-xs font-semibold ${isDark ? "text-slate-300" : "text-gray-700"}`}>{li.brand}</td>
                                  <td className={`px-4 py-2.5 font-mono text-xs ${isDark ? "text-slate-300" : "text-gray-700"}`}>{li.mfgItemId}</td>
                                  <td className={`px-4 py-2.5 ${isDark ? "text-white" : "text-gray-900"}`}>{li.description}</td>
                                  <td className={`px-4 py-2.5 text-right ${isDark ? "text-slate-300" : "text-gray-700"}`}>{li.qty}</td>
                                  <td className={`px-4 py-2.5 text-right font-medium ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                                    ${li.commissionAmount.toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className={isDark ? "bg-slate-800" : "bg-gray-50"}>
                                <td colSpan={5} className={`px-4 py-3 text-right font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                                  Grand Total
                                </td>
                                <td className={`px-4 py-3 text-right font-bold text-lg ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                                  ${report.grandTotal.toFixed(2)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            </>}
          </div>
        </main>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
          aside, header.sticky { display: none !important; }
          main { overflow: visible !important; }
          .theme-bg-primary { background: white !important; }
        }
      `}</style>
    </Protected>
  );
}
