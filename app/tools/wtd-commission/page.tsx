"use client";

import { useState, useCallback } from "react";
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

interface CommissionLineItem {
  orderNo: string;
  brand: string;
  mfgItemId: string;
  description: string;
  qty: number;
  unitCost: number;
  commissionAmount: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReportSummary = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReportDetail = any;

// ─── MAIN PAGE ──────────────────────────────────────────────────────────────

export default function WTDCommissionReportPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { user } = useAuth();
  const permissions = usePermissions();

  const hasOverrideAccess = useQuery(
    api.wtdCommission.checkAccess,
    user?._id ? { userId: user._id } : "skip"
  );

  const canAccess = permissions.tier >= 4 || hasOverrideAccess === true;

  const reportHistory = useQuery(api.wtdCommission.listReports) as ReportSummary[] | undefined;
  const deleteReport = useMutation(api.wtdCommission.deleteReport);

  const [viewingReportId, setViewingReportId] = useState<string | null>(null);

  const viewingReport = useQuery(
    api.wtdCommission.getReport,
    viewingReportId ? { id: viewingReportId as Id<"wtdCommissionReports"> } : "skip"
  ) as ReportDetail | undefined;

  // Group reports by date for display
  const reportsByDate = (reportHistory || []).reduce((acc: Record<string, ReportSummary[]>, r: ReportSummary) => {
    const key = r.startDate;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {} as Record<string, ReportSummary[]>);

  const sortedDates = Object.keys(reportsByDate).sort((a, b) => b.localeCompare(a));

  // ─── EXPORTS ──────────────────────────────────────────────────────────────

  const handleExportPDF = useCallback(async (report: ReportDetail) => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(16);
    doc.text("WTD Commission Report", 14, y); y += 8;
    doc.setFontSize(11);
    doc.text(`Customer: ${report.customerName} (${report.customerNumber})`, 14, y); y += 6;
    doc.text(`Date: ${report.startDate}`, 14, y); y += 6;
    const commLabel = report.commissionType === "percentage"
      ? `${report.commissionValue}% of product cost` : `$${report.commissionValue.toFixed(2)} per unit`;
    doc.text(`Commission: ${commLabel}`, 14, y); y += 10;
    autoTable(doc, {
      startY: y,
      head: [["Order #", "Brand", "Mfg Code", "Description", "Qty", "Commission"]],
      body: report.lineItems.map((li: CommissionLineItem) => [li.orderNo, li.brand, li.mfgItemId, li.description, String(li.qty), `$${li.commissionAmount.toFixed(2)}`]),
      foot: [["", "", "", "", "Grand Total", `$${report.grandTotal.toFixed(2)}`]],
      theme: "grid",
      headStyles: { fillColor: [16, 185, 129] },
      footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
      styles: { fontSize: 9 },
    });
    doc.save(`wtd-commission-${report.customerName}-${report.startDate}.pdf`);
  }, []);

