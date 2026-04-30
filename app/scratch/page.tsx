"use client";

import { useState, useCallback, useEffect } from "react";
import Protected from "@/app/protected";
import Sidebar, { MobileHeader } from "@/components/Sidebar";
import { useTheme } from "@/app/theme-context";
import { useAuth } from "@/app/auth-context";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function ScratchPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { user } = useAuth();

  const createCode = useMutation(api.scratchpad.createCode);
  const deleteCode = useMutation(api.scratchpad.deleteCode);

  // SEND side
  const [content, setContent] = useState("");
  const [generated, setGenerated] = useState<{ code: string; expiresAt: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sendError, setSendError] = useState("");

  // RECEIVE side
  const [code, setCode] = useState("");
  const [lookupCode, setLookupCode] = useState<string | null>(null);
  const fetched = useQuery(api.scratchpad.getByCode, lookupCode ? { code: lookupCode } : "skip");
  const [copied, setCopied] = useState(false);

  // Tick clock for the countdown.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!content.trim()) return;
    setGenerating(true);
    setSendError("");
    try {
      const res = await createCode({
        content,
        createdBy: user?._id,
        createdByName: user?.name || undefined,
      });
      setGenerated(res);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to generate code");
    } finally {
      setGenerating(false);
    }
  }, [content, user, createCode]);

  const handleClear = useCallback(async () => {
    if (generated?.code) await deleteCode({ code: generated.code });
    setGenerated(null);
    setContent("");
    setSendError("");
  }, [generated, deleteCode]);

  const handleLookup = useCallback(() => {
    if (/^\d{4}$/.test(code)) {
      setLookupCode(code);
      setCopied(false);
    }
  }, [code]);

  const handleCopy = useCallback(async () => {
    if (!fetched) return;
    try {
      await navigator.clipboard.writeText(fetched.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard might be blocked — user can select manually */ }
  }, [fetched]);

  return (
    <Protected>
      <div className="flex h-screen theme-bg-primary">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <MobileHeader />
          <header className={`sticky top-0 z-10 border-b px-4 sm:px-6 py-4 ${isDark ? "bg-slate-900/95 backdrop-blur border-slate-700" : "bg-white/95 backdrop-blur border-gray-200"}`}>
            <div>
              <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Scratchpad</h1>
              <p className={`text-sm ${isDark ? "text-slate-200" : "text-gray-800"}`}>
                Paste here on one device, get a 4-digit code, type the code on another device to copy. Codes expire after 24 hours.
              </p>
            </div>
          </header>

          <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* SEND */}
            <section className={`rounded-xl border p-5 ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
              <h2 className={`text-sm font-semibold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>Send</h2>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={!!generated}
                placeholder="Paste a script, snippet, anything…"
                rows={12}
                className={`w-full px-3 py-2 rounded-lg border text-sm font-mono ${isDark ? "bg-slate-900 border-slate-600 text-white placeholder:text-slate-500 disabled:opacity-60" : "bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 disabled:opacity-60"}`}
              />
              {sendError && (
                <p className={`mt-2 text-xs ${isDark ? "text-red-400" : "text-red-600"}`}>{sendError}</p>
              )}
              {generated ? (
                <div className={`mt-4 p-4 rounded-lg text-center ${isDark ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-emerald-50 border border-emerald-200"}`}>
                  <p className={`text-xs mb-1 ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>Your code</p>
                  <p className={`text-5xl font-bold tracking-widest font-mono ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>{generated.code}</p>
                  <p className={`text-xs mt-2 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                    Expires in {formatRemaining(generated.expiresAt - now)}
                  </p>
                  <button onClick={handleClear} className={`mt-3 text-xs px-3 py-1 rounded ${isDark ? "text-red-400 hover:bg-red-500/10" : "text-red-600 hover:bg-red-50"}`}>
                    Clear and start over
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGenerate}
                  disabled={!content.trim() || generating}
                  className={`mt-4 w-full px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 ${isDark ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
                >
                  {generating ? "Generating…" : "Generate Code"}
                </button>
              )}
            </section>

            {/* RECEIVE */}
            <section className={`rounded-xl border p-5 ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
              <h2 className={`text-sm font-semibold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>Receive</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  onKeyDown={(e) => { if (e.key === "Enter") handleLookup(); }}
                  placeholder="0000"
                  className={`flex-1 px-3 py-2 rounded-lg border text-2xl font-mono tracking-widest text-center ${isDark ? "bg-slate-900 border-slate-600 text-white placeholder:text-slate-600" : "bg-white border-gray-300 text-gray-900 placeholder:text-gray-300"}`}
                />
                <button
                  onClick={handleLookup}
                  disabled={!/^\d{4}$/.test(code)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 ${isDark ? "bg-cyan-600 text-white hover:bg-cyan-500" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                >
                  Look up
                </button>
              </div>

              {lookupCode && fetched === undefined && (
                <p className={`mt-4 text-xs ${isDark ? "text-slate-500" : "text-gray-400"}`}>Loading…</p>
              )}
              {lookupCode && fetched === null && (
                <p className={`mt-4 text-xs ${isDark ? "text-red-400" : "text-red-600"}`}>
                  No active code matches {lookupCode}. It may have expired or never existed.
                </p>
              )}
              {fetched && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                      {fetched.createdByName ? `From ${fetched.createdByName} · ` : ""}Expires in {formatRemaining(fetched.expiresAt - now)}
                    </p>
                    <button
                      onClick={handleCopy}
                      className={`px-3 py-1 rounded text-xs font-semibold ${copied ? (isDark ? "bg-emerald-500 text-white" : "bg-emerald-600 text-white") : (isDark ? "bg-slate-700 text-slate-200 hover:bg-slate-600" : "bg-gray-200 text-gray-700 hover:bg-gray-300")}`}
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={fetched.content}
                    rows={12}
                    onFocus={(e) => e.currentTarget.select()}
                    className={`w-full px-3 py-2 rounded-lg border text-sm font-mono ${isDark ? "bg-slate-900 border-slate-600 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                  />
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </Protected>
  );
}
