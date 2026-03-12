"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Protected from "@/app/protected";
import Sidebar from "@/components/Sidebar";
import { useAuth } from "@/app/auth-context";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

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
}

export default function ImapSetupPage() {
  const router = useRouter();
  const { user } = useAuth();
  const createAccount = useAction(api.email.accountActions.createImapAccount);

  // Fetch active domain configurations
  const domainConfigs = useQuery(api.email.domainConfigs.listActive) as DomainConfig[] | undefined;

  // Selected preset (domain config ID or "custom")
  const [selectedPreset, setSelectedPreset] = useState<string>("custom");
  const [detectedConfig, setDetectedConfig] = useState<DomainConfig | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  // IMAP settings
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("993");
  const [imapUsername, setImapUsername] = useState("");
  const [imapPassword, setImapPassword] = useState("");
  const [imapTls, setImapTls] = useState(true);

  // SMTP settings
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpTls, setSmtpTls] = useState(true);

  // Use same credentials for SMTP
  const [useSameCredentials, setUseSameCredentials] = useState(true);

  // Auto-detect domain config when email changes
  useEffect(() => {
    if (!email.includes("@") || !domainConfigs) {
      setDetectedConfig(null);
      return;
    }

    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) {
      setDetectedConfig(null);
      return;
    }

    const matchingConfig = domainConfigs.find(c => c.domain === domain);
    if (matchingConfig && selectedPreset === "custom") {
      setDetectedConfig(matchingConfig);
    } else {
      setDetectedConfig(null);
    }
  }, [email, domainConfigs, selectedPreset]);

  // Apply detected config
  const applyDetectedConfig = () => {
    if (detectedConfig) {
      applyConfig(detectedConfig);
      setSelectedPreset(detectedConfig._id);
      setDetectedConfig(null);
    }
  };

  // Apply a domain config to form
  const applyConfig = (config: DomainConfig) => {
    setImapHost(config.imapHost);
    setImapPort(config.imapPort.toString());
    setImapTls(config.imapTls);
    setSmtpHost(config.smtpHost);
    setSmtpPort(config.smtpPort.toString());
    setSmtpTls(config.smtpTls);
    setUseSameCredentials(true);
    if (config.useEmailAsUsername) {
      setImapUsername("");
      setSmtpUsername("");
    }
  };

  // Handle preset change
  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    setDetectedConfig(null);

    if (presetId === "custom") {
      // Clear to let user enter custom values
      setImapHost("");
      setImapPort("993");
      setSmtpHost("");
      setSmtpPort("587");
      setImapTls(true);
      setSmtpTls(true);
    } else {
      // Find and apply the config
      const config = domainConfigs?.find(c => c._id === presetId);
      if (config) {
        applyConfig(config);
      }
    }
  };

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?._id) return;

    setIsLoading(true);
    setError(null);

    try {
      // Validate email
      if (!email.includes("@")) {
        throw new Error("Please enter a valid email address");
      }

      const finalSmtpUsername = useSameCredentials ? imapUsername : smtpUsername;
      const finalSmtpPassword = useSameCredentials ? imapPassword : smtpPassword;

      // Passwords will be encrypted server-side in Convex
      await createAccount({
        userId: user._id,
        emailAddress: email,
        name: name || undefined,
        imapHost,
        imapPort: parseInt(imapPort),
        imapUsername: imapUsername || email,
        imapPassword,
        imapTls,
        smtpHost,
        smtpPort: parseInt(smtpPort),
        smtpUsername: finalSmtpUsername || email,
        smtpPassword: finalSmtpPassword,
        smtpTls,
      });

      router.push("/email/accounts?connected=imap&email=" + encodeURIComponent(email));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect account");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Protected requireFlag="hasEmailAccess">
      <div className="min-h-screen theme-bg-primary flex">
        <Sidebar />
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-2xl mx-auto">
            {/* Back button */}
            <button
              onClick={() => router.push("/email/accounts")}
              className="flex items-center gap-2 theme-text-secondary hover:theme-text-primary mb-6 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Accounts
            </button>

            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-500 to-gray-700 flex items-center justify-center">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-semibold theme-text-primary">IMAP/SMTP Email Setup</h1>
                <p className="theme-text-secondary">Connect your IETires email or another IMAP provider</p>
              </div>
            </div>

            {/* Auto-detected config banner */}
            {detectedConfig && (
              <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-blue-400 font-medium">Configuration found for @{detectedConfig.domain}</p>
                    <p className="text-sm theme-text-secondary">{detectedConfig.name} - Settings will be auto-filled</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={applyDetectedConfig}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                >
                  Use This Configuration
                </button>
              </div>
            )}

            {/* Preset Selector */}
            <div className="theme-bg-secondary rounded-xl p-6 mb-6">
              <h2 className="font-medium theme-text-primary mb-4">Email Provider</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Dynamic domain configs */}
                {domainConfigs?.map((config) => (
                  <button
                    key={config._id}
                    type="button"
                    onClick={() => handlePresetChange(config._id)}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      selectedPreset === config._id
                        ? "border-blue-500 bg-blue-500/10"
                        : "theme-border hover:border-gray-500"
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
                        <span className="text-white font-bold text-xs uppercase">
                          {config.domain.split(".")[0].slice(0, 3)}
                        </span>
                      </div>
                      <div>
                        <p className={`font-medium ${selectedPreset === config._id ? "text-blue-400" : "theme-text-primary"}`}>
                          {config.name}
                        </p>
                        <p className="text-xs theme-text-tertiary">@{config.domain}</p>
                      </div>
                    </div>
                    <p className="text-sm theme-text-secondary">
                      {config.description || `Pre-configured for ${config.imapHost}`}
                    </p>
                  </button>
                ))}

                {/* Custom option */}
                <button
                  type="button"
                  onClick={() => handlePresetChange("custom")}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    selectedPreset === "custom"
                      ? "border-blue-500 bg-blue-500/10"
                      : "theme-border hover:border-gray-500"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-500 to-gray-700 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className={`font-medium ${selectedPreset === "custom" ? "text-blue-400" : "theme-text-primary"}`}>
                        Custom Provider
                      </p>
                      <p className="text-xs theme-text-tertiary">Other IMAP service</p>
                    </div>
                  </div>
                  <p className="text-sm theme-text-secondary">
                    Configure your own IMAP/SMTP settings
                  </p>
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Basic Info */}
              <div className="theme-bg-secondary rounded-xl p-6">
                <h2 className="font-medium theme-text-primary mb-4">Account Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium theme-text-secondary mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full px-4 py-2.5 rounded-lg theme-bg-primary theme-border border theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium theme-text-secondary mb-1.5">
                      Display Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full px-4 py-2.5 rounded-lg theme-bg-primary theme-border border theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>
              </div>

              {/* IMAP Settings */}
              <div className="theme-bg-secondary rounded-xl p-6">
                <h2 className="font-medium theme-text-primary mb-4">
                  {selectedPreset !== "custom" ? "Login Credentials" : "Incoming Mail (IMAP)"}
                </h2>
                {selectedPreset !== "custom" && imapHost && (
                  <p className="text-sm theme-text-secondary mb-4">
                    Server: {imapHost} (IMAP: {imapPort}, SMTP: {smtpPort})
                  </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedPreset === "custom" && (
                    <>
                      <div>
                        <label className="block text-sm font-medium theme-text-secondary mb-1.5">
                          IMAP Server
                        </label>
                        <input
                          type="text"
                          value={imapHost}
                          onChange={(e) => setImapHost(e.target.value)}
                          placeholder="imap.example.com"
                          required
                          className="w-full px-4 py-2.5 rounded-lg theme-bg-primary theme-border border theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium theme-text-secondary mb-1.5">
                          Port
                        </label>
                        <input
                          type="number"
                          value={imapPort}
                          onChange={(e) => setImapPort(e.target.value)}
                          placeholder="993"
                          required
                          className="w-full px-4 py-2.5 rounded-lg theme-bg-primary theme-border border theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium theme-text-secondary mb-1.5">
                          Username
                        </label>
                        <input
                          type="text"
                          value={imapUsername}
                          onChange={(e) => setImapUsername(e.target.value)}
                          placeholder={email || "you@example.com"}
                          className="w-full px-4 py-2.5 rounded-lg theme-bg-primary theme-border border theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                        <p className="mt-1 text-xs theme-text-tertiary">Leave blank to use email address</p>
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-sm font-medium theme-text-secondary mb-1.5">
                      Password
                    </label>
                    <input
                      type="password"
                      value={imapPassword}
                      onChange={(e) => setImapPassword(e.target.value)}
                      placeholder="Your email password"
                      required
                      className="w-full px-4 py-2.5 rounded-lg theme-bg-primary theme-border border theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  {selectedPreset === "custom" && (
                    <div className="md:col-span-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={imapTls}
                          onChange={(e) => setImapTls(e.target.checked)}
                          className="rounded border-gray-500 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm theme-text-secondary">Use SSL/TLS</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* SMTP Settings - Only show for custom preset */}
              {selectedPreset === "custom" && (
                <div className="theme-bg-secondary rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-medium theme-text-primary">Outgoing Mail (SMTP)</h2>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useSameCredentials}
                        onChange={(e) => setUseSameCredentials(e.target.checked)}
                        className="rounded border-gray-500 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm theme-text-secondary">Same credentials as IMAP</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium theme-text-secondary mb-1.5">
                        SMTP Server
                      </label>
                      <input
                        type="text"
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                        placeholder="smtp.example.com"
                        required
                        className="w-full px-4 py-2.5 rounded-lg theme-bg-primary theme-border border theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium theme-text-secondary mb-1.5">
                        Port
                      </label>
                      <input
                        type="number"
                        value={smtpPort}
                        onChange={(e) => setSmtpPort(e.target.value)}
                        placeholder="587"
                        required
                        className="w-full px-4 py-2.5 rounded-lg theme-bg-primary theme-border border theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                    {!useSameCredentials && (
                      <>
                        <div>
                          <label className="block text-sm font-medium theme-text-secondary mb-1.5">
                            Username
                          </label>
                          <input
                            type="text"
                            value={smtpUsername}
                            onChange={(e) => setSmtpUsername(e.target.value)}
                            placeholder={email || "you@example.com"}
                            className="w-full px-4 py-2.5 rounded-lg theme-bg-primary theme-border border theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium theme-text-secondary mb-1.5">
                            Password
                          </label>
                          <input
                            type="password"
                            value={smtpPassword}
                            onChange={(e) => setSmtpPassword(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-lg theme-bg-primary theme-border border theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          />
                        </div>
                      </>
                    )}
                    <div className="md:col-span-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={smtpTls}
                          onChange={(e) => setSmtpTls(e.target.checked)}
                          className="rounded border-gray-500 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm theme-text-secondary">Use SSL/TLS</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Common providers help - Only show for custom preset */}
              {selectedPreset === "custom" && (
                <div className="theme-bg-secondary rounded-xl p-6">
                  <h2 className="font-medium theme-text-primary mb-4">Common Provider Settings</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm theme-text-secondary">
                    <div className="space-y-2">
                      <p className="font-medium">Fastmail</p>
                      <p>IMAP: imap.fastmail.com:993</p>
                      <p>SMTP: smtp.fastmail.com:587</p>
                    </div>
                    <div className="space-y-2">
                      <p className="font-medium">Proton Mail (Bridge)</p>
                      <p>IMAP: 127.0.0.1:1143</p>
                      <p>SMTP: 127.0.0.1:1025</p>
                    </div>
                    <div className="space-y-2">
                      <p className="font-medium">Zoho Mail</p>
                      <p>IMAP: imap.zoho.com:993</p>
                      <p>SMTP: smtp.zoho.com:587</p>
                    </div>
                    <div className="space-y-2">
                      <p className="font-medium">AOL Mail</p>
                      <p>IMAP: imap.aol.com:993</p>
                      <p>SMTP: smtp.aol.com:587</p>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !email || !imapPassword || (selectedPreset === "custom" && (!imapHost || !smtpHost))}
                className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Connecting...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Connect Account
                  </>
                )}
              </button>
            </form>
          </div>
        </main>
      </div>
    </Protected>
  );
}