  const handleExportExcel = useCallback(async (report: ReportDetail) => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const data = [
      ["WTD Commission Report"],
      [`Customer: ${report.customerName} (${report.customerNumber})`],
      [`Date: ${report.startDate}`],
      [],
      ["Order #", "Brand", "Mfg Code", "Description", "Qty", "Unit Cost", "Commission"],
      ...report.lineItems.map((li: CommissionLineItem) => [li.orderNo, li.brand, li.mfgItemId, li.description, li.qty, li.unitCost, li.commissionAmount]),
      [],
      ["", "", "", "", "", "Grand Total", report.grandTotal],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 35 }, { wch: 8 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, report.customerName.slice(0, 28));
    XLSX.writeFile(wb, `wtd-commission-${report.customerName}-${report.startDate}.xlsx`);
  }, []);

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
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>Daily automated commission reports — runs at 4 AM EST</p>
                </div>
              </div>
              {permissions.tier >= 4 && (
                <Link
                  href="/tools/wtd-commission/setup"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/40" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-300"}`}
                >
                  Setup
                </Link>
              )}
            </div>
          </header>

          <div className="max-w-6xl mx-auto px-6 py-6">
            {/* Viewing a specific report */}
            {viewingReportId && viewingReport ? (
              <div>
                <button
                  onClick={() => setViewingReportId(null)}
                  className={`mb-4 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
                >
                  &larr; Back to Reports
                </button>

                {/* Export buttons */}
                <div className="flex gap-2 mb-4">
                  <button onClick={() => window.print()} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}>Print</button>
                  <button onClick={() => handleExportPDF(viewingReport)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDark ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" : "bg-blue-100 text-blue-700 hover:bg-blue-200"}`}>Export PDF</button>
                  <button onClick={() => handleExportExcel(viewingReport)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDark ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"}`}>Export Excel</button>
                </div>

                {/* Report content */}
                <div className={`rounded-xl border overflow-hidden print:break-inside-avoid ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
                  <div className={`px-6 py-4 border-b ${isDark ? "bg-slate-800 border-slate-700" : "bg-gray-50 border-gray-200"}`}>
                    <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{viewingReport.customerName}</h2>
                    <div className={`text-xs mt-1 space-x-4 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                      <span>Account: {viewingReport.customerNumber}</span>
                      <span>Date: {viewingReport.startDate}</span>
                      <span>Commission: {viewingReport.commissionType === "percentage" ? `${viewingReport.commissionValue}% of product cost` : `$${viewingReport.commissionValue.toFixed(2)} per unit`}</span>
                      <span>Generated: {new Date(viewingReport.createdAt).toLocaleString()}</span>
                    </div>
                  </div>

                  {viewingReport.lineItems.length === 0 ? (
                    <div className={`p-8 text-center ${isDark ? "text-slate-500" : "text-gray-400"}`}>
                      No qualifying transactions for this date.
                    </div>
                  ) : (
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
                  )}
                </div>
              </div>
            ) : (
              /* Report list grouped by date */
              <>
                {!reportHistory || reportHistory.length === 0 ? (
                  <div className={`rounded-xl border p-8 text-center ${isDark ? "bg-slate-800/30 border-slate-700 text-slate-400" : "bg-gray-50 border-gray-200 text-gray-500"}`}>
                    <p className="text-lg font-medium mb-2">No reports yet</p>
                    <p className="text-sm">Reports are generated automatically at 4 AM EST for the prior day.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {sortedDates.map(date => {
                      const dateReports = reportsByDate[date];
                      const formattedDate = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
                        weekday: "long", month: "short", day: "numeric", year: "numeric",
                      });

                      return (
                        <div key={date}>
                          <h2 className={`text-sm font-semibold mb-3 ${isDark ? "text-slate-400" : "text-gray-500"}`}>{formattedDate}</h2>
                          <div className="space-y-2">
                            {dateReports.map((r: ReportSummary) => (
                              <div
                                key={r._id}
                                className={`rounded-xl border p-4 flex items-center justify-between ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}
                              >
                                <div className="flex items-center gap-4">
                                  {/* Status indicator */}
                                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${r.lineItemCount > 0 ? "bg-emerald-500" : "bg-slate-500"}`} />
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>{r.customerName}</span>
                                      <span className={`px-2 py-0.5 rounded text-xs font-mono ${isDark ? "bg-slate-700 text-slate-300" : "bg-gray-100 text-gray-600"}`}>{r.customerNumber}</span>
                                    </div>
                                    <div className={`text-xs mt-0.5 ${isDark ? "text-slate-500" : "text-gray-400"}`}>
                                      {r.lineItemCount > 0 ? (
                                        <>
                                          <span>{r.lineItemCount} items</span>
                                          <span className={`ml-2 font-semibold ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>${r.grandTotal.toFixed(2)}</span>
                                        </>
                                      ) : (
                                        <span className={isDark ? "text-amber-400" : "text-amber-600"}>No qualifying transactions</span>
                                      )}
                                      <span className="ml-2">by {r.generatedByName}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setViewingReportId(r._id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDark ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" : "bg-blue-100 text-blue-700 hover:bg-blue-200"}`}
                                  >
                                    View
                                  </button>
                                  {permissions.tier >= 5 && (
                                    <button
                                      onClick={() => { if (confirm("Delete this report?")) deleteReport({ id: r._id }); }}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDark ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-red-100 text-red-700 hover:bg-red-200"}`}
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body { background: white !important; color: black !important; font-family: Arial, Helvetica, sans-serif !important; font-size: 11px !important; }
          .print\\:hidden { display: none !important; }
          .print\\:break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
          aside, header.sticky, nav { display: none !important; }
          main { overflow: visible !important; padding: 0 !important; }
          .theme-bg-primary, .flex.h-screen { background: white !important; }
          .max-w-6xl { max-width: 100% !important; padding: 0 20px !important; }
          .rounded-xl { border-radius: 0 !important; border: none !important; box-shadow: none !important; background: white !important; }
          table { border-collapse: collapse !important; width: 100% !important; }
          th { background: #10b981 !important; color: white !important; padding: 8px 12px !important; font-size: 11px !important; border: 1px solid #0d9668 !important; }
          td { padding: 6px 12px !important; border: 1px solid #e5e7eb !important; color: black !important; font-size: 10px !important; }
          tr:nth-child(even) td { background: #f9fafb !important; }
          tfoot td { background: #f3f4f6 !important; color: black !important; font-weight: bold !important; border: 1px solid #e5e7eb !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
    </Protected>
  );
}
