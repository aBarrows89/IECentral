"use client";

import { useState } from "react";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { useTheme } from "@/app/theme-context";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

type Email = Doc<"emails">;
type EmailFolder = Doc<"emailFolders">;

interface EmailListProps {
  emails: Email[];
  selectedEmailId: Id<"emails"> | null;
  onEmailSelect: (emailId: Id<"emails">) => void;
  isLoading: boolean;
  folder?: EmailFolder;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } else if (isYesterday) {
    return 'Yesterday';
  } else if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function getInitials(name: string | undefined, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }
  return email[0].toUpperCase();
}

export default function EmailList({
  emails,
  selectedEmailId,
  onEmailSelect,
  isLoading,
  folder,
  hasMore,
  onLoadMore,
  isLoadingMore,
}: EmailListProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [searchQuery, setSearchQuery] = useState("");

  const toggleStar = useMutation(api.email.emails.toggleStar);

  const handleToggleStar = async (e: React.MouseEvent, emailId: Id<"emails">) => {
    e.stopPropagation();
    await toggleStar({ emailId });
  };

  const filteredEmails = emails.filter((email) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      email.subject.toLowerCase().includes(query) ||
      email.from.address.toLowerCase().includes(query) ||
      email.from.name?.toLowerCase().includes(query) ||
      email.snippet.toLowerCase().includes(query)
    );
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b theme-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold theme-text-primary capitalize">
            {folder?.name || "Inbox"}
          </h2>
          <span className="text-sm theme-text-tertiary">
            {emails.length} emails
          </span>
        </div>
        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 theme-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search emails..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 rounded-lg text-sm ${
              isDark
                ? 'bg-slate-700/50 text-white placeholder-slate-400 border-slate-600'
                : 'bg-gray-100 text-gray-900 placeholder-gray-400 border-gray-200'
            } border focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
          />
        </div>
      </div>

      {/* Email List */}
      <div className="flex-1 overflow-y-auto">
        {filteredEmails.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <svg className="w-12 h-12 mb-4 theme-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="theme-text-secondary text-center">
              {searchQuery ? "No emails match your search" : "No emails in this folder"}
            </p>
          </div>
        ) : (
          <div className="divide-y theme-border">
            {filteredEmails.map((email) => (
              <div
                key={email._id}
                onClick={() => onEmailSelect(email._id)}
                className={`p-4 cursor-pointer transition-colors ${
                  selectedEmailId === email._id
                    ? isDark ? 'bg-blue-500/20' : 'bg-blue-50'
                    : isDark ? 'hover:bg-slate-700/50' : 'hover:bg-gray-50'
                } ${!email.isRead ? (isDark ? 'bg-slate-700/30' : 'bg-blue-50/50') : ''}`}
              >
                <div className="flex gap-3">
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-medium ${
                    isDark ? 'bg-slate-600 text-slate-200' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {getInitials(email.from.name, email.from.address)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm truncate ${
                        !email.isRead ? 'font-semibold theme-text-primary' : 'theme-text-secondary'
                      }`}>
                        {email.from.name || email.from.address}
                      </span>
                      <span className="text-xs theme-text-tertiary flex-shrink-0 ml-2">
                        {formatDate(email.date)}
                      </span>
                    </div>
                    <div className={`text-sm truncate mb-1 ${
                      !email.isRead ? 'font-medium theme-text-primary' : 'theme-text-secondary'
                    }`}>
                      {email.subject || "(No Subject)"}
                    </div>
                    <div className="text-xs theme-text-tertiary truncate">
                      {email.snippet}
                    </div>

                    {/* Indicators */}
                    <div className="flex items-center gap-2 mt-2">
                      {/* Star */}
                      <button
                        onClick={(e) => handleToggleStar(e, email._id)}
                        className={`p-1 rounded transition-colors ${
                          email.isStarred
                            ? 'text-yellow-500 hover:text-yellow-600'
                            : isDark ? 'text-slate-500 hover:text-yellow-500' : 'text-gray-400 hover:text-yellow-500'
                        }`}
                      >
                        <svg className="w-4 h-4" fill={email.isStarred ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                      </button>

                      {/* Attachment indicator */}
                      {email.hasAttachments && (
                        <svg className="w-4 h-4 theme-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                      )}

                      {/* Unread indicator */}
                      {!email.isRead && (
                        <span className="w-2 h-2 bg-blue-500 rounded-full" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Load More Button */}
            {hasMore && onLoadMore && (
              <div className="p-4 flex justify-center">
                <button
                  onClick={onLoadMore}
                  disabled={isLoadingMore}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isDark
                      ? 'bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:bg-slate-800 disabled:text-slate-500'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:bg-gray-50 disabled:text-gray-400'
                  }`}
                >
                  {isLoadingMore ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading...
                    </span>
                  ) : (
                    'Load More Emails'
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
