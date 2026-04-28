"use client";

import { useState, useEffect } from "react";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useTheme } from "@/app/theme-context";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

type Attachment = Doc<"emailAttachments">;

interface AttachmentViewerProps {
  attachment: Attachment;
  attachmentUrl: string | null;
  userId: Id<"users">;
  userName: string;
  accountId?: Id<"emailAccounts">;
  onClose: () => void;
  onFetched?: () => void;
}

// Document categories for DocHub
const DEFAULT_CATEGORIES = [
  { value: "forms", label: "Forms" },
  { value: "policies", label: "Policies" },
  { value: "sops", label: "SOPs" },
  { value: "templates", label: "Templates" },
  { value: "training", label: "Training" },
  { value: "reports", label: "Reports" },
  { value: "financials", label: "Financials" },
  { value: "hr", label: "HR" },
  { value: "other", label: "Other" },
];

export default function AttachmentViewer({
  attachment,
  attachmentUrl,
  userId,
  userName,
  accountId,
  onClose,
  onFetched,
}: AttachmentViewerProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [documentName, setDocumentName] = useState(attachment.fileName);
  const [category, setCategory] = useState("other");
  const [customCategory, setCustomCategory] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [csvContent, setCsvContent] = useState<string[][] | null>(null);
  const [loadingCsv, setLoadingCsv] = useState(false);

  const saveToDocHub = useMutation(api.email.emails.saveAttachmentToDocHub);

  // Determine file type for viewer (must be before useEffect)
  const mimeType = attachment.mimeType.toLowerCase();
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType.includes("pdf");
  const isWord = mimeType.includes("word") || mimeType.includes("document") || mimeType.includes("msword");
  const isExcel = mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("sheet");
  const isPowerPoint = mimeType.includes("presentation") || mimeType.includes("powerpoint");
  const isCsv = mimeType.includes("csv") || attachment.fileName.endsWith(".csv");
  const isText = mimeType.startsWith("text/") && !isCsv;
  const isOffice = isWord || isExcel || isPowerPoint;

  // Load CSV/text content for preview
  useEffect(() => {
    if ((isCsv || isText) && attachmentUrl && !csvContent) {
      setLoadingCsv(true);
      fetch(attachmentUrl)
        .then(r => r.text())
        .then(text => {
          const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
          const rows = lines.slice(0, 200).map(line => {
            const fields: string[] = [];
            let field = "", inQ = false;
            for (let i = 0; i < line.length; i++) {
              const ch = line[i];
              if (inQ) { if (ch === '"') { if (line[i+1] === '"') { field += '"'; i++; } else inQ = false; } else field += ch; }
              else { if (ch === '"') inQ = true; else if (ch === ',') { fields.push(field); field = ''; } else field += ch; }
            }
            fields.push(field);
            return fields;
          });
          setCsvContent(rows);
        })
        .catch(() => {})
        .finally(() => setLoadingCsv(false));
    }
  }, [isCsv, isText, attachmentUrl, csvContent]);
  const fetchAttachment = (api as any).email?.sync?.fetchAttachment;

  const handleFetchFromServer = async () => {
    if (!accountId) return;
    setIsFetching(true);
    setFetchError("");
    try {
      const res = await fetch("/api/email/fetch-attachment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentId: attachment._id, accountId }),
      });
      const data = await res.json();
      if (data.success) {
        onFetched?.();
      } else {
        setFetchError(data.error || "Failed to fetch");
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setIsFetching(false);
    }
  };

  // Get viewer URL
  const getViewerUrl = () => {
    if (!attachmentUrl) return null;

    if (isOffice) {
      // Use Microsoft Office Online Viewer
      return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(attachmentUrl)}`;
    }

    // For PDF and images, use direct URL
    return attachmentUrl;
  };

  const viewerUrl = getViewerUrl();

  const handleSaveToDocHub = async () => {
    setIsSaving(true);
    try {
      await saveToDocHub({
        attachmentId: attachment._id,
        userId,
        userName,
        documentName,
        category: category === "_custom" ? (customCategory.toLowerCase().replace(/\s+/g, "-") || "other") : category,
      });
      setSaveSuccess(true);
      setTimeout(() => {
        setShowSaveModal(false);
        setSaveSuccess(false);
      }, 1500);
    } catch (error) {
      console.error("Failed to save to DocHub:", error);
      alert("Failed to save to DocHub. The attachment may not be cached locally.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = async () => {
    if (attachmentUrl) {
      try {
        const res = await fetch(attachmentUrl);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = attachment.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      } catch {
        // Fallback: open in new tab
        window.open(attachmentUrl, "_blank");
      }
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getFileIcon = () => {
    if (isPdf) return "📄";
    if (isWord) return "📝";
    if (isExcel) return "📊";
    if (isPowerPoint) return "📽️";
    if (isImage) return "🖼️";
    return "📎";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className={`w-full h-full max-w-6xl max-h-[90vh] mx-4 my-4 flex flex-col rounded-xl shadow-2xl ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl">{getFileIcon()}</span>
            <div className="min-w-0">
              <h3 className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {attachment.fileName}
              </h3>
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                {formatFileSize(attachment.size)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Fetch from server when not cached */}
            {!attachment.storageId && accountId && (
              <button
                onClick={handleFetchFromServer}
                disabled={isFetching}
                className="flex items-center gap-2 px-3 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {isFetching ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                )}
                {isFetching ? "Fetching..." : "Fetch from Server"}
              </button>
            )}
            {fetchError && <span className="text-xs text-red-400">{fetchError}</span>}
            {/* Save to DocHub button */}
            {(attachment.storageId || attachmentUrl) && (
              <button
                onClick={() => setShowSaveModal(true)}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Save to DocHub
              </button>
            )}

            {/* Download button */}
            <button
              onClick={handleDownload}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isDark
                  ? 'bg-slate-700 hover:bg-slate-600 text-white'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${
                isDark
                  ? 'hover:bg-slate-700 text-slate-400 hover:text-white'
                  : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Viewer */}
        <div className="flex-1 overflow-hidden bg-gray-100">
          {!attachmentUrl ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <svg className={`w-16 h-16 mx-auto mb-4 ${isFetching ? "text-cyan-400 animate-pulse" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {isFetching ? (
                  <>
                    <p className="text-cyan-400 font-medium">Fetching from mail server...</p>
                    <p className="text-gray-500 text-sm mt-1">This may take a moment</p>
                  </>
                ) : (
                  <>
                    <p className="text-gray-500">{fetchError || "Attachment not cached locally"}</p>
                    <button
                      onClick={accountId ? handleFetchFromServer : handleDownload}
                      className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium"
                    >
                      {accountId ? "Fetch from Mail Server" : "Download to View"}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (isCsv || isText) && attachmentUrl ? (
            <div className="h-full overflow-auto bg-white">
              {loadingCsv ? (
                <div className="flex items-center justify-center h-full"><div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : csvContent ? (
                <table className="text-xs border-collapse w-full">
                  <thead className="sticky top-0 bg-gray-100">
                    <tr>
                      {csvContent[0]?.map((h, i) => (
                        <th key={i} className="border border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-700 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvContent.slice(1).map((row, ri) => (
                      <tr key={ri} className={ri % 2 ? "bg-gray-50" : ""}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="border border-gray-100 px-2 py-1 text-gray-600 whitespace-nowrap">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="p-4 text-gray-400">Could not load preview</p>
              )}
              {csvContent && csvContent.length >= 200 && (
                <p className="text-center text-xs text-gray-400 py-2">Showing first 200 rows — download for full file</p>
              )}
            </div>
          ) : isImage ? (
            <div className="h-full flex items-center justify-center p-4 overflow-auto">
              <img
                src={attachmentUrl}
                alt={attachment.fileName}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : isPdf && viewerUrl ? (
            <object data={viewerUrl} type="application/pdf" className="w-full h-full">
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <span className="text-6xl mb-4 block">📄</span>
                  <p className="text-gray-500 mb-4">PDF preview not available in this browser</p>
                  <div className="flex gap-3 justify-center">
                    <a href={viewerUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium">
                      Open in New Tab
                    </a>
                    <button onClick={handleDownload} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
                      Download
                    </button>
                  </div>
                </div>
              </div>
            </object>
          ) : viewerUrl ? (
            <iframe
              src={viewerUrl}
              className="w-full h-full border-0"
              title={attachment.fileName}
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <span className="text-6xl mb-4 block">{getFileIcon()}</span>
                <p className="text-gray-500 mb-4">Preview not available for this file type</p>
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                >
                  Download to View
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save to DocHub Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
          <div className={`w-full max-w-md mx-4 rounded-xl shadow-2xl ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
            <div className={`px-6 py-4 border-b ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
              <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Save to DocHub
              </h3>
            </div>

            <div className="p-6 space-y-4">
              {saveSuccess ? (
                <div className="text-center py-8">
                  <svg className="w-16 h-16 mx-auto mb-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className={`text-lg font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Saved to DocHub!
                  </p>
                </div>
              ) : (
                <>
                  {/* Document Name */}
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                      Document Name
                    </label>
                    <input
                      type="text"
                      value={documentName}
                      onChange={(e) => setDocumentName(e.target.value)}
                      className={`w-full px-3 py-2 rounded-lg border ${
                        isDark
                          ? 'bg-slate-700 border-slate-600 text-white'
                          : 'bg-white border-gray-300 text-gray-900'
                      } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                      Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => { setCategory(e.target.value); if (e.target.value !== "_custom") setCustomCategory(""); }}
                      className={`w-full px-3 py-2 rounded-lg border ${
                        isDark
                          ? 'bg-slate-700 border-slate-600 text-white'
                          : 'bg-white border-gray-300 text-gray-900'
                      } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                    >
                      {DEFAULT_CATEGORIES.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                      <option value="_custom">+ New Category...</option>
                    </select>
                    {category === "_custom" && (
                      <input
                        type="text"
                        value={customCategory}
                        onChange={(e) => setCustomCategory(e.target.value)}
                        placeholder="Enter category name..."
                        className={`w-full mt-2 px-3 py-2 rounded-lg border ${
                          isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                        }`}
                        autoFocus
                      />
                    )}
                  </div>
                </>
              )}
            </div>

            {!saveSuccess && (
              <div className={`px-6 py-4 border-t ${isDark ? 'border-slate-700' : 'border-gray-200'} flex justify-end gap-3`}>
                <button
                  onClick={() => setShowSaveModal(false)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isDark
                      ? 'bg-slate-700 hover:bg-slate-600 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveToDocHub}
                  disabled={isSaving || !documentName.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {isSaving && (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {isSaving ? "Saving..." : "Save to DocHub"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
