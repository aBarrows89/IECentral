"use client";

import { useState, useEffect, useMemo } from "react";
import Protected from "../../protected";
import Sidebar, { MobileHeader } from "@/components/Sidebar";
import { useTheme } from "../../theme-context";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface SalesRow {
  date: string;
  item_id: string;
  description: string;
  product_type: string;
  brand: string;
  mfg_item: string;
  loc: string;
  trn: string;
  qty: number;
  price: number;
  ext_sell: number;
  account: string;
  customer: string;
}

interface MonthData {
  month: string;
  rowCount: number;
  rows: SalesRow[];
}

const COLORS = ["#06b6d4", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#3b82f6", "#f97316", "#14b8a6", "#6366f1", "#84cc16", "#e11d48"];

const LOC_NAMES: Record<string, string> = {
  W07: "Uniontown (W07)",
  W08: "Latrobe (W08)",
  W09: "Chestnut Ridge (W09)",
  R10: "Everson (R10)",
  R20: "TRD/Essey (R20)",
  R25: "Command Trax (R25)",
  R35: "King Super (R35)",
  R15: "R15",
};

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function formatMonth(yyyymm: string): string {
  const y = yyyymm.slice(0, 4);
  const m = parseInt(yyyymm.slice(4, 6), 10);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[m - 1]} ${y}`;
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

export default function SalesDashboardPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [data, setData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [locFilter, setLocFilter] = useState<string>("all");
  const [trnFilter, setTrnFilter] = useState<string>("Sld");

  // Fetch available months on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/sales");
        if (res.ok) {
          const { available } = await res.json();
          setAvailableMonths(available || []);
          if (available?.length > 0) {
            setSelectedMonths([available[0]]);
          }
        }
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Fetch data when selected months change
  useEffect(() => {
    if (selectedMonths.length === 0) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/sales?months=${selectedMonths.join(",")}`);
        if (res.ok) {
          const result = await res.json();
          setData(result);
        }
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    })();
  }, [selectedMonths]);

  // Combine all rows from selected months
  const allRows = useMemo(() => {
    let rows = data.flatMap(d => d.rows);
    if (locFilter !== "all") rows = rows.filter(r => r.loc === locFilter);
    if (trnFilter !== "all") rows = rows.filter(r => r.trn === trnFilter);
    return rows;
  }, [data, locFilter, trnFilter]);

  // ─── COMPUTED METRICS ────────────────────────────────────────────────────

  const salesRows = useMemo(() => allRows.filter(r => r.trn === "Sld"), [allRows]);
  const totalRevenue = useMemo(() => salesRows.reduce((sum, r) => sum + Math.abs(r.ext_sell), 0), [salesRows]);
  const totalUnits = useMemo(() => salesRows.reduce((sum, r) => sum + Math.abs(r.qty), 0), [salesRows]);
  const avgPrice = totalUnits > 0 ? totalRevenue / totalUnits : 0;
  const uniqueCustomers = useMemo(() => new Set(salesRows.map(r => r.account).filter(Boolean)).size, [salesRows]);

  // By location
  const byLocation = useMemo(() => {
    const map: Record<string, { units: number; revenue: number }> = {};
    for (const r of salesRows) {
      const loc = r.loc || "Other";
      if (!map[loc]) map[loc] = { units: 0, revenue: 0 };
      map[loc].units += Math.abs(r.qty);
      map[loc].revenue += Math.abs(r.ext_sell);
    }
    return Object.entries(map)
      .map(([loc, d]) => ({ name: LOC_NAMES[loc] || loc, ...d }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [salesRows]);

  // By brand (top 15)
  const byBrand = useMemo(() => {
    const map: Record<string, { units: number; revenue: number }> = {};
    for (const r of salesRows) {
      const brand = r.brand || "Other";
      if (!map[brand]) map[brand] = { units: 0, revenue: 0 };
      map[brand].units += Math.abs(r.qty);
      map[brand].revenue += Math.abs(r.ext_sell);
    }
    return Object.entries(map)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);
  }, [salesRows]);

  // Daily trend
  const dailyTrend = useMemo(() => {
    const map: Record<string, { units: number; revenue: number }> = {};
    for (const r of salesRows) {
      if (!map[r.date]) map[r.date] = { units: 0, revenue: 0 };
      map[r.date].units += Math.abs(r.qty);
      map[r.date].revenue += Math.abs(r.ext_sell);
    }
    return Object.entries(map)
      .map(([date, d]) => ({ date: date.slice(5), ...d }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [salesRows]);

  // Transaction type breakdown
  const byTrnType = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of allRows) {
      const trn = r.trn || "Other";
      map[trn] = (map[trn] || 0) + 1;
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [allRows]);

  // Top customers
  const topCustomers = useMemo(() => {
    const map: Record<string, { name: string; units: number; revenue: number; transactions: number }> = {};
    for (const r of salesRows) {
      const acct = r.account || "Walk-in";
      if (!map[acct]) map[acct] = { name: r.customer || acct, units: 0, revenue: 0, transactions: 0 };
      map[acct].units += Math.abs(r.qty);
      map[acct].revenue += Math.abs(r.ext_sell);
      map[acct].transactions += 1;
    }
    return Object.values(map)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20);
  }, [salesRows]);

  // Unique locations for filter
  const uniqueLocs = useMemo(() => {
    const locs = new Set(data.flatMap(d => d.rows.map(r => r.loc)));
    return Array.from(locs).sort();
  }, [data]);

  const cardClass = `rounded-xl border p-5 ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200"}`;
  const labelClass = `text-xs font-medium ${isDark ? "text-slate-400" : "text-gray-500"}`;
  const valueClass = `text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`;

  return (
    <Protected>
      <div className="flex h-screen theme-bg-primary">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <MobileHeader />
          <header className={`sticky top-0 z-10 border-b px-6 py-4 ${isDark ? "bg-slate-900/95 backdrop-blur border-slate-700" : "bg-white/95 backdrop-blur border-gray-200"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-gradient-to-br from-emerald-500/20 to-cyan-600/20" : "bg-gradient-to-br from-emerald-100 to-cyan-100"}`}>
                  <svg className={`w-5 h-5 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Sales Dashboard</h1>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>OEA07V Sales Analysis</p>
                </div>
              </div>
              {/* Filters */}
              <div className="flex items-center gap-3">
                <select
                  value={selectedMonths[0] || ""}
                  onChange={(e) => setSelectedMonths([e.target.value])}
                  className={`px-3 py-1.5 rounded-lg border text-sm ${isDark ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                >
                  {availableMonths.map(m => (
                    <option key={m} value={m}>{formatMonth(m)}</option>
                  ))}
                </select>
                <select
                  value={locFilter}
                  onChange={(e) => setLocFilter(e.target.value)}
                  className={`px-3 py-1.5 rounded-lg border text-sm ${isDark ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                >
                  <option value="all">All Locations</option>
                  {uniqueLocs.map(l => (
                    <option key={l} value={l}>{LOC_NAMES[l] || l}</option>
                  ))}
                </select>
                <select
                  value={trnFilter}
                  onChange={(e) => setTrnFilter(e.target.value)}
                  className={`px-3 py-1.5 rounded-lg border text-sm ${isDark ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-gray-300 text-gray-900"}`}
                >
                  <option value="all">All Transactions</option>
                  <option value="Sld">Sales Only</option>
                  <option value="ReS">Resale</option>
                  <option value="TrO">Transfer Out</option>
                  <option value="TrI">Transfer In</option>
                </select>
              </div>
            </div>
          </header>

          <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : availableMonths.length === 0 ? (
              <div className={`text-center py-24 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                <svg className="w-16 h-16 mx-auto mb-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-lg font-medium">No sales data yet</p>
                <p className="text-sm mt-1">Upload a JMK report through the Dunlop Reporting tool to populate the dashboard.</p>
              </div>
            ) : (
              <>
                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className={cardClass}>
                    <p className={labelClass}>Total Revenue</p>
                    <p className={valueClass}>{formatCurrency(totalRevenue)}</p>
                  </div>
                  <div className={cardClass}>
                    <p className={labelClass}>Units Sold</p>
                    <p className={valueClass}>{totalUnits.toLocaleString()}</p>
                  </div>
                  <div className={cardClass}>
                    <p className={labelClass}>Avg Price / Unit</p>
                    <p className={valueClass}>{formatCurrency(avgPrice)}</p>
                  </div>
                  <div className={cardClass}>
                    <p className={labelClass}>Unique Customers</p>
                    <p className={valueClass}>{uniqueCustomers.toLocaleString()}</p>
                  </div>
                </div>

                {/* Daily Trend */}
                <div className={cardClass}>
                  <h3 className={`text-sm font-semibold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>Daily Revenue</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={dailyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e5e7eb"} />
                      <XAxis dataKey="date" stroke={isDark ? "#94a3b8" : "#6b7280"} fontSize={12} />
                      <YAxis stroke={isDark ? "#94a3b8" : "#6b7280"} fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: isDark ? "#1e293b" : "#fff", border: `1px solid ${isDark ? "#334155" : "#e5e7eb"}`, borderRadius: 8 }}
                        labelStyle={{ color: isDark ? "#e2e8f0" : "#111827" }}
                        formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                      />
                      <Line type="monotone" dataKey="revenue" stroke="#06b6d4" strokeWidth={2} dot={{ fill: "#06b6d4", r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Two columns */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Revenue by Location */}
                  <div className={cardClass}>
                    <h3 className={`text-sm font-semibold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>Revenue by Location</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={byLocation} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e5e7eb"} />
                        <XAxis type="number" stroke={isDark ? "#94a3b8" : "#6b7280"} fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="name" stroke={isDark ? "#94a3b8" : "#6b7280"} fontSize={11} width={130} />
                        <Tooltip
                          contentStyle={{ backgroundColor: isDark ? "#1e293b" : "#fff", border: `1px solid ${isDark ? "#334155" : "#e5e7eb"}`, borderRadius: 8 }}
                          formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                        />
                        <Bar dataKey="revenue" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Revenue by Brand */}
                  <div className={cardClass}>
                    <h3 className={`text-sm font-semibold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>Top Brands by Revenue</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={byBrand} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e5e7eb"} />
                        <XAxis type="number" stroke={isDark ? "#94a3b8" : "#6b7280"} fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="name" stroke={isDark ? "#94a3b8" : "#6b7280"} fontSize={11} width={60} />
                        <Tooltip
                          contentStyle={{ backgroundColor: isDark ? "#1e293b" : "#fff", border: `1px solid ${isDark ? "#334155" : "#e5e7eb"}`, borderRadius: 8 }}
                          formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                        />
                        <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                          {byBrand.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Transaction Type Pie */}
                  <div className={cardClass}>
                    <h3 className={`text-sm font-semibold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>Transaction Types</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie data={byTrnType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          {byTrnType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Units by Location */}
                  <div className={cardClass}>
                    <h3 className={`text-sm font-semibold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>Units by Location</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={byLocation}>
                        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e5e7eb"} />
                        <XAxis dataKey="name" stroke={isDark ? "#94a3b8" : "#6b7280"} fontSize={10} angle={-20} textAnchor="end" height={60} />
                        <YAxis stroke={isDark ? "#94a3b8" : "#6b7280"} fontSize={12} />
                        <Tooltip
                          contentStyle={{ backgroundColor: isDark ? "#1e293b" : "#fff", border: `1px solid ${isDark ? "#334155" : "#e5e7eb"}`, borderRadius: 8 }}
                        />
                        <Bar dataKey="units" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Top Customers Table */}
                <div className={cardClass}>
                  <h3 className={`text-sm font-semibold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>Top 20 Customers</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className={isDark ? "border-b border-slate-700" : "border-b border-gray-200"}>
                          {["#", "Customer", "Revenue", "Units", "Transactions", "Avg / Unit"].map(h => (
                            <th key={h} className={`px-3 py-2 text-left text-xs font-semibold uppercase ${isDark ? "text-slate-400" : "text-gray-500"}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {topCustomers.map((c, i) => (
                          <tr key={i} className={isDark ? "border-t border-slate-700/50" : "border-t border-gray-100"}>
                            <td className={`px-3 py-2 ${isDark ? "text-slate-500" : "text-gray-400"}`}>{i + 1}</td>
                            <td className={`px-3 py-2 font-medium ${isDark ? "text-white" : "text-gray-900"}`}>{c.name}</td>
                            <td className={`px-3 py-2 font-mono ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>{formatCurrency(c.revenue)}</td>
                            <td className={`px-3 py-2 ${isDark ? "text-slate-300" : "text-gray-700"}`}>{c.units}</td>
                            <td className={`px-3 py-2 ${isDark ? "text-slate-300" : "text-gray-700"}`}>{c.transactions}</td>
                            <td className={`px-3 py-2 font-mono ${isDark ? "text-slate-400" : "text-gray-500"}`}>{c.units > 0 ? formatCurrency(c.revenue / c.units) : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </Protected>
  );
}
