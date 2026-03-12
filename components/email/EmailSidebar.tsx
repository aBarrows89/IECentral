"use client";

import { useState } from "react";
import Link from "next/link";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { useTheme } from "@/app/theme-context";

type EmailFolder = Doc<"emailFolders">;

// Stripped-down account type (excludes sensitive fields)
interface EmailAccount {
  _id: Id<"emailAccounts">;
  name: string;
  emailAddress: string;
  isPrimary: boolean;
}

interface EmailSidebarProps {
  accounts: EmailAccount[];
  selectedAccountId: Id<"emailAccounts"> | null;
  onAccountSelect: (accountId: Id<"emailAccounts">) => void;
  folders: EmailFolder[];
  selectedFolderId: Id<"emailFolders"> | null;
  onFolderSelect: (folderId: Id<"emailFolders">) => void;
  onCompose: () => void;
  onSync: (fullSync?: boolean) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

// Folder icon map
const FOLDER_ICONS: Record<string, string> = {
  inbox: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  sent: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8",
  drafts: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  trash: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  spam: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  archive: "M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4",
  custom: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z",
};

export default function EmailSidebar({
  accounts,
  selectedAccountId,
  onAccountSelect,
  folders,
  selectedFolderId,
  onFolderSelect,
  onCompose,
  onSync,
  isCollapsed,
  onToggleCollapse,
}: EmailSidebarProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async (fullSync = false) => {
    setIsSyncing(true);
    try {
      await onSync(fullSync);
    } finally {
      setTimeout(() => setIsSyncing(false), 2000);
    }
  };

  const selectedAccount = accounts.find(a => a._id === selectedAccountId);

  if (isCollapsed) {
    return (
      <div className={`w-16 flex flex-col border-r theme-border ${isDark ? 'bg-slate-800/50' : 'bg-gray-50'}`}>
        {/* Expand button */}
        <button
          onClick={onToggleCollapse}
          className={`p-4 hover:bg-opacity-10 ${isDark ? 'hover:bg-white' : 'hover:bg-black'}`}
        >
          <svg className="w-6 h-6 theme-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>

        {/* Compose button */}
        <button
          onClick={onCompose}
          className="p-4 text-blue-500 hover:bg-blue-500/10"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        {/* Folder icons */}
        {folders.slice(0, 6).map((folder) => (
          <button
            key={folder._id}
            onClick={() => onFolderSelect(folder._id)}
            className={`p-4 relative ${
              selectedFolderId === folder._id
                ? isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                : 'theme-text-secondary hover:bg-opacity-10'
            } ${isDark ? 'hover:bg-white' : 'hover:bg-black'}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={FOLDER_ICONS[folder.type] || FOLDER_ICONS.custom} />
            </svg>
            {folder.unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full" />
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={`w-64 flex flex-col border-r theme-border ${isDark ? 'bg-slate-800/50' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className="p-4 border-b theme-border flex items-center justify-between">
        <h2 className="font-semibold theme-text-primary">Email</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSync()}
            disabled={isSyncing}
            className={`p-2 rounded-lg transition-colors ${
              isSyncing
                ? 'text-blue-500 animate-spin'
                : isDark ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={onToggleCollapse}
            className={`p-2 rounded-lg transition-colors ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Account Selector */}
      {accounts.length > 1 && (
        <div className="p-3 border-b theme-border">
          <select
            value={selectedAccountId || ""}
            onChange={(e) => onAccountSelect(e.target.value as Id<"emailAccounts">)}
            className={`w-full px-3 py-2 rounded-lg text-sm ${
              isDark
                ? 'bg-slate-700 text-white border-slate-600'
                : 'bg-white text-gray-900 border-gray-200'
            } border focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
          >
            {accounts.map((account) => (
              <option key={account._id} value={account._id}>
                {account.name || account.emailAddress}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Compose Button */}
      <div className="p-3">
        <button
          onClick={onCompose}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors shadow-lg shadow-blue-500/20"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Compose
        </button>
      </div>

      {/* Folders */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {folders.map((folder) => (
            <button
              key={folder._id}
              onClick={() => onFolderSelect(folder._id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                selectedFolderId === folder._id
                  ? isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                  : isDark ? 'text-slate-300 hover:bg-slate-700/50' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={FOLDER_ICONS[folder.type] || FOLDER_ICONS.custom} />
              </svg>
              <span className="flex-1 truncate capitalize">
                {folder.name}
              </span>
              {folder.unreadCount > 0 && (
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                  isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'
                }`}>
                  {folder.unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Account info / Settings link */}
      <div className="p-3 border-t theme-border space-y-1">
        <button
          onClick={() => handleSync(true)}
          disabled={isSyncing}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
            isDark ? 'text-slate-400 hover:text-white hover:bg-slate-700/50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          } ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <svg className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="text-sm">Full Resync</span>
        </button>
        <Link
          href="/email/accounts"
          className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
            isDark ? 'text-slate-400 hover:text-white hover:bg-slate-700/50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-sm">Manage Accounts</span>
        </Link>
      </div>
    </div>
  );
}
