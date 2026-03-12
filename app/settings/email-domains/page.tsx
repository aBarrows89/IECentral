"use client";

import { useState } from "react";
import Protected from "../../protected";
import Sidebar from "@/components/Sidebar";
import { useAuth } from "../../auth-context";
import { useTheme } from "../../theme-context";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";

interface DomainConfig {
  _id: Id<"emailDomainConfigs">;
  domain: string;
  name: string;
  description?: string;
  imapHost: string;
  imapPort: number;
  imapTls: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpTls: boolean;
  useEmailAsUsername: boolean;
  sortOrder?: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_FORM = {
  domain: "",
  name: "",
  description: "",
  imapHost: "",
  imapPort: 993,
  imapTls: true,
  smtpHost: "",
  smtpPort: 587,
  smtpTls: true,
  useEmailAsUsername: true,
  sortOrder: 0,
};

function EmailDomainSettingsContent() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const configs = useQuery(
    api.email.domainConfigs.listAll,
    user?._id ? { userId: user._id } : "skip"
  ) as DomainConfig[] | undefined;

  const createConfig = useMutation(api.email.domainConfigs.create);
  const updateConfig = useMutation(api.email.domainConfigs.update);
  const removeConfig = useMutation(api.email.domainConfigs.remove);
  const toggleActive = useMutation(api.email.domainConfigs.toggleActive);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<Id<"emailDomainConfigs"> | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setError("");
    setShowModal(true);
  };

  const openEdit = (config: DomainConfig) => {
    setEditingId(config._id);
    setForm({
      domain: config.domain,
      name: config.name,
      description: config.description || "",
      imapHost: config.imapHost,
      imapPort: config.imapPort,
      imapTls: config.imapTls,
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpTls: config.smtpTls,
      useEmailAsUsername: config.useEmailAsUsername,
      sortOrder: config.sortOrder || 0,
    });
    setError("");
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?._id) return;

    setError("");
    setIsSaving(true);

    try {
      if (editingId) {
        await updateConfig({
          userId: user._id,
          configId: editingId,
          ...form,
        });
      } else {
        await createConfig({
          userId: user._id,
          ...form,
        });
      }
      setShowModal(false);
      setForm(DEFAULT_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (configId: Id<"emailDomainConfigs">) => {
    if (!user?._id) return;
    if (!confirm("Are you sure you want to delete this domain configuration?")) return;

    try {
      await removeConfig({ userId: user._id, configId });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete configuration");
    }
  };

  const handleToggleActive = async (configId: Id<"emailDomainConfigs">) => {
    if (!user?._id) return;
    try {
      await toggleActive({ userId: user._id, configId });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update configuration");
    }
  };

  return (
    <div className="h-screen theme-bg-primary flex overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Link
                  href="/settings"
                  className={`p-2 rounded-lg ${isDark ? "hover:bg-slate-700" : "hover:bg-gray-100"}`}
                >
                  <svg className="w-5 h-5 theme-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </Link>
                <h1 className="text-2xl font-bold theme-text-primary">Email Domain Configurations</h1>
              </div>
              <p className="theme-text-secondary">
                Configure default IMAP/SMTP settings for email domains. Users with matching email domains will have these settings auto-filled.
              </p>
            </div>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Domain
            </button>
          </div>

          {/* Configs List */}
          <div className={`rounded-xl border ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
            {!configs ? (
              <div className="p-8 text-center">
                <svg className="w-8 h-8 mx-auto mb-2 animate-spin theme-text-tertiary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="theme-text-secondary">Loading configurations...</p>
              </div>
            ) : configs.length === 0 ? (
              <div className="p-8 text-center">
                <svg className="w-16 h-16 mx-auto mb-4 theme-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <h3 className="text-lg font-semibold theme-text-primary mb-2">No Domain Configurations</h3>
                <p className="theme-text-secondary mb-4">
                  Add your first domain configuration to enable auto-fill for IMAP email accounts.
                </p>
                <button
                  onClick={openCreate}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  Add Domain
                </button>
              </div>
            ) : (
              <div className="divide-y theme-divide">
                {/* Table Header */}
                <div className={`grid grid-cols-12 gap-4 px-6 py-3 text-sm font-medium ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                  <div className="col-span-2">Domain</div>
                  <div className="col-span-2">Name</div>
                  <div className="col-span-3">IMAP Server</div>
                  <div className="col-span-3">SMTP Server</div>
                  <div className="col-span-1">Status</div>
                  <div className="col-span-1">Actions</div>
                </div>

                {/* Table Rows */}
                {configs.map((config) => (
                  <div
                    key={config._id}
                    className={`grid grid-cols-12 gap-4 px-6 py-4 items-center ${isDark ? "hover:bg-slate-700/50" : "hover:bg-gray-50"}`}
                  >
                    <div className="col-span-2">
                      <span className={`font-mono text-sm ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                        @{config.domain}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="theme-text-primary font-medium">{config.name}</span>
                      {config.description && (
                        <p className="text-xs theme-text-tertiary truncate">{config.description}</p>
                      )}
                    </div>
                    <div className="col-span-3">
                      <span className="text-sm theme-text-secondary">
                        {config.imapHost}:{config.imapPort}
                      </span>
                      {config.imapTls && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">TLS</span>
                      )}
                    </div>
                    <div className="col-span-3">
                      <span className="text-sm theme-text-secondary">
                        {config.smtpHost}:{config.smtpPort}
                      </span>
                      {config.smtpTls && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">TLS</span>
                      )}
                    </div>
                    <div className="col-span-1">
                      <button
                        onClick={() => handleToggleActive(config._id)}
                        className={`px-2 py-1 text-xs font-medium rounded ${
                          config.isActive
                            ? "bg-green-500/20 text-green-400"
                            : isDark ? "bg-slate-600 text-slate-400" : "bg-gray-200 text-gray-500"
                        }`}
                      >
                        {config.isActive ? "Active" : "Inactive"}
                      </button>
                    </div>
                    <div className="col-span-1 flex items-center gap-1">
                      <button
                        onClick={() => openEdit(config)}
                        className={`p-1.5 rounded ${isDark ? "hover:bg-slate-600 text-slate-400" : "hover:bg-gray-200 text-gray-500"}`}
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(config._id)}
                        className={`p-1.5 rounded text-red-500 ${isDark ? "hover:bg-red-500/20" : "hover:bg-red-50"}`}
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Common Presets Info */}
          <div className={`mt-6 p-4 rounded-lg ${isDark ? "bg-slate-800/30 border border-slate-700" : "bg-gray-50 border border-gray-200"}`}>
            <h3 className="text-sm font-medium theme-text-primary mb-2">Common IMAP/SMTP Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm theme-text-secondary">
              <div>
                <strong>Gmail:</strong><br />
                IMAP: imap.gmail.com:993 (TLS)<br />
                SMTP: smtp.gmail.com:587 (TLS)
              </div>
              <div>
                <strong>Outlook/Microsoft 365:</strong><br />
                IMAP: outlook.office365.com:993 (TLS)<br />
                SMTP: smtp.office365.com:587 (TLS)
              </div>
              <div>
                <strong>Yahoo:</strong><br />
                IMAP: imap.mail.yahoo.com:993 (TLS)<br />
                SMTP: smtp.mail.yahoo.com:587 (TLS)
              </div>
            </div>
          </div>
        </div>

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className={`w-full max-w-2xl mx-4 rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto ${isDark ? "bg-slate-800" : "bg-white"}`}>
              <div className={`px-6 py-4 border-b ${isDark ? "border-slate-700" : "border-gray-200"} flex items-center justify-between sticky top-0 ${isDark ? "bg-slate-800" : "bg-white"}`}>
                <h2 className="text-lg font-semibold theme-text-primary">
                  {editingId ? "Edit Domain Configuration" : "Add Domain Configuration"}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className={`p-2 rounded-lg ${isDark ? "hover:bg-slate-700" : "hover:bg-gray-100"}`}
                >
                  <svg className="w-5 h-5 theme-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {error && (
                  <div className="p-3 bg-red-500/10 text-red-500 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                      Domain *
                    </label>
                    <div className="flex">
                      <span className={`inline-flex items-center px-3 rounded-l-lg border border-r-0 ${isDark ? "bg-slate-700 border-slate-600 text-slate-400" : "bg-gray-100 border-gray-300 text-gray-500"}`}>
                        @
                      </span>
                      <input
                        type="text"
                        value={form.domain}
                        onChange={(e) => setForm({ ...form, domain: e.target.value })}
                        placeholder="company.com"
                        required
                        className={`flex-1 px-3 py-2 rounded-r-lg border ${
                          isDark
                            ? "bg-slate-700 border-slate-600 text-white"
                            : "bg-white border-gray-300 text-gray-900"
                        } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                      Display Name *
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Company Email"
                      required
                      className={`w-full px-3 py-2 rounded-lg border ${
                        isDark
                          ? "bg-slate-700 border-slate-600 text-white"
                          : "bg-white border-gray-300 text-gray-900"
                      } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                    Description
                  </label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Help text for users"
                    className={`w-full px-3 py-2 rounded-lg border ${
                      isDark
                        ? "bg-slate-700 border-slate-600 text-white"
                        : "bg-white border-gray-300 text-gray-900"
                    } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  />
                </div>

                {/* IMAP Settings */}
                <div>
                  <h3 className={`text-sm font-medium mb-3 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                    IMAP Settings (Incoming Mail)
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                      <label className={`block text-xs mb-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>Host</label>
                      <input
                        type="text"
                        value={form.imapHost}
                        onChange={(e) => setForm({ ...form, imapHost: e.target.value })}
                        placeholder="imap.example.com"
                        required
                        className={`w-full px-3 py-2 rounded-lg border ${
                          isDark
                            ? "bg-slate-700 border-slate-600 text-white"
                            : "bg-white border-gray-300 text-gray-900"
                        } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                      />
                    </div>
                    <div>
                      <label className={`block text-xs mb-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>Port</label>
                      <input
                        type="number"
                        value={form.imapPort}
                        onChange={(e) => setForm({ ...form, imapPort: parseInt(e.target.value) || 993 })}
                        required
                        className={`w-full px-3 py-2 rounded-lg border ${
                          isDark
                            ? "bg-slate-700 border-slate-600 text-white"
                            : "bg-white border-gray-300 text-gray-900"
                        } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      checked={form.imapTls}
                      onChange={(e) => setForm({ ...form, imapTls: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <span className={`text-sm ${isDark ? "text-slate-300" : "text-gray-700"}`}>Use TLS/SSL</span>
                  </label>
                </div>

                {/* SMTP Settings */}
                <div>
                  <h3 className={`text-sm font-medium mb-3 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                    SMTP Settings (Outgoing Mail)
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                      <label className={`block text-xs mb-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>Host</label>
                      <input
                        type="text"
                        value={form.smtpHost}
                        onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
                        placeholder="smtp.example.com"
                        required
                        className={`w-full px-3 py-2 rounded-lg border ${
                          isDark
                            ? "bg-slate-700 border-slate-600 text-white"
                            : "bg-white border-gray-300 text-gray-900"
                        } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                      />
                    </div>
                    <div>
                      <label className={`block text-xs mb-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>Port</label>
                      <input
                        type="number"
                        value={form.smtpPort}
                        onChange={(e) => setForm({ ...form, smtpPort: parseInt(e.target.value) || 587 })}
                        required
                        className={`w-full px-3 py-2 rounded-lg border ${
                          isDark
                            ? "bg-slate-700 border-slate-600 text-white"
                            : "bg-white border-gray-300 text-gray-900"
                        } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      checked={form.smtpTls}
                      onChange={(e) => setForm({ ...form, smtpTls: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <span className={`text-sm ${isDark ? "text-slate-300" : "text-gray-700"}`}>Use TLS/SSL</span>
                  </label>
                </div>

                {/* Additional Options */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.useEmailAsUsername}
                        onChange={(e) => setForm({ ...form, useEmailAsUsername: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      <span className={`text-sm ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                        Use email as username
                      </span>
                    </label>
                    <p className={`text-xs mt-1 ${isDark ? "text-slate-500" : "text-gray-500"}`}>
                      If checked, user's email will be used as IMAP/SMTP username
                    </p>
                  </div>
                  <div>
                    <label className={`block text-xs mb-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                      Sort Order
                    </label>
                    <input
                      type="number"
                      value={form.sortOrder}
                      onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })}
                      className={`w-full px-3 py-2 rounded-lg border ${
                        isDark
                          ? "bg-slate-700 border-slate-600 text-white"
                          : "bg-white border-gray-300 text-gray-900"
                      } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className={`flex justify-end gap-3 pt-4 border-t ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${
                      isDark ? "bg-slate-700 hover:bg-slate-600 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                  >
                    {isSaving && (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    {isSaving ? "Saving..." : editingId ? "Update" : "Create"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function EmailDomainSettingsPage() {
  return (
    <Protected requiredRoles={["super_admin"]}>
      <EmailDomainSettingsContent />
    </Protected>
  );
}
