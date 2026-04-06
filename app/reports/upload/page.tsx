"use client";

import { useState, useCallback, useRef } from "react";
import Protected from "@/app/protected";
import Sidebar, { MobileHeader } from "@/components/Sidebar";
import { useTheme } from "@/app/theme-context";
import { useAuth } from "@/app/auth-context";
import { usePermissions } from "@/lib/usePermissions";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";

type UploadState = "idle" | "validating" | "uploading" | "processing" | "complete" | "error";

const REPORT_TYPES = [
  { code: "OEA07V", label: "OEA07V — Sales Activity Detail", description: "Item-level sales/returns with customer, location, dates" },
];

function getDefaultMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(yyyymm: string): string {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const y = yyyymm.slice(0, 4);
  const m = parseInt(yyyymm.slice(4, 6), 10);
  return `${names[m - 1]} ${y}`;
}

export default function ReportUploadPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { user } = useAuth();
  const permissions = usePermissions();

  const hasOverrideAccess = useQuery(
    api.jmkUploads.checkUploadAccess,
    user?._id ? { userId: user._id } : "skip"
  );
  const canAccess = permissions.tier >= 5 || hasOverrideAccess === true;

  const uploadHistory = useQuery(api.jmkUploads.listUploadHistory, { limit: 20 });
  const recordUpload = useMutation(api.jmkUploads.recordUpload);

  const [reportType, setReportType] = useState("OEA07V");
  const [month, setMonth] = useState(getDefaultMonth());
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [validation, setValidation] = useState<{ valid: boolean; errors?: string[]; detectedColumns?: number; rowCount?: number } | null>(null);
  const [processingResults, setProcessingResults] = useState<{ trigger: string; status: string; message?: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".csv") || f.name.endsWith(".xlsx"))) {
      setFile(f);
      setValidation(null);
      setUploadState("idle");
      setErrorMsg("");
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setValidation(null);
      setUploadState("idle");
      setErrorMsg("");
    }
  }, []);

  const handleValidate = useCallback(async () => {
    if (!file) return;
    setUploadState("validating");
    setErrorMsg("");

    try {
      const text = await file.slice(0, 5000).text();
      const lines = text.split("\n");
      const headerRow = lines[0]?.split(",").map((h) => h.trim());
      const rowCount = lines.length - 1;

      const res = await fetch("/api/reports/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType, headerRow, rowCount }),
      });
      const data = await res.json();
      setValidation(data);
      setUploadState(data.valid ? "idle" : "error");
      if (!data.valid) setErrorMsg("Validation failed — check column errors below");
    } catch (err) {
      setUploadState("error");
      setErrorMsg(err instanceof Error ? err.message : "Validation failed");
    }
  }, [file, reportType]);

  const handleUpload = useCallback(async () => {
    if (!file || !user) return;

    setUploadState("uploading");
    setStatusMsg("Getting upload URL...");
    setErrorMsg("");
    setProcessingResults([]);

    try {
      // 1. Get presigned URL
      const urlRes = await fetch("/api/reports/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType, month, filename: file.name }),
      });
      const { url, key } = await urlRes.json();
      if (!url) throw new Error("Failed to get upload URL");

      // 2. Upload to S3
      setStatusMsg("Uploading to S3...");
      const uploadRes = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": "text/csv" } });
      if (!uploadRes.ok) throw new Error("S3 upload failed");

      // 3. Record in Convex
      setStatusMsg("Recording upload...");
      const uploadId = await recordUpload({
        reportType,
        fileName: file.name,
        fileSize: file.size,
        s3Key: key,
        reportingMonth: month,
        rowCount: validation?.rowCount,
        validationStatus: validation?.valid ? "valid" : "warning",
        uploadedBy: user._id,
        uploadedByName: user.name || "Unknown",
      });

      // 4. Trigger processing
      setUploadState("processing");
      setStatusMsg("Processing report data...");

      const processRes = await fetch("/api/reports/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, reportType, s3Key: key, month }),
      });
      const processData = await processRes.json();
      setProcessingResults(processData.results || []);

      setUploadState("complete");
      setStatusMsg("Upload and processing complete!");
    } catch (err) {
      setUploadState("error");
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
    }
  }, [file, user, reportType, month, validation, recordUpload]);

  if (!canAccess) {
    return (
      <Protected>
        <div className="flex h-screen theme-bg-primary">
          <Sidebar />
          <main className="flex-1 flex items-center justify-center">
            <MobileHeader />
            <div className={`text-center p-8 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
              <p className="text-lg font-medium">Access Denied</p>
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

          <header className={`sticky top-0 z-10 border-b px-6 py-4 ${isDark ? "bg-slate-900/95 backdrop-blur border-slate-700" : "bg-white/95 backdrop-blur border-gray-200"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link href="/reports" className={`p-2 rounded-lg transition-colors ${isDark ? "hover:bg-slate-800 text-slate-400" : "hover:bg-gray-200 text-gray-500"}`}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </Link>
                <div>
                  <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Upload JMK Reports</h1>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>Upload and process JMK report files</p>
                </div>
              </div>
            </div>
          </header>

          <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
            {/* Upload Form */}
            <div className={`rounded-xl border p-6 ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Report Type</label>
                  <select
                    value={reportType}
                    onChange={(e) => { setReportType(e.target.value); setValidation(null); }}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                  >
                    {REPORT_TYPES.map((t) => (
                      <option key={t.code} value={t.code}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Reporting Month</label>
                  <input
                    type="month"
                    value={`${month.slice(0, 4)}-${month.slice(4, 6)}`}
                    onChange={(e) => setMonth(e.target.value.replace("-", ""))}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                  />
                </div>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? isDark ? "border-cyan-500 bg-cyan-500/10" : "border-blue-400 bg-blue-50"
                    : file
                      ? isDark ? "border-emerald-500/50 bg-emerald-500/5" : "border-emerald-300 bg-emerald-50"
                      : isDark ? "border-slate-600 hover:border-slate-500" : "border-gray-300 hover:border-gray-400"
                }`}
              >
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx" onChange={handleFileSelect} className="hidden" />
                {file ? (
                  <div>
                    <svg className={`w-8 h-8 mx-auto mb-2 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>{file.name}</p>
                    <p className={`text-xs mt-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                ) : (
                  <div>
                    <svg className={`w-8 h-8 mx-auto mb-2 ${isDark ? "text-slate-500" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className={`text-sm ${isDark ? "text-slate-400" : "text-gray-500"}`}>Drop a CSV file here or click to browse</p>
                  </div>
                )}
              </div>

              {/* Validation result */}
              {validation && (
                <div className={`mt-4 p-3 rounded-lg text-sm ${
                  validation.valid
                    ? isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                    : isDark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-700"
                }`}>
                  {validation.valid ? (
                    <p>Valid {reportType} format — {validation.detectedColumns} columns, ~{validation.rowCount} rows</p>
                  ) : (
                    <div>
                      <p className="font-medium mb-1">Validation errors:</p>
                      <ul className="list-disc list-inside text-xs space-y-0.5">
                        {validation.errors?.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Processing results */}
              {processingResults.length > 0 && (
                <div className="mt-4 space-y-2">
                  {processingResults.map((r, i) => (
                    <div key={i} className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                      r.status === "success"
                        ? isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                        : isDark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-700"
                    }`}>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.status === "success" ? "bg-emerald-500" : "bg-red-500"}`} />
                      <span className="font-medium">{r.trigger}</span>
                      {r.message && <span className="text-xs opacity-75">— {r.message}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Error */}
              {errorMsg && uploadState === "error" && (
                <div className={`mt-4 p-3 rounded-lg text-sm ${isDark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-700"}`}>
                  {errorMsg}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 mt-5">
                {file && !validation && (
                  <button
                    onClick={handleValidate}
                    disabled={uploadState === "validating"}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${isDark ? "bg-slate-700 text-white hover:bg-slate-600" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
                  >
                    {uploadState === "validating" ? "Validating..." : "Validate"}
                  </button>
                )}
                {file && (
                  <button
                    onClick={handleUpload}
                    disabled={uploadState === "uploading" || uploadState === "processing" || uploadState === "complete"}
                    className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${isDark ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
                  >
                    {uploadState === "uploading" ? "Uploading..." : uploadState === "processing" ? "Processing..." : uploadState === "complete" ? "Done!" : "Upload & Process"}
                  </button>
                )}
              </div>

              {/* Status message */}
              {statusMsg && uploadState !== "idle" && uploadState !== "error" && (
                <p className={`mt-3 text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>{statusMsg}</p>
              )}
            </div>

            {/* Upload History */}
            <div className={`rounded-xl border ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
              <div className={`px-6 py-4 border-b ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                <h2 className={`text-sm font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>Upload History</h2>
              </div>
              <div className="overflow-x-auto">
                {!uploadHistory || uploadHistory.length === 0 ? (
                  <p className={`p-6 text-sm text-center ${isDark ? "text-slate-500" : "text-gray-400"}`}>No uploads yet</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={isDark ? "border-b border-slate-700" : "border-b border-gray-200"}>
                        {["File", "Type", "Month", "Rows", "Status", "Uploaded", "By"].map((h) => (
                          <th key={h} className={`text-left px-4 py-3 text-xs font-semibold ${isDark ? "text-slate-400" : "text-gray-500"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uploadHistory.map((u) => (
                        <tr key={u._id} className={`border-b ${isDark ? "border-slate-700/50" : "border-gray-100"}`}>
                          <td className={`px-4 py-2.5 font-mono text-xs truncate max-w-[200px] ${isDark ? "text-white" : "text-gray-900"}`}>{u.fileName}</td>
                          <td className={`px-4 py-2.5 ${isDark ? "text-slate-300" : "text-gray-700"}`}>{u.reportType}</td>
                          <td className={`px-4 py-2.5 ${isDark ? "text-slate-300" : "text-gray-700"}`}>{formatMonth(u.reportingMonth)}</td>
                          <td className={`px-4 py-2.5 ${isDark ? "text-slate-300" : "text-gray-700"}`}>{u.rowCount ?? "—"}</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              u.processingStatus === "complete" ? "bg-emerald-500/20 text-emerald-400" :
                              u.processingStatus === "processing" ? "bg-blue-500/20 text-blue-400" :
                              u.processingStatus === "failed" ? "bg-red-500/20 text-red-400" :
                              "bg-slate-500/20 text-slate-400"
                            }`}>
                              {u.processingStatus}
                            </span>
                          </td>
                          <td className={`px-4 py-2.5 text-xs ${isDark ? "text-slate-500" : "text-gray-400"}`}>
                            {new Date(u.createdAt).toLocaleDateString()}
                          </td>
                          <td className={`px-4 py-2.5 text-xs ${isDark ? "text-slate-500" : "text-gray-400"}`}>{u.uploadedByName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </Protected>
  );
}
