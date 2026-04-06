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
  { code: "OEA07V", label: "OEA07V — Daily Sales (CSV)", description: "Daily item-level sales/returns — fuels WTD Commission and Dunlop", accept: ".csv,.xlsx" },
  { code: "oeival", label: "OEIVAL — Inventory Snapshot", description: "Inventory quantities, costs, pricing by warehouse (.xlsx)", accept: ".xlsx" },
  { code: "oea07v-sales", label: "Sales History — Monthly Totals", description: "Monthly sales by item with stock levels (.xlsx)", accept: ".xlsx", needsWarehouse: true },
  { code: "tires", label: "Tires Catalog", description: "Product catalog with tire specs (~50K rows, .csv)", accept: ".csv" },
  { code: "ART24T", label: "ART24T — Transaction Analysis", description: "A/R transaction detail with profitability and commission", accept: ".csv,.xlsx" },
  { code: "ART30S", label: "ART30S — Sales Summary", description: "Sales summary by date range with totals", accept: ".csv,.xlsx" },
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

  const dataUploads = useQuery(api.reportData.listUploads, {});
  const ftpConnections = useQuery(api.ftpConnections.list);
  const uploadAccess = useQuery(api.jmkUploads.getUploadAccessWithNames);
  const allUsers = useQuery(api.auth.getAllUsers);
  const setUploadAccess = useMutation(api.jmkUploads.setUploadAccess);
  const [accessSearch, setAccessSearch] = useState("");
  const createFtp = useMutation(api.ftpConnections.create);
  const removeFtp = useMutation(api.ftpConnections.remove);

  const [activeTab, setActiveTab] = useState<"upload" | "ftp" | "access">("upload");
  const [ftpForm, setFtpForm] = useState({ name: "", host: "", port: "21", username: "", password: "", remotePath: "/", filePattern: "tires-*.csv", sourceType: "tires", frequency: "hourly" });
  const [ftpTesting, setFtpTesting] = useState(false);
  const [ftpTestResult, setFtpTestResult] = useState<{ connected: boolean; message: string; files?: string[] } | null>(null);
  const [savingFtp, setSavingFtp] = useState(false);

  const [reportType, setReportType] = useState("OEA07V");
  const [selectedWarehouse, setSelectedWarehouse] = useState("");
  const month = getDefaultMonth(); // Auto-detected from current date
  const [files, setFiles] = useState<File[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0); // For multi-file: current index
  const [validation, setValidation] = useState<{ valid: boolean; errors?: string[]; detectedColumns?: number; rowCount?: number; dateRangeStart?: string; dateRangeEnd?: string } | null>(null);
  const [processingResults, setProcessingResults] = useState<{ trigger: string; status: string; message?: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter(
      (f) => f.name.endsWith(".csv") || f.name.endsWith(".xlsx")
    );
    if (dropped.length > 0) {
      setFiles(dropped);
      setValidation(null);
      setUploadState("idle");
      setErrorMsg("");
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) {
      setFiles(selected);
      setValidation(null);
      setUploadState("idle");
      setErrorMsg("");
    }
  }, []);

  // Convenience alias for single-file operations
  const file = files[0] || null;

  const handleValidate = useCallback(async () => {
    if (!file) return;
    setUploadState("validating");
    setErrorMsg("");

    try {
      // Read enough of the file for validation + date scanning
      const text = await file.text();
      const lines = text.split("\n");
      const headerRow = lines[0]?.split(",").map((h) => h.trim());
      const rowCount = lines.length - 1;

      const res = await fetch("/api/reports/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType, headerRow, rowCount }),
      });
      const data = await res.json();

      // Scan for date range in OEA07V files (Activity Date format MM/DD/YY)
      let dateRangeStart: string | undefined;
      let dateRangeEnd: string | undefined;
      if (reportType === "OEA07V" && data.valid) {
        const dates: Date[] = [];
        // Scan each line for MM/DD/YY date patterns (handles quoted CSV fields)
        const datePattern = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
        for (let i = 1; i < Math.min(lines.length, 50000); i++) {
          const line = lines[i];
          if (!line) continue;
          let m;
          while ((m = datePattern.exec(line)) !== null) {
            const mo = parseInt(m[1]);
            const day = parseInt(m[2]);
            let y = parseInt(m[3]);
            if (mo < 1 || mo > 12 || day < 1 || day > 31) continue;
            if (y < 100) y += 2000;
            const d = new Date(y, mo - 1, day);
            if (!isNaN(d.getTime()) && d.getFullYear() >= 2020 && d.getFullYear() <= 2030) {
              dates.push(d);
              break; // one date per row is enough
            }
          }
          datePattern.lastIndex = 0;
        }
        if (dates.length > 0) {
          dates.sort((a, b) => a.getTime() - b.getTime());
          dateRangeStart = dates[0].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          dateRangeEnd = dates[dates.length - 1].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        }
      }

      setValidation({ ...data, dateRangeStart, dateRangeEnd });
      setUploadState(data.valid ? "idle" : "error");
      if (!data.valid) setErrorMsg("Validation failed — check column errors below");
    } catch (err) {
      setUploadState("error");
      setErrorMsg(err instanceof Error ? err.message : "Validation failed");
    }
  }, [file, reportType]);

  const isDataSource = ["oeival", "oea07v-sales", "tires"].includes(reportType);
  const currentType = REPORT_TYPES.find((t) => t.code === reportType);

  const handleUpload = useCallback(async () => {
    if (files.length === 0 || !user) return;

    setUploadState("uploading");
    setStatusMsg("Uploading...");
    setErrorMsg("");
    setProcessingResults([]);

    const allResults: { trigger: string; status: string; message?: string }[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const currentFile = files[i];
        const fileLabel = files.length > 1 ? `(${i + 1}/${files.length}) ` : "";
        setUploadProgress(i);

        if (isDataSource) {
          const sourceType = reportType === "oea07v-sales" ? "oea07v-sales" : reportType;
          setStatusMsg(`${fileLabel}Getting upload URL for ${currentFile.name}...`);
          const urlRes = await fetch("/api/reports/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportType: sourceType, month, filename: currentFile.name }),
          });
          const { url, key } = await urlRes.json();
          if (!url) throw new Error(`Failed to get upload URL for ${currentFile.name}`);

          setStatusMsg(`${fileLabel}Uploading ${currentFile.name} to S3...`);
          const contentType = currentFile.name.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv";
          const uploadRes = await fetch(url, { method: "PUT", body: currentFile, headers: { "Content-Type": contentType } });
          if (!uploadRes.ok) throw new Error(`S3 upload failed for ${currentFile.name}`);

          await recordUpload({
            reportType: sourceType,
            fileName: currentFile.name,
            fileSize: currentFile.size,
            s3Key: key,
            reportingMonth: month,
            validationStatus: "valid",
            uploadedBy: user._id,
            uploadedByName: user.name || "Unknown",
          });

          allResults.push({
            trigger: "s3-upload",
            status: "success",
            message: `Uploaded ${currentFile.name} to S3 — available in reports immediately`,
          });
        } else {
          setStatusMsg(`${fileLabel}Getting upload URL for ${currentFile.name}...`);
          const urlRes = await fetch("/api/reports/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportType, month, filename: currentFile.name }),
          });
          const { url, key } = await urlRes.json();
          if (!url) throw new Error(`Failed to get upload URL for ${currentFile.name}`);

          setStatusMsg(`${fileLabel}Uploading ${currentFile.name} to S3...`);
          const contentType = currentFile.name.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv";
          const uploadRes = await fetch(url, { method: "PUT", body: currentFile, headers: { "Content-Type": contentType } });
          if (!uploadRes.ok) throw new Error(`S3 upload failed for ${currentFile.name}`);

          setStatusMsg(`${fileLabel}Recording ${currentFile.name}...`);
          const uploadId = await recordUpload({
            reportType,
            fileName: currentFile.name,
            fileSize: currentFile.size,
            s3Key: key,
            reportingMonth: month,
            rowCount: validation?.rowCount,
            dateRangeStart: validation?.dateRangeStart,
            dateRangeEnd: validation?.dateRangeEnd,
            validationStatus: validation?.valid ? "valid" : "warning",
            uploadedBy: user._id,
            uploadedByName: user.name || "Unknown",
          });

          // Only trigger processing on the last file to avoid duplicate runs
          if (i === files.length - 1) {
            setUploadState("processing");
            setStatusMsg(`${fileLabel}Processing...`);

            const processRes = await fetch("/api/reports/process", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ uploadId, reportType, s3Key: key, month }),
            });
            const processData = await processRes.json();
            allResults.push(...(processData.results || []));
          } else {
            allResults.push({
              trigger: "s3-upload",
              status: "success",
              message: `Uploaded ${currentFile.name} to S3`,
            });
          }
        }

        setProcessingResults([...allResults]);
      }

      setUploadState("complete");
      setStatusMsg(files.length > 1 ? `All ${files.length} files uploaded successfully!` : "Upload and processing complete!");
    } catch (err) {
      setUploadState("error");
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
    }
  }, [files, user, reportType, month, validation, recordUpload, isDataSource]);

  const handleTestFtp = useCallback(async () => {
    setFtpTesting(true);
    setFtpTestResult(null);
    try {
      const res = await fetch("/api/reports/ftp-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: ftpForm.host, port: parseInt(ftpForm.port) || 21, username: ftpForm.username, password: ftpForm.password, remotePath: ftpForm.remotePath }),
      });
      setFtpTestResult(await res.json());
    } catch (err) {
      setFtpTestResult({ connected: false, message: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setFtpTesting(false);
    }
  }, [ftpForm]);

  const handleSaveFtp = useCallback(async () => {
    if (!user || !ftpForm.name || !ftpForm.host || !ftpForm.username || !ftpForm.password) return;
    setSavingFtp(true);
    try {
      // Encrypt password before storing
      const encRes = await fetch("/api/reports/encrypt-value", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: ftpForm.password }),
      });
      const { encrypted } = await encRes.json();

      await createFtp({
        name: ftpForm.name,
        host: ftpForm.host,
        port: parseInt(ftpForm.port) || 21,
        username: ftpForm.username,
        password: encrypted,
        remotePath: ftpForm.remotePath,
        filePattern: ftpForm.filePattern,
        sourceType: ftpForm.sourceType,
        frequency: ftpForm.frequency,
        createdBy: user._id,
      });
      setFtpForm({ name: "", host: "", port: "21", username: "", password: "", remotePath: "/", filePattern: "tires-*.csv", sourceType: "tires", frequency: "hourly" });
      setFtpTestResult(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingFtp(false);
    }
  }, [ftpForm, user, createFtp]);

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
              <Link href="/reports/upload-status" className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}>
                Upload Calendar
              </Link>
            </div>
            {/* Tabs */}
            <div className="flex gap-1 mt-4">
              {(["upload", "ftp", ...(permissions.tier >= 5 ? ["access" as const] : [])] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab as any)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                    activeTab === tab
                      ? isDark ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-emerald-100 text-emerald-700 border border-emerald-300"
                      : isDark ? "text-slate-400 hover:text-slate-300 hover:bg-slate-800" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  }`}>
                  {tab === "upload" ? "Manual Upload" : tab === "ftp" ? `FTP Connections (${ftpConnections?.length ?? 0})` : "Access Control"}
                </button>
              ))}
            </div>
          </header>

          <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
            {/* FTP Tab */}
            {activeTab === "ftp" && (
              <div className="space-y-6">
                {/* New FTP Connection Form */}
                <div className={`rounded-xl border p-6 ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
                  <h2 className={`text-sm font-semibold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>New FTP Connection</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Connection Name</label>
                      <input type="text" value={ftpForm.name} onChange={(e) => setFtpForm({ ...ftpForm, name: e.target.value })}
                        placeholder="e.g. JMK Tires Catalog" className={`w-full px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`} />
                    </div>
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Source Type</label>
                      <select value={ftpForm.sourceType} onChange={(e) => setFtpForm({ ...ftpForm, sourceType: e.target.value })}
                        className={`w-full px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`}>
                        <option value="tires">Tires Catalog</option>
                        <option value="oeival">Inventory (OEIVAL)</option>
                        <option value="oea07v">Sales History (OEA07V)</option>
                      </select>
                    </div>
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-gray-600"}`}>FTP Host</label>
                      <input type="text" value={ftpForm.host} onChange={(e) => setFtpForm({ ...ftpForm, host: e.target.value })}
                        placeholder="ftp.example.com" className={`w-full px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`} />
                    </div>
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Port</label>
                      <input type="number" value={ftpForm.port} onChange={(e) => setFtpForm({ ...ftpForm, port: e.target.value })}
                        className={`w-full px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`} />
                    </div>
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Username</label>
                      <input type="text" value={ftpForm.username} onChange={(e) => setFtpForm({ ...ftpForm, username: e.target.value })}
                        className={`w-full px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`} />
                    </div>
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Password</label>
                      <input type="password" value={ftpForm.password} onChange={(e) => setFtpForm({ ...ftpForm, password: e.target.value })}
                        className={`w-full px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`} />
                    </div>
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Remote Path</label>
                      <input type="text" value={ftpForm.remotePath} onChange={(e) => setFtpForm({ ...ftpForm, remotePath: e.target.value })}
                        placeholder="/" className={`w-full px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`} />
                    </div>
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-gray-600"}`}>File Pattern</label>
                      <input type="text" value={ftpForm.filePattern} onChange={(e) => setFtpForm({ ...ftpForm, filePattern: e.target.value })}
                        placeholder="tires-*.csv" className={`w-full px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`} />
                    </div>
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Sync Frequency</label>
                      <select value={ftpForm.frequency} onChange={(e) => setFtpForm({ ...ftpForm, frequency: e.target.value })}
                        className={`w-full px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`}>
                        <option value="hourly">Hourly</option>
                        <option value="daily">Daily</option>
                        <option value="manual">Manual Only</option>
                      </select>
                    </div>
                  </div>

                  {/* Test result */}
                  {ftpTestResult && (
                    <div className={`mt-4 p-3 rounded-lg text-sm ${ftpTestResult.connected ? isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700" : isDark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-700"}`}>
                      <p className="font-medium">{ftpTestResult.connected ? "Connected!" : "Connection Failed"}</p>
                      <p className="text-xs mt-1">{ftpTestResult.message}</p>
                      {ftpTestResult.files && ftpTestResult.files.length > 0 && (
                        <p className="text-xs mt-1 opacity-75">Files: {ftpTestResult.files.join(", ")}</p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-3 mt-5">
                    <button onClick={handleTestFtp} disabled={ftpTesting || !ftpForm.host || !ftpForm.username}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${isDark ? "bg-slate-700 text-white hover:bg-slate-600" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}>
                      {ftpTesting ? "Testing..." : "Test Connection"}
                    </button>
                    <button onClick={handleSaveFtp} disabled={savingFtp || !ftpForm.name || !ftpForm.host || !ftpForm.username || !ftpForm.password}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${isDark ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>
                      {savingFtp ? "Saving..." : "Save Connection"}
                    </button>
                  </div>
                </div>

                {/* Existing FTP Connections */}
                <div className={`rounded-xl border ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
                  <div className={`px-6 py-4 border-b ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                    <h2 className={`text-sm font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>Active Connections</h2>
                  </div>
                  {!ftpConnections || ftpConnections.length === 0 ? (
                    <p className={`p-6 text-sm text-center ${isDark ? "text-slate-500" : "text-gray-400"}`}>No FTP connections configured</p>
                  ) : (
                    <div className="divide-y divide-slate-700/50">
                      {ftpConnections.map((conn) => (
                        <div key={conn._id} className="px-6 py-4 flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${conn.isActive ? conn.lastSyncStatus === "failed" ? "bg-red-500" : "bg-emerald-500" : "bg-slate-500"}`} />
                              <span className={`font-medium text-sm ${isDark ? "text-white" : "text-gray-900"}`}>{conn.name}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${isDark ? "bg-slate-700 text-slate-400" : "bg-gray-100 text-gray-500"}`}>{conn.sourceType}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] ${isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-50 text-blue-600"}`}>{conn.frequency}</span>
                            </div>
                            <div className={`text-xs mt-1 ${isDark ? "text-slate-500" : "text-gray-400"}`}>
                              {conn.host} — {conn.remotePath} — {conn.filePattern}
                              {conn.lastSyncAt && <span className="ml-2">Last sync: {new Date(conn.lastSyncAt).toLocaleString()}</span>}
                              {conn.lastSyncRowCount && <span className="ml-1">({conn.lastSyncRowCount} rows)</span>}
                              {conn.lastSyncError && <span className={`ml-2 ${isDark ? "text-red-400" : "text-red-600"}`}>{conn.lastSyncError}</span>}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={async () => {
                              const res = await fetch("/api/reports/ftp-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectionId: conn._id }) });
                              const data = await res.json();
                              alert(JSON.stringify(data.results || data, null, 2));
                            }} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${isDark ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" : "bg-blue-100 text-blue-700 hover:bg-blue-200"}`}>
                              Sync Now
                            </button>
                            <button onClick={() => { if (confirm("Delete this connection?")) removeFtp({ id: conn._id }); }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${isDark ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-red-100 text-red-700 hover:bg-red-200"}`}>
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Access Control Tab — T5 only */}
            {activeTab === "access" && permissions.tier >= 5 && (
              <div className={`rounded-xl border p-6 ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
                <h2 className={`text-sm font-semibold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>Upload Access Overrides</h2>
                <p className={`text-xs mb-4 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                  Grant upload access to users below T5. They will be able to upload reports.
                </p>
                <div className="relative mb-4">
                  <input type="text" value={accessSearch}
                    onChange={(e) => setAccessSearch(e.target.value)}
                    placeholder="Search users to grant access..."
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300"}`} />
                  {accessSearch.length >= 1 && (
                    <div className={`absolute z-20 w-full mt-1 rounded-lg border shadow-xl max-h-40 overflow-y-auto ${isDark ? "bg-slate-800 border-slate-600" : "bg-white border-gray-200"}`}>
                      {(allUsers ?? [])
                        .filter((u: any) => u.isActive && !(uploadAccess?.userIds || []).includes(u._id) && (u.name.toLowerCase().includes(accessSearch.toLowerCase()) || u.email?.toLowerCase().includes(accessSearch.toLowerCase())))
                        .slice(0, 8)
                        .map((u: any) => (
                          <button key={u._id} onClick={async () => {
                            if (!user) return;
                            await setUploadAccess({ userIds: [...(uploadAccess?.userIds || []), u._id], updatedBy: user._id });
                            setAccessSearch("");
                          }} className={`w-full text-left px-3 py-2 text-sm ${isDark ? "text-slate-300 hover:bg-slate-700" : "text-gray-700 hover:bg-gray-100"}`}>
                            <span className="font-medium">{u.name}</span>
                            <span className={`ml-2 ${isDark ? "text-slate-500" : "text-gray-400"}`}>{u.email}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
                {uploadAccess?.users && uploadAccess.users.length > 0 ? (
                  <div className="space-y-2">
                    {uploadAccess.users.map((u: any) => u && (
                      <div key={u._id} className={`flex items-center justify-between px-3 py-2 rounded-lg ${isDark ? "bg-slate-900/50" : "bg-gray-50"}`}>
                        <div>
                          <span className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>{u.name}</span>
                          <span className={`text-xs ml-2 ${isDark ? "text-slate-500" : "text-gray-400"}`}>{u.email}</span>
                        </div>
                        <button onClick={async () => {
                          if (!user) return;
                          await setUploadAccess({ userIds: (uploadAccess?.userIds || []).filter((id: any) => id !== u._id), updatedBy: user._id });
                        }} className={`text-xs px-2 py-1 rounded ${isDark ? "text-red-400 hover:bg-red-500/20" : "text-red-600 hover:bg-red-100"}`}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={`text-sm ${isDark ? "text-slate-500" : "text-gray-400"}`}>No access overrides configured. Only T5 users can upload.</p>
                )}
              </div>
            )}

            {/* Upload Tab */}
            {activeTab === "upload" && <>
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
                {currentType?.needsWarehouse && (
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Warehouse</label>
                    <select
                      value={selectedWarehouse}
                      onChange={(e) => setSelectedWarehouse(e.target.value)}
                      className={`w-full px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                    >
                      <option value="">Select warehouse...</option>
                      <option value="R10">R10 — Latrobe</option>
                      <option value="EXP">EXP — Export / Everson</option>
                      <option value="R30">R30 — Chestnut Ridge</option>
                    </select>
                  </div>
                )}
                {!isDataSource && (
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Filing Period</label>
                    <div className={`px-3 py-2 rounded-lg border text-sm font-medium ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300 text-gray-900"}`}>
                      {formatMonth(month)} — dates auto-detected from file
                    </div>
                  </div>
                )}
              </div>

              {/* Drop zone */}
              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                htmlFor="file-upload-input"
                className={`block border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? isDark ? "border-cyan-500 bg-cyan-500/10" : "border-blue-400 bg-blue-50"
                    : files.length > 0
                      ? isDark ? "border-emerald-500/50 bg-emerald-500/5" : "border-emerald-300 bg-emerald-50"
                      : isDark ? "border-slate-600 hover:border-slate-500" : "border-gray-300 hover:border-gray-400"
                }`}
              >
                <input id="file-upload-input" ref={fileInputRef} type="file" accept=".csv,.xlsx" multiple onChange={handleFileSelect}
                  className="sr-only" />
                {files.length > 0 ? (
                  <div>
                    <svg className={`w-8 h-8 mx-auto mb-2 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {files.length === 1 ? (
                      <>
                        <p className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>{files[0].name}</p>
                        <p className={`text-xs mt-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>{(files[0].size / 1024).toFixed(0)} KB</p>
                      </>
                    ) : (
                      <>
                        <p className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>{files.length} files selected</p>
                        <div className={`text-xs mt-1 space-y-0.5 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                          {files.map((f, i) => (
                            <p key={i}>{f.name} — {(f.size / 1024).toFixed(0)} KB</p>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div>
                    <svg className={`w-8 h-8 mx-auto mb-2 ${isDark ? "text-slate-500" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className={`text-sm ${isDark ? "text-slate-400" : "text-gray-500"}`}>Drop a file here or click to browse (.csv, .xlsx)</p>
                  </div>
                )}
              </label>

              {/* Validation result */}
              {validation && (
                <div className={`mt-4 p-3 rounded-lg text-sm ${
                  validation.valid
                    ? isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                    : isDark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-700"
                }`}>
                  {validation.valid ? (
                    <p>
                      Valid {reportType} format — {validation.detectedColumns} columns, ~{validation.rowCount} rows
                      {validation.dateRangeStart && validation.dateRangeEnd && (
                        <span className={`ml-2 font-medium ${isDark ? "text-cyan-400" : "text-blue-700"}`}>
                          — Dates: {validation.dateRangeStart} to {validation.dateRangeEnd}
                        </span>
                      )}
                    </p>
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
                {files.length === 1 && !validation && uploadState !== "complete" && (
                  <button
                    onClick={handleValidate}
                    disabled={uploadState === "validating"}
                    className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${isDark ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
                  >
                    {uploadState === "validating" ? "Validating..." : "Validate & Preview"}
                  </button>
                )}
                {((files.length === 1 && validation?.valid) || files.length > 1) && uploadState !== "complete" && (
                  <button
                    onClick={handleUpload}
                    disabled={uploadState === "uploading" || uploadState === "processing"}
                    className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${isDark ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
                  >
                    {uploadState === "uploading" ? `Uploading${files.length > 1 ? ` (${uploadProgress + 1}/${files.length})` : ""}...` : uploadState === "processing" ? "Processing..." : files.length > 1 ? `Upload ${files.length} Files` : "Upload & Process"}
                  </button>
                )}
                {uploadState === "complete" && (
                  <button
                    onClick={() => { setFiles([]); setValidation(null); setUploadState("idle"); setStatusMsg(""); setProcessingResults([]); setErrorMsg(""); }}
                    className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${isDark ? "bg-slate-700 text-white hover:bg-slate-600" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
                  >
                    Upload Another
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
                        {["File", "Type", "Date Range", "Rows", "Status", "Uploaded", "By"].map((h) => (
                          <th key={h} className={`text-left px-4 py-3 text-xs font-semibold ${isDark ? "text-slate-400" : "text-gray-500"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uploadHistory.map((u: any) => (
                        <tr key={u._id} className={`border-b ${isDark ? "border-slate-700/50" : "border-gray-100"}`}>
                          <td className={`px-4 py-2.5 font-mono text-xs truncate max-w-[200px] ${isDark ? "text-white" : "text-gray-900"}`}>{u.fileName}</td>
                          <td className={`px-4 py-2.5 ${isDark ? "text-slate-300" : "text-gray-700"}`}>{u.reportType}</td>
                          <td className={`px-4 py-2.5 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                            {u.dateRangeStart && u.dateRangeEnd
                              ? <span className="text-xs">{u.dateRangeStart} — {u.dateRangeEnd}</span>
                              : formatMonth(u.reportingMonth)}
                          </td>
                          <td className={`px-4 py-2.5 ${isDark ? "text-slate-300" : "text-gray-700"}`}>{u.rowCount ?? "—"}</td>
                          <td className="px-4 py-2.5">
                            <div>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                u.processingStatus === "complete" ? "bg-emerald-500/20 text-emerald-400" :
                                u.processingStatus === "processing" ? "bg-blue-500/20 text-blue-400" :
                                u.processingStatus === "failed" ? "bg-red-500/20 text-red-400" :
                                "bg-slate-500/20 text-slate-400"
                              }`}>
                                {u.processingStatus}
                              </span>
                              {/* Show processing details */}
                              {u.processingResults && u.processingResults.length > 0 && (
                                <div className="mt-1 space-y-0.5">
                                  {u.processingResults.map((r: any, i: number) => (
                                    <div key={i} className={`text-[10px] ${r.status === "success" ? isDark ? "text-emerald-500" : "text-emerald-600" : isDark ? "text-red-400" : "text-red-600"}`}>
                                      {r.trigger}: {r.message || r.status}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
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
            </>}
          </div>
        </main>
      </div>
    </Protected>
  );
}
