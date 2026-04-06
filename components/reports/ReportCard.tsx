"use client";

import Link from "next/link";
import { useTheme } from "@/app/theme-context";

interface ReportCardProps {
  title: string;
  description: string;
  icon: string;
  href: string;
  external?: boolean;
}

export default function ReportCard({ title, description, icon, href, external }: ReportCardProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const content = (
    <div
      className={`group relative rounded-xl border p-5 transition-all cursor-pointer ${
        isDark
          ? "bg-slate-800/50 border-slate-700 hover:border-cyan-500/40 hover:bg-slate-800"
          : "bg-white border-gray-200 hover:border-blue-300 hover:shadow-md"
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
            isDark
              ? "bg-cyan-500/10 group-hover:bg-cyan-500/20"
              : "bg-blue-50 group-hover:bg-blue-100"
          }`}
        >
          <svg
            className={`w-5 h-5 ${isDark ? "text-cyan-400" : "text-blue-600"}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`text-sm font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
            {title}
          </h3>
          <p className={`text-xs mt-0.5 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
            {description}
          </p>
        </div>
        {external && (
          <svg
            className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isDark ? "text-slate-600" : "text-gray-300"}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        )}
      </div>
    </div>
  );

  if (external) {
    return <Link href={href}>{content}</Link>;
  }

  return <Link href={href}>{content}</Link>;
}
