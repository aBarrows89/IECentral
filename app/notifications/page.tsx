"use client";

import React, { useState } from "react";
import Protected from "../protected";
import Sidebar, { MobileHeader } from "@/components/Sidebar";
import { useTheme } from "../theme-context";
import { useAuth } from "../auth-context";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { Id } from "@/convex/_generated/dataModel";
import { useWebPush } from "@/lib/useWebPush";

const typeIcons: Record<string, React.ReactNode> = {
  tenure_check_in: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  write_up_follow_up: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  review_due: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  default: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
};

const typeColors: Record<string, { bg: string; text: string }> = {
  tenure_check_in: { bg: "bg-amber-500/20", text: "text-amber-400" },
  write_up_follow_up: { bg: "bg-red-500/20", text: "text-red-400" },
  review_due: { bg: "bg-green-500/20", text: "text-green-400" },
  default: { bg: "bg-cyan-500/20", text: "text-cyan-400" },
};

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function NotificationsContent() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const isDark = theme === "dark";

  const [filter, setFilter] = useState<"all" | "unread">("all");
  const { isSupported: pushSupported, isSubscribed: pushSubscribed, subscribeToPush, unsubscribeFromPush, isLoading: pushLoading } = useWebPush(user?._id);

  const notifications = useQuery(
    api.notifications.getByUser,
    user?._id ? { userId: user._id } : "skip"
  );

  const markAsRead = useMutation(api.notifications.markAsRead);
  const markAllAsRead = useMutation(api.notifications.markAllAsRead);
  const dismiss = useMutation(api.notifications.dismiss);

  const handleMarkAsRead = async (notificationId: Id<"notifications">) => {
    await markAsRead({ notificationId });
  };

  const handleMarkAllAsRead = async () => {
    if (user?._id) {
      await markAllAsRead({ userId: user._id });
    }
  };

  const handleDismiss = async (notificationId: Id<"notifications">) => {
    await dismiss({ notificationId });
  };

  const filteredNotifications = notifications?.filter((n) =>
    filter === "all" ? true : !n.isRead
  );

  const unreadCount = notifications?.filter((n) => !n.isRead).length || 0;

  return (
    <div className={`flex h-screen ${isDark ? "bg-slate-900" : "bg-[#f2f2f7]"}`}>
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <MobileHeader />

        {/* Header */}
        <header className={`sticky top-0 z-10 backdrop-blur-sm border-b px-4 sm:px-8 py-3 sm:py-4 ${isDark ? "bg-slate-900/80 border-slate-700" : "bg-white/80 border-gray-200"}`}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-xl sm:text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                Notifications
              </h1>
              <p className={`text-xs sm:text-sm mt-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up!"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
                    isDark
                      ? "text-cyan-400 hover:bg-cyan-500/20"
                      : "text-blue-600 hover:bg-blue-50"
                  }`}
                >
                  Mark all as read
                </button>
              )}
              {pushSupported && (
                <button
                  onClick={pushSubscribed ? unsubscribeFromPush : subscribeToPush}
                  disabled={pushLoading}
                  className={`p-2 rounded-lg transition-colors ${
                    pushSubscribed
                      ? isDark ? "text-cyan-400 bg-cyan-500/20" : "text-blue-600 bg-blue-50"
                      : isDark ? "text-slate-400 hover:text-white hover:bg-slate-700" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  }`}
                  title={pushSubscribed ? "Push notifications enabled" : "Enable push notifications"}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-8">
          {/* Filter Tabs */}
          <div className={`flex gap-2 mb-6 p-1 rounded-lg w-fit ${isDark ? "bg-slate-800" : "bg-gray-100"}`}>
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                filter === "all"
                  ? isDark
                    ? "bg-slate-700 text-white"
                    : "bg-white text-gray-900 shadow-sm"
                  : isDark
                    ? "text-slate-400 hover:text-white"
                    : "text-gray-600 hover:text-gray-900"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
                filter === "unread"
                  ? isDark
                    ? "bg-slate-700 text-white"
                    : "bg-white text-gray-900 shadow-sm"
                  : isDark
                    ? "text-slate-400 hover:text-white"
                    : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Unread
              {unreadCount > 0 && (
                <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                  isDark ? "bg-cyan-500/20 text-cyan-400" : "bg-blue-100 text-blue-600"
                }`}>
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Notifications List */}
          <div className={`border rounded-xl overflow-hidden ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`}>
            {!notifications ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
              </div>
            ) : filteredNotifications && filteredNotifications.length > 0 ? (
              <div className={`divide-y ${isDark ? "divide-slate-700/50" : "divide-gray-200"}`}>
                {filteredNotifications.map((notification) => {
                  const colors = typeColors[notification.type] || typeColors.default;
                  const icon = typeIcons[notification.type] || typeIcons.default;

                  return (
                    <div
                      key={notification._id}
                      className={`p-4 sm:p-5 transition-colors ${
                        !notification.isRead
                          ? isDark ? "bg-cyan-500/5" : "bg-blue-50/50"
                          : ""
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`flex-shrink-0 p-2.5 rounded-lg ${colors.bg} ${colors.text}`}>
                          {icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className={`font-medium ${isDark ? "text-white" : "text-gray-900"}`}>
                                {notification.title}
                              </h3>
                              <p className={`text-sm mt-0.5 ${isDark ? "text-slate-400" : "text-gray-600"}`}>
                                {notification.message}
                              </p>
                            </div>
                            <span className={`flex-shrink-0 text-xs ${isDark ? "text-slate-500" : "text-gray-400"}`}>
                              {formatTimeAgo(notification.createdAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-3">
                            {notification.link && (
                              <Link
                                href={notification.link}
                                onClick={() => !notification.isRead && handleMarkAsRead(notification._id)}
                                className={`text-sm font-medium ${
                                  isDark ? "text-cyan-400 hover:text-cyan-300" : "text-blue-600 hover:text-blue-700"
                                }`}
                              >
                                View Details
                              </Link>
                            )}
                            {!notification.isRead && (
                              <button
                                onClick={() => handleMarkAsRead(notification._id)}
                                className={`text-sm ${isDark ? "text-slate-400 hover:text-white" : "text-gray-500 hover:text-gray-700"}`}
                              >
                                Mark as read
                              </button>
                            )}
                            <button
                              onClick={() => handleDismiss(notification._id)}
                              className={`text-sm ${isDark ? "text-slate-500 hover:text-red-400" : "text-gray-400 hover:text-red-500"}`}
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                        {!notification.isRead && (
                          <div className="flex-shrink-0 w-2 h-2 rounded-full bg-cyan-400"></div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`text-center py-12 ${isDark ? "text-slate-500" : "text-gray-400"}`}>
                <svg
                  className={`w-16 h-16 mx-auto mb-4 ${isDark ? "text-slate-600" : "text-gray-300"}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                <p className="text-lg font-medium mb-1">
                  {filter === "unread" ? "No unread notifications" : "No notifications"}
                </p>
                <p className="text-sm">
                  {filter === "unread"
                    ? "You're all caught up!"
                    : "You'll see notifications about check-ins, reviews, and more here."}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Protected>
      <NotificationsContent />
    </Protected>
  );
}
