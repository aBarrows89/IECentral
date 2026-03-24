"use client";

import { useState } from "react";
import Link from "next/link";
import Protected from "../../protected";
import Sidebar, { MobileHeader } from "@/components/Sidebar";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useTheme } from "../../theme-context";
import { useAuth } from "../../auth-context";

const SERVICES = [
  "Convex",
  "Vercel",
  "GitHub",
  "AWS",
  "Stripe",
  "SendGrid",
  "Twilio",
  "Google Cloud",
  "Firebase",
  "Clerk",
  "Other",
];

const KEY_TYPES = [
  { value: "deploy_key", label: "Deploy Key" },
  { value: "api_key", label: "API Key" },
  { value: "secret", label: "Secret" },
  { value: "token", label: "Token" },
  { value: "password", label: "Password" },
  { value: "client_id", label: "Client ID" },
  { value: "client_secret", label: "Client Secret" },
  { value: "webhook_secret", label: "Webhook Secret" },
  { value: "other", label: "Other" },
];

const ENVIRONMENTS = [
  { value: "production", label: "Production" },
  { value: "development", label: "Development" },
  { value: "staging", label: "Staging" },
];

import { usePermissions } from "@/lib/usePermissions";

function CredentialsContent() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { user } = useAuth();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState<Id<"credentials"> | null>(null);
  const [showValue, setShowValue] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [service, setService] = useState("Convex");
  const [customService, setCustomService] = useState("");
  const [keyType, setKeyType] = useState("api_key");
  const [value, setValue] = useState("");
  const [environment, setEnvironment] = useState("");
  const [project, setProject] = useState("");
  const [notes, setNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const credentials = useQuery(api.credentials.list, user?._id ? { userId: user._id } : "skip");
  const createCredential = useMutation(api.credentials.create);
  const updateCredential = useMutation(api.credentials.update);
  const removeCredential = useMutation(api.credentials.remove);

  const permissions = usePermissions();
  const hasAccess = permissions.tier >= 5;

  if (!hasAccess) {
    return (
      <div className={`flex h-screen ${isDark ? "bg-slate-900" : "bg-[#f2f2f7]"}`}>
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
              Access Denied
            </h1>
            <p className={`mt-2 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
              Only the development team can access credentials.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const resetForm = () => {
    setName("");
    setService("Convex");
    setCustomService("");
    setKeyType("api_key");
    setValue("");
    setEnvironment("");
    setProject("");
    setNotes("");
    setExpiresAt("");
    setEditingId(null);
  };

  const handleEdit = (cred: NonNullable<typeof credentials>[0]) => {
    setEditingId(cred._id);
    setName(cred.name);
    setService(SERVICES.includes(cred.service) ? cred.service : "Other");
    setCustomService(SERVICES.includes(cred.service) ? "" : cred.service);
    setKeyType(cred.keyType);
    setValue(cred.value);
    setEnvironment(cred.environment || "");
    setProject(cred.project || "");
    setNotes(cred.notes || "");
    setExpiresAt(cred.expiresAt ? new Date(cred.expiresAt).toISOString().split("T")[0] : "");
    setShowCreateModal(true);
  };

  const handleSubmit = async () => {
    if (!user || !name.trim() || !value.trim()) return;

    try {
      const finalService = service === "Other" ? customService : service;
      const expiresAtTimestamp = expiresAt ? new Date(expiresAt).getTime() : undefined;

      if (editingId) {
        await updateCredential({
          id: editingId,
          name: name.trim(),
          service: finalService,
          keyType,
          value: value.trim(),
          environment: environment || undefined,
          project: project.trim() || undefined,
          notes: notes.trim() || undefined,
          expiresAt: expiresAtTimestamp,
          userId: user._id as Id<"users">,
        });
      } else {
        await createCredential({
          name: name.trim(),
          service: finalService,
          keyType,
          value: value.trim(),
          environment: environment || undefined,
          project: project.trim() || undefined,
          notes: notes.trim() || undefined,
          expiresAt: expiresAtTimestamp,
          userId: user._id as Id<"users">,
        });
      }

      resetForm();
      setShowCreateModal(false);
    } catch (error) {
      console.error("Failed to save credential:", error);
    }
  };

  const handleDelete = async (id: Id<"credentials">) => {
    if (!user || !confirm("Are you sure you want to delete this credential?")) return;

    try {
      await removeCredential({
        id,
        userId: user._id as Id<"users">,
      });
    } catch (error) {
      console.error("Failed to delete credential:", error);
    }
  };

  const toggleShowValue = (id: string) => {
    setShowValue((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Group credentials by service
  const groupedCredentials = (credentials || []).reduce((acc, cred) => {
    if (!acc[cred.service]) acc[cred.service] = [];
    acc[cred.service]!.push(cred);
    return acc;
  }, {} as Record<string, NonNullable<typeof credentials>>);

  return (
    <div className={`flex h-screen ${isDark ? "bg-slate-900" : "bg-[#f2f2f7]"}`}>
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <MobileHeader />

        {/* Header */}
        <header className={`sticky top-0 z-10 backdrop-blur-sm border-b px-4 sm:px-8 py-4 ${isDark ? "bg-slate-900/80 border-slate-700" : "bg-white/80 border-gray-200"}`}>
          <div className="flex items-center gap-4">
            <Link
              href="/settings"
              className={`p-2 rounded-lg transition-colors ${isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-gray-100 text-gray-500"}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="flex-1">
              <h1 className={`text-xl sm:text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                Credentials
              </h1>
              <p className={`text-xs sm:text-sm mt-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                Manage API keys, deploy keys, and other credentials
              </p>
            </div>
            <button
              onClick={() => {
                resetForm();
                setShowCreateModal(true);
              }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${isDark ? "bg-cyan-500 text-white hover:bg-cyan-600" : "bg-blue-600 text-white hover:bg-blue-700"}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Credential
            </button>
          </div>
        </header>

        <div className="p-4 sm:p-8">
          {/* Warning Banner */}
          <div className={`mb-6 p-4 rounded-lg border ${isDark ? "bg-amber-500/10 border-amber-500/30" : "bg-amber-50 border-amber-200"}`}>
            <div className="flex items-start gap-3">
              <svg className={`w-5 h-5 mt-0.5 ${isDark ? "text-amber-400" : "text-amber-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className={`font-medium ${isDark ? "text-amber-400" : "text-amber-700"}`}>Security Notice</p>
                <p className={`text-sm mt-1 ${isDark ? "text-amber-400/80" : "text-amber-600"}`}>
                  Credentials are stored in the database. Only development team members can view this page.
                  Never share these credentials outside the team.
                </p>
              </div>
            </div>
          </div>

          {/* Credentials List */}
          {!credentials || credentials.length === 0 ? (
            <div className={`text-center py-12 border rounded-xl ${isDark ? "bg-slate-800/50 border-slate-700 text-slate-400" : "bg-white border-gray-200 text-gray-500"}`}>
              No credentials stored yet. Add your first credential.
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedCredentials).map(([serviceName, creds]) => (
                <div key={serviceName}>
                  <h2 className={`text-lg font-semibold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
                    {serviceName}
                  </h2>
                  <div className="space-y-3">
                    {creds?.map((cred) => (
                      <div
                        key={cred._id}
                        className={`border rounded-xl p-4 ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200 shadow-sm"}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                                {cred.name}
                              </h3>
                              <span className={`px-2 py-0.5 text-xs rounded ${isDark ? "bg-slate-700 text-slate-300" : "bg-gray-100 text-gray-600"}`}>
                                {KEY_TYPES.find((t) => t.value === cred.keyType)?.label || cred.keyType}
                              </span>
                              {cred.environment && (
                                <span className={`px-2 py-0.5 text-xs rounded ${
                                  cred.environment === "production"
                                    ? isDark ? "bg-red-500/20 text-red-400" : "bg-red-100 text-red-600"
                                    : cred.environment === "staging"
                                    ? isDark ? "bg-amber-500/20 text-amber-400" : "bg-amber-100 text-amber-600"
                                    : isDark ? "bg-green-500/20 text-green-400" : "bg-green-100 text-green-600"
                                }`}>
                                  {cred.environment}
                                </span>
                              )}
                              {cred.expiresAt && cred.expiresAt < Date.now() && (
                                <span className={`px-2 py-0.5 text-xs rounded ${isDark ? "bg-red-500/20 text-red-400" : "bg-red-100 text-red-600"}`}>
                                  Expired
                                </span>
                              )}
                            </div>
                            {cred.project && (
                              <p className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                                Project: {cred.project}
                              </p>
                            )}

                            {/* Value field */}
                            <div className="mt-3 flex items-center gap-2">
                              <div className={`flex-1 font-mono text-sm px-3 py-2 rounded ${isDark ? "bg-slate-900 text-slate-300" : "bg-gray-50 text-gray-700"}`}>
                                {showValue[cred._id] ? cred.value : "••••••••••••••••••••"}
                              </div>
                              <button
                                onClick={() => toggleShowValue(cred._id)}
                                className={`p-2 rounded-lg transition-colors ${isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-gray-100 text-gray-500"}`}
                                title={showValue[cred._id] ? "Hide" : "Show"}
                              >
                                {showValue[cred._id] ? (
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                  </svg>
                                ) : (
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                )}
                              </button>
                              <button
                                onClick={() => copyToClipboard(cred.value, cred._id)}
                                className={`p-2 rounded-lg transition-colors ${isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-gray-100 text-gray-500"}`}
                                title="Copy"
                              >
                                {copiedId === cred._id ? (
                                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                )}
                              </button>
                            </div>

                            {cred.notes && (
                              <p className={`text-sm mt-2 ${isDark ? "text-slate-500" : "text-gray-400"}`}>
                                {cred.notes}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleEdit(cred)}
                              className={`p-2 rounded-lg transition-colors ${isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-gray-100 text-gray-500"}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(cred._id)}
                              className={`p-2 rounded-lg transition-colors text-red-400 hover:bg-red-500/10`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create/Edit Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className={`border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
              <div className="flex items-center justify-between mb-6">
                <h2 className={`text-xl font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                  {editingId ? "Edit Credential" : "Add Credential"}
                </h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  className={`p-1 rounded-lg transition-colors ${isDark ? "hover:bg-slate-700" : "hover:bg-gray-100"}`}
                >
                  <svg className={`w-5 h-5 ${isDark ? "text-slate-400" : "text-gray-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                    Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${isDark ? "bg-slate-900/50 border-slate-600 text-white focus:border-cyan-500" : "bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-500"}`}
                    placeholder="e.g., Convex Deploy Key - Production"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                      Service *
                    </label>
                    <select
                      value={service}
                      onChange={(e) => setService(e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${isDark ? "bg-slate-900/50 border-slate-600 text-white focus:border-cyan-500" : "bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-500"}`}
                    >
                      {SERVICES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                      Key Type *
                    </label>
                    <select
                      value={keyType}
                      onChange={(e) => setKeyType(e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${isDark ? "bg-slate-900/50 border-slate-600 text-white focus:border-cyan-500" : "bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-500"}`}
                    >
                      {KEY_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {service === "Other" && (
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                      Custom Service Name *
                    </label>
                    <input
                      type="text"
                      value={customService}
                      onChange={(e) => setCustomService(e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${isDark ? "bg-slate-900/50 border-slate-600 text-white focus:border-cyan-500" : "bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-500"}`}
                      placeholder="Service name"
                    />
                  </div>
                )}

                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                    Value *
                  </label>
                  <textarea
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    rows={3}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none font-mono text-sm ${isDark ? "bg-slate-900/50 border-slate-600 text-white focus:border-cyan-500" : "bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-500"}`}
                    placeholder="Paste your key/credential here"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                      Environment
                    </label>
                    <select
                      value={environment}
                      onChange={(e) => setEnvironment(e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${isDark ? "bg-slate-900/50 border-slate-600 text-white focus:border-cyan-500" : "bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-500"}`}
                    >
                      <option value="">Select...</option>
                      {ENVIRONMENTS.map((e) => (
                        <option key={e.value} value={e.value}>{e.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                      Expires
                    </label>
                    <input
                      type="date"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${isDark ? "bg-slate-900/50 border-slate-600 text-white focus:border-cyan-500" : "bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-500"}`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                    Project
                  </label>
                  <input
                    type="text"
                    value={project}
                    onChange={(e) => setProject(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${isDark ? "bg-slate-900/50 border-slate-600 text-white focus:border-cyan-500" : "bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-500"}`}
                    placeholder="e.g., ietires-website"
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                    Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${isDark ? "bg-slate-900/50 border-slate-600 text-white focus:border-cyan-500" : "bg-gray-50 border-gray-300 text-gray-900 focus:border-blue-500"}`}
                    placeholder="Additional notes..."
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      resetForm();
                    }}
                    className={`flex-1 px-4 py-2 font-medium rounded-lg transition-colors ${isDark ? "bg-slate-700 text-white hover:bg-slate-600" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!name.trim() || !value.trim() || (service === "Other" && !customService.trim())}
                    className={`flex-1 px-4 py-2 font-medium rounded-lg transition-colors disabled:opacity-50 ${isDark ? "bg-cyan-500 text-white hover:bg-cyan-600" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                  >
                    {editingId ? "Save Changes" : "Add Credential"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function CredentialsPage() {
  return (
    <Protected>
      <CredentialsContent />
    </Protected>
  );
}
