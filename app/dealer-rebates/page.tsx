"use client";

import { useState, useRef, useCallback } from "react";
import Protected from "../protected";
import Sidebar from "@/components/Sidebar";
import { useTheme } from "../theme-context";

// ─── ENROLLED DEALER LISTS ────────────────────────────────────────────────────

const FALKEN_DEALERS = [
  { jmk: "125", name: "Dumbauld's Tire Service Inc.", fanaticId: 31489 },
  { jmk: "257", name: "Phil's Tire & Auto Repair", fanaticId: 18502 },
  { jmk: "482", name: "Bruce Brothers Tire", fanaticId: 17861 },
  { jmk: "499", name: "Camarote Service, LLC", fanaticId: 30534 },
  { jmk: "704", name: "Don's Auto Service", fanaticId: 29179 },
  { jmk: "763", name: "McCullough Tire", fanaticId: 30538 },
  { jmk: "1075", name: "Bubnash Service", fanaticId: 28699 },
  { jmk: "1110", name: "Parts Plus", fanaticId: 31462 },
  { jmk: "1110", name: "Parts Plus", fanaticId: 31461 },
  { jmk: "1153", name: "All About Auto", fanaticId: 30537 },
  { jmk: "1270", name: "Barnes Garage Inc", fanaticId: 19090 },
  { jmk: "1318", name: "R Tire Shop", fanaticId: 38387 },
  { jmk: "1341", name: "Auto Land Hyundai", fanaticId: 18501 },
  { jmk: "1382", name: "Himes Bros Tires", fanaticId: 20540 },
  { jmk: "1580", name: "Peaslee's Service Center LLC", fanaticId: 37972 },
  { jmk: "1713", name: "Collins Tire and Auto Sales", fanaticId: 31229 },
  { jmk: "1898", name: "JACL, Inc.", fanaticId: 30527 },
  { jmk: "1929", name: "Denny's Tire Service, LLC", fanaticId: 30560 },
  { jmk: "1946", name: "Copelli's Auto Service", fanaticId: 29149 },
  { jmk: "2235", name: "Cliff's Airway Auto LLC", fanaticId: 37581 },
  { jmk: "2260", name: "Randy Redinger & Sons Llc", fanaticId: 18789 },
  { jmk: "2578", name: "Mike's Auto Repair & Sales, Inc", fanaticId: 36347 },
  { jmk: "2759", name: "Driftwood Auto Sales", fanaticId: 31048 },
  { jmk: "2784", name: "Wheel Connection", fanaticId: 18465 },
  { jmk: "3058", name: "Birch Street Garage", fanaticId: 18374 },
  { jmk: "3214", name: "Hetrick's Service LLC", fanaticId: 38719 },
  { jmk: "3335", name: "Auto Tech Plus", fanaticId: 28692 },
  { jmk: "3389", name: "Clark Motorworks, LLC", fanaticId: 30533 },
  { jmk: "3390", name: "Interstate Tire & Auto LLC", fanaticId: 36324 },
  { jmk: "3406", name: "Dubois Auto Repair", fanaticId: 28274 },
  { jmk: "3598", name: "The Tire Man's Garage", fanaticId: 30810 },
  { jmk: "3655", name: "Hite's Garage", fanaticId: 21366 },
  { jmk: "3682", name: "Tate's Auto Repair", fanaticId: 37985 },
  { jmk: "3730", name: "Auto Specialties of Beaver County", fanaticId: 39319 },
  { jmk: "3736", name: "Tire Agent Corp", fanaticId: 20280 },
  { jmk: "3737", name: "Limitless Customs", fanaticId: 28936 },
  { jmk: "3755", name: "Offroad Concepts LLC", fanaticId: 36883 },
  { jmk: "3909", name: "G & D Tire & Auto Repair", fanaticId: 38857 },
  { jmk: "3925", name: "Train Station Auto Inc.", fanaticId: 37579 },
  { jmk: "3942", name: "K and M Treads, LLC", fanaticId: 35048 },
  { jmk: "3978", name: "Pecks Auto Repair", fanaticId: 35307 },
  { jmk: "3989", name: "Wilson Tire & Wheel", fanaticId: 35297 },
  { jmk: "4017", name: "Woodheads Truck Repair Service, LLC", fanaticId: 35051 },
  { jmk: "4060", name: "ATO Incorporated", fanaticId: 38021 },
  { jmk: "4074", name: "Jimmy's Auto Center LLC", fanaticId: 35720 },
  { jmk: "4124", name: "High Strung Motorsports Inc", fanaticId: 38754 },
  { jmk: "4137", name: "Griff's Tire Supply, LLC", fanaticId: 42182 },
  { jmk: "4163", name: "Action Auto Works LLC", fanaticId: 38003 },
  { jmk: "4258", name: "Deans Auto Repair and Towing", fanaticId: 28621 },
  { jmk: "4335", name: "Chris' Tire Service Inc.", fanaticId: 31225 },
  { jmk: "4335", name: "Chris' Tire Service Inc.", fanaticId: 31224 },
  { jmk: "4364", name: "Van's Tire of Medina Rd", fanaticId: 31341 },
  { jmk: "r20", name: "Essey Tire Center", fanaticId: 17566 },
  { jmk: "r25", name: "Command Trax, LLC", fanaticId: 18807 },
];

const MILESTAR_DEALERS = [
  { jmk: "1412", name: "Auto Tech Auto Service Center", dealerNumber: "21051" },
  { jmk: "1946", name: "Copelli's Auto Service", dealerNumber: "21718" },
  { jmk: "3390", name: "Interstate Tire & Auto LLC", dealerNumber: "21841" },
  { jmk: "3406", name: "Dubois Auto Repair", dealerNumber: "20994" },
  { jmk: "3598", name: "Joe Hice LLC", dealerNumber: "21006" },
  { jmk: "3677", name: "H & H Offroad LLC", dealerNumber: "21004" },
  { jmk: "3859", name: "Sockaci Garage", dealerNumber: "22552" },
  { jmk: "3942", name: "K & M Treads LLC", dealerNumber: "21839" },
  { jmk: "3959", name: "AJ's Wide Range Diesel + Auto Repairs Corp", dealerNumber: "21005" },
  { jmk: "3960", name: "Glessner's Auto LLC", dealerNumber: "23439" },
  { jmk: "4074", name: "Jimmy's Auto Center LLC", dealerNumber: "21717" },
  { jmk: "4137", name: "Griffs Tire Supply LLC", dealerNumber: "21547" },
  { jmk: "4286", name: "Chris and Bob's Auto Shop LLC", dealerNumber: "23018" },
  { jmk: "r20", name: "TRD Tire, LLC", dealerNumber: "21008" },
  { jmk: "r25", name: "Command Trax, LLC", dealerNumber: "21007" },
  { jmk: "1898", name: "R N R", dealerNumber: "23724" },
];

// ─── IE TIRES STATIC FIELDS ───────────────────────────────────────────────────
const IE_FALKEN = { distributorAccount: "20118", address: "400 Unity St.  STE. 100", city: "Latrobe", state: "PA", zip: "15650" };
const IE_MILESTAR = { parentDistributor: "119662", distributorCenter: "119662:0" };

// ─── ART24T COLUMN MAPPINGS ──────────────────────────────────────────────────
const ART24T_COLS = {
  accountId: "A/R ACCT ID",
  invoice: "AlphaNumeric Invoice id",
  sku: "Item id",
  date: "Trans date",
  qty: "Qty delivered",
  unitPrice: "Unit AMT$",
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const parseRow = (line: string) => {
    const fields: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { fields.push(cur); cur = ""; }
      else { cur += c; }
    }
    fields.push(cur);
    return fields;
  };
  const headers = parseRow(lines[0]);
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => obj[h] = (vals[i] ?? "").trim());
    return obj;
  });
}

function normalizeAcct(raw: string): string {
  const s = raw.trim();
  if (s.includes('-')) return s.split('-').pop()!.toLowerCase();
  const stripped = s.replace(/^\s+/, '').replace(/^0+/, '') || '0';
  return stripped;
}

function toFalkenDate(yymmdd: string): string {
  if (!yymmdd || yymmdd.length !== 6) return yymmdd;
  const yr = "20" + yymmdd.slice(0, 2);
  const mo = parseInt(yymmdd.slice(2, 4), 10);
  const dy = parseInt(yymmdd.slice(4, 6), 10);
  return `${mo}/${dy}/${yr}`;
}

function cleanSku(raw: string): string { return raw.replace(/\[+$/, ""); }

function toCSV(headers: string[], rows: Record<string, string | number>[]): string {
  const esc = (v: string | number) => { const s = String(v ?? ""); return s.includes(",") ? `"${s}"` : s; };
  return [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\r\n");
}

function downloadCSV(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getMonth()+1}${String(d.getDate()).padStart(2,"0")}${d.getFullYear()}`;
}

function validateART24T(rows: Record<string, string>[]): string | null {
  if (!rows.length) return "File is empty.";
  const required = Object.values(ART24T_COLS);
  const headers = Object.keys(rows[0]);
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) return `Missing required columns: ${missing.join(", ")}`;
  return null;
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface FalkenRow {
  Falken_Distributor_Account_Number: string;
  FANATIC_Dealer_Account_Number: number;
  Distributor_Center_Address: string;
  Distributor_Center_City: string;
  Distributor_Center_State: string;
  Distributor_Center_Postal_Code: string;
  Invoice_Number: string;
  SKU: string;
  Date: string;
  Quantity: string;
  Price_Per_Tire: string;
  _dealer: string;
}

interface MilestarRow {
  ParentDistributorNumber: string;
  DistributorCenterNumber: string;
  DealerNumber: string;
  InvoiceNumber: string;
  InvoiceDate: string;
  ProductCode: string;
  Quantity: string;
  SellPricePerTire: string;
  _dealer: string;
}

interface Results {
  falkenOut: FalkenRow[];
  milestarOut: MilestarRow[];
  falkenDealersSeen: Set<string>;
  milestarDealersSeen: Set<string>;
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

const STEPS = ["Upload ART24T", "Select Programs", "Review & Export"];

export default function DealerRebatesPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [step, setStep] = useState(0);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [programs, setPrograms] = useState({ falken: true, milestar: true });
  const [results, setResults] = useState<Results | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File | null) => {
    if (!file) return;
    setFileError("");
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseCSV(e.target?.result as string);
      const err = validateART24T(rows);
      if (err) { setFileError(err); return; }
      setRawRows(rows);
      setStep(1);
    };
    reader.readAsText(file);
  }, []);

  const processData = () => {
    const falkenMap: Record<string, typeof FALKEN_DEALERS> = {};
    FALKEN_DEALERS.forEach(d => {
      if (!falkenMap[d.jmk]) falkenMap[d.jmk] = [];
      falkenMap[d.jmk].push(d);
    });
    const milestarMap: Record<string, typeof MILESTAR_DEALERS[0]> = {};
    MILESTAR_DEALERS.forEach(d => { milestarMap[d.jmk] = d; });

    const falkenOut: FalkenRow[] = [], milestarOut: MilestarRow[] = [];
    const falkenDealersSeen = new Set<string>(), milestarDealersSeen = new Set<string>();

    rawRows.forEach(row => {
      const jmk = normalizeAcct(row[ART24T_COLS.accountId]);
      const invoice = row[ART24T_COLS.invoice];
      const sku = cleanSku(row[ART24T_COLS.sku]);
      const dateRaw = row[ART24T_COLS.date];
      const qty = row[ART24T_COLS.qty];
      const price = row[ART24T_COLS.unitPrice];

      if (programs.falken && falkenMap[jmk]) {
        falkenMap[jmk].forEach(dealer => {
          falkenOut.push({
            Falken_Distributor_Account_Number: IE_FALKEN.distributorAccount,
            FANATIC_Dealer_Account_Number: dealer.fanaticId,
            Distributor_Center_Address: IE_FALKEN.address,
            Distributor_Center_City: IE_FALKEN.city,
            Distributor_Center_State: IE_FALKEN.state,
            Distributor_Center_Postal_Code: IE_FALKEN.zip,
            Invoice_Number: invoice,
            SKU: sku,
            Date: toFalkenDate(dateRaw),
            Quantity: qty,
            Price_Per_Tire: price,
            _dealer: dealer.name,
          });
          falkenDealersSeen.add(jmk);
        });
      }

      if (programs.milestar && milestarMap[jmk]) {
        const dealer = milestarMap[jmk];
        milestarOut.push({
          ParentDistributorNumber: IE_MILESTAR.parentDistributor,
          DistributorCenterNumber: IE_MILESTAR.distributorCenter,
          DealerNumber: dealer.dealerNumber,
          InvoiceNumber: invoice,
          InvoiceDate: dateRaw,
          ProductCode: sku,
          Quantity: qty,
          SellPricePerTire: price,
          _dealer: dealer.name,
        });
        milestarDealersSeen.add(jmk);
      }
    });

    setResults({ falkenOut, milestarOut, falkenDealersSeen, milestarDealersSeen });
    setStep(2);
  };

  const exportFalken = () => {
    if (!results) return;
    const headers = ["Falken_Distributor_Account_Number","FANATIC_Dealer_Account_Number","Distributor_Center_Address","Distributor_Center_City","Distributor_Center_State","Distributor_Center_Postal_Code","Invoice_Number","SKU","Date","Quantity","Price_Per_Tire"];
    const clean = results.falkenOut.map(r => { const o = {...r} as Record<string, string | number>; delete o._dealer; return o; });
    downloadCSV(`Falken_Fanatic_${todayStamp()}.csv`, toCSV(headers, clean));
  };

  const exportMilestar = () => {
    if (!results) return;
    const headers = ["ParentDistributorNumber","DistributorCenterNumber","DealerNumber","InvoiceNumber","InvoiceDate","ProductCode","Quantity","SellPricePerTire"];
    const clean = results.milestarOut.map(r => { const o = {...r} as Record<string, string | number>; delete o._dealer; return o; });
    downloadCSV(`Milestar_Momentum_${todayStamp()}.csv`, toCSV(headers, clean));
  };

  const resetAll = () => {
    setStep(0);
    setRawRows([]);
    setResults(null);
    setFileName("");
    setFileError("");
  };

  return (
    <Protected>
      <div className={`flex h-screen ${isDark ? "bg-slate-900" : "bg-[#f2f2f7]"}`}>
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {/* Header */}
          <header className={`sticky top-0 z-10 border-b px-6 py-4 ${isDark ? "bg-slate-900/95 backdrop-blur border-slate-700" : "bg-white/95 backdrop-blur border-gray-200"}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-gradient-to-br from-amber-500/20 to-orange-600/20" : "bg-gradient-to-br from-amber-100 to-orange-100"}`}>
                <svg className={`w-5 h-5 ${isDark ? "text-amber-400" : "text-amber-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                  Dealer Rebate Tool
                </h1>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                  Associate Dealer Program - ART24T to CSV Upload Generator
                </p>
              </div>
              <div className={`ml-auto px-3 py-1 rounded-md text-xs font-mono ${isDark ? "bg-slate-800 text-slate-400 border border-slate-700" : "bg-gray-100 text-gray-500 border border-gray-200"}`}>
                ART24T &rarr; CSV
              </div>
            </div>
          </header>

          <div className="max-w-4xl mx-auto px-6 py-6">
            {/* Step Indicator */}
            <div className="flex items-center gap-2 mb-8">
              {STEPS.map((label, i) => (
                <div key={i} className="flex items-center gap-2 flex-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold flex-shrink-0 transition-all ${
                    step > i
                      ? "bg-green-500/20 text-green-400 border-2 border-green-500/40"
                      : step === i
                        ? isDark ? "bg-orange-500/20 text-orange-400 border-2 border-orange-500/40" : "bg-orange-100 text-orange-600 border-2 border-orange-300"
                        : isDark ? "bg-slate-800 text-slate-500 border-2 border-slate-700" : "bg-gray-100 text-gray-400 border-2 border-gray-200"
                  }`}>
                    {step > i ? "\u2713" : i + 1}
                  </div>
                  <span className={`text-xs font-semibold uppercase tracking-wide ${
                    step === i
                      ? isDark ? "text-white" : "text-gray-900"
                      : isDark ? "text-slate-500" : "text-gray-400"
                  }`}>
                    {label}
                  </span>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-px ${isDark ? "bg-slate-700" : "bg-gray-200"}`} />
                  )}
                </div>
              ))}
            </div>

            {/* Step 0: Upload */}
            {step === 0 && (
              <div className={`rounded-xl border p-6 ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200 shadow-sm"}`}>
                <h2 className={`text-sm font-bold uppercase tracking-wider mb-4 ${isDark ? "text-orange-400" : "text-orange-600"}`}>
                  Upload ART24T Report
                </h2>
                <div
                  className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
                    dragOver
                      ? isDark ? "border-orange-500 bg-orange-500/10" : "border-orange-400 bg-orange-50"
                      : isDark ? "border-slate-600 hover:border-slate-500 bg-slate-800/50" : "border-gray-300 hover:border-gray-400 bg-gray-50"
                  }`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                  onClick={() => fileRef.current?.click()}
                >
                  <div className="text-4xl mb-3">
                    <svg className={`w-12 h-12 mx-auto ${isDark ? "text-slate-500" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className={`font-semibold mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>
                    Drop ART24T CSV here, or click to browse
                  </p>
                  <p className={`text-sm ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                    Export the ART24T from your system as CSV before uploading
                  </p>
                </div>
                <input type="file" accept=".csv" ref={fileRef} className="hidden" onChange={e => handleFile(e.target.files?.[0] ?? null)} />
                {fileError && (
                  <div className={`mt-4 p-3 rounded-lg text-sm ${isDark ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
                    {fileError}
                  </div>
                )}
              </div>
            )}

            {/* Step 1: Select Programs */}
            {step === 1 && (
              <div>
                <div className={`rounded-xl border p-6 ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200 shadow-sm"}`}>
                  <h2 className={`text-sm font-bold uppercase tracking-wider mb-4 ${isDark ? "text-orange-400" : "text-orange-600"}`}>
                    Select Programs to Generate
                  </h2>
                  <div className={`mb-5 p-3 rounded-lg text-sm flex items-center gap-2 ${isDark ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-green-50 text-green-700 border border-green-200"}`}>
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Loaded <strong className="mx-1">{fileName}</strong> &mdash; {rawRows.length} transaction rows ready to process.
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { key: "falken" as const, label: "Falken Fanatic", color: isDark ? "text-amber-400" : "text-amber-600", borderColor: "border-amber-500", bgColor: isDark ? "bg-amber-500/10" : "bg-amber-50", count: FALKEN_DEALERS.length, fmt: "11-column CSV" },
                      { key: "milestar" as const, label: "Milestar Momentum", color: isDark ? "text-blue-400" : "text-blue-600", borderColor: "border-blue-500", bgColor: isDark ? "bg-blue-500/10" : "bg-blue-50", count: MILESTAR_DEALERS.length, fmt: "8-column CSV" },
                    ].map(p => (
                      <div
                        key={p.key}
                        className={`rounded-xl border-2 p-5 cursor-pointer transition-all ${
                          programs[p.key]
                            ? `${p.borderColor} ${p.bgColor}`
                            : isDark ? "border-slate-700 bg-slate-800/30 hover:border-slate-600" : "border-gray-200 bg-gray-50 hover:border-gray-300"
                        }`}
                        onClick={() => setPrograms({ ...programs, [p.key]: !programs[p.key] })}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className={`w-5 h-5 rounded flex items-center justify-center text-xs font-bold ${
                            programs[p.key]
                              ? "bg-orange-500 text-white"
                              : isDark ? "border-2 border-slate-600" : "border-2 border-gray-300"
                          }`}>
                            {programs[p.key] && "\u2713"}
                          </div>
                          <span className={`font-bold ${p.color}`}>{p.label}</span>
                        </div>
                        <p className={`text-xs ml-8 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                          {p.count} enrolled dealers &middot; {p.fmt}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => { setStep(0); setRawRows([]); setFileName(""); }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700" : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"}`}
                  >
                    &larr; Back
                  </button>
                  <button
                    disabled={!programs.falken && !programs.milestar}
                    onClick={processData}
                    className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors ${
                      programs.falken || programs.milestar
                        ? "bg-orange-500 hover:bg-orange-600 text-white"
                        : isDark ? "bg-slate-700 text-slate-500 cursor-not-allowed" : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    Process & Review &rarr;
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Review & Export */}
            {step === 2 && results && (
              <div>
                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className={`rounded-xl border p-4 ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200 shadow-sm"}`}>
                    <div className={`text-3xl font-mono font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{rawRows.length}</div>
                    <div className={`text-xs mt-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>ART24T Rows</div>
                  </div>
                  {programs.falken && (
                    <div className={`rounded-xl border p-4 ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200 shadow-sm"}`}>
                      <div className="text-3xl font-mono font-bold text-green-400">{results.falkenOut.length}</div>
                      <div className={`text-xs mt-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>Falken Rows &middot; {results.falkenDealersSeen.size} dealers</div>
                    </div>
                  )}
                  {programs.milestar && (
                    <div className={`rounded-xl border p-4 ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-white border-gray-200 shadow-sm"}`}>
                      <div className="text-3xl font-mono font-bold text-blue-400">{results.milestarOut.length}</div>
                      <div className={`text-xs mt-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>Milestar Rows &middot; {results.milestarDealersSeen.size} dealers</div>
                    </div>
                  )}
                </div>

                {/* Falken Export */}
                {programs.falken && (
                  <div className={`rounded-xl border overflow-hidden mb-4 ${isDark ? "border-slate-700" : "border-gray-200 shadow-sm"}`}>
                    <div className={`px-5 py-3 flex items-center justify-between border-b-2 ${isDark ? "bg-amber-500/10 border-amber-500/40" : "bg-amber-50 border-amber-300"}`}>
                      <div>
                        <div className={`font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>Falken Fanatic</div>
                        <div className={`text-xs ${isDark ? "text-amber-600" : "text-amber-500"}`}>{results.falkenOut.length} rows &middot; Distributor 20118 &middot; Latrobe PA &middot; M/D/YYYY dates</div>
                      </div>
                      {results.falkenOut.length > 0 ? (
                        <button onClick={exportFalken} className="px-4 py-1.5 rounded-lg text-sm font-bold bg-green-600 hover:bg-green-700 text-white transition-colors">
                          Download Falken CSV
                        </button>
                      ) : (
                        <span className={`text-xs ${isDark ? "text-slate-500" : "text-gray-400"}`}>No matching dealers</span>
                      )}
                    </div>
                    <div className={`p-4 ${isDark ? "bg-slate-800/50" : "bg-white"}`}>
                      {results.falkenOut.length > 0 ? (
                        <>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className={isDark ? "text-slate-400" : "text-gray-500"}>
                                  <th className="text-left py-2 px-2 font-medium">Dealer</th>
                                  <th className="text-left py-2 px-2 font-medium">Fanatic ID</th>
                                  <th className="text-left py-2 px-2 font-medium">Invoice</th>
                                  <th className="text-left py-2 px-2 font-medium">SKU</th>
                                  <th className="text-left py-2 px-2 font-medium">Date</th>
                                  <th className="text-left py-2 px-2 font-medium">Qty</th>
                                  <th className="text-left py-2 px-2 font-medium">$/Tire</th>
                                </tr>
                              </thead>
                              <tbody>
                                {results.falkenOut.slice(0, 8).map((r, i) => (
                                  <tr key={i} className={`border-t ${isDark ? "border-slate-700/50 hover:bg-slate-700/30" : "border-gray-100 hover:bg-gray-50"}`}>
                                    <td className={`py-1.5 px-2 ${isDark ? "text-white" : "text-gray-900"}`}>{r._dealer}</td>
                                    <td className={`py-1.5 px-2 font-mono ${isDark ? "text-slate-300" : "text-gray-600"}`}>{r.FANATIC_Dealer_Account_Number}</td>
                                    <td className={`py-1.5 px-2 font-mono ${isDark ? "text-slate-300" : "text-gray-600"}`}>{r.Invoice_Number}</td>
                                    <td className={`py-1.5 px-2 font-mono ${isDark ? "text-slate-300" : "text-gray-600"}`}>{r.SKU}</td>
                                    <td className={`py-1.5 px-2 font-mono ${isDark ? "text-slate-300" : "text-gray-600"}`}>{r.Date}</td>
                                    <td className={`py-1.5 px-2 font-mono ${isDark ? "text-slate-300" : "text-gray-600"}`}>{r.Quantity}</td>
                                    <td className={`py-1.5 px-2 font-mono ${isDark ? "text-slate-300" : "text-gray-600"}`}>{r.Price_Per_Tire}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {results.falkenOut.length > 8 && (
                            <p className={`text-xs mt-2 font-mono ${isDark ? "text-slate-500" : "text-gray-400"}`}>+ {results.falkenOut.length - 8} more rows in download</p>
                          )}
                        </>
                      ) : (
                        <div className={`p-3 rounded-lg text-sm ${isDark ? "bg-amber-500/10 text-amber-300 border border-amber-500/20" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                          No Falken Fanatic dealers matched in this ART24T. Verify the date range includes their transactions.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Milestar Export */}
                {programs.milestar && (
                  <div className={`rounded-xl border overflow-hidden mb-4 ${isDark ? "border-slate-700" : "border-gray-200 shadow-sm"}`}>
                    <div className={`px-5 py-3 flex items-center justify-between border-b-2 ${isDark ? "bg-blue-500/10 border-blue-500/40" : "bg-blue-50 border-blue-300"}`}>
                      <div>
                        <div className={`font-bold ${isDark ? "text-blue-400" : "text-blue-700"}`}>Milestar Momentum</div>
                        <div className={`text-xs ${isDark ? "text-blue-600" : "text-blue-500"}`}>{results.milestarOut.length} rows &middot; Parent 119662 &middot; YYMMDD dates</div>
                      </div>
                      {results.milestarOut.length > 0 ? (
                        <button onClick={exportMilestar} className="px-4 py-1.5 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                          Download Milestar CSV
                        </button>
                      ) : (
                        <span className={`text-xs ${isDark ? "text-slate-500" : "text-gray-400"}`}>No matching dealers</span>
                      )}
                    </div>
                    <div className={`p-4 ${isDark ? "bg-slate-800/50" : "bg-white"}`}>
                      {results.milestarOut.length > 0 ? (
                        <>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className={isDark ? "text-slate-400" : "text-gray-500"}>
                                  <th className="text-left py-2 px-2 font-medium">Dealer</th>
                                  <th className="text-left py-2 px-2 font-medium">Dealer #</th>
                                  <th className="text-left py-2 px-2 font-medium">Invoice</th>
                                  <th className="text-left py-2 px-2 font-medium">SKU</th>
                                  <th className="text-left py-2 px-2 font-medium">Date</th>
                                  <th className="text-left py-2 px-2 font-medium">Qty</th>
                                  <th className="text-left py-2 px-2 font-medium">$/Tire</th>
                                </tr>
                              </thead>
                              <tbody>
                                {results.milestarOut.slice(0, 8).map((r, i) => (
                                  <tr key={i} className={`border-t ${isDark ? "border-slate-700/50 hover:bg-slate-700/30" : "border-gray-100 hover:bg-gray-50"}`}>
                                    <td className={`py-1.5 px-2 ${isDark ? "text-white" : "text-gray-900"}`}>{r._dealer}</td>
                                    <td className={`py-1.5 px-2 font-mono ${isDark ? "text-slate-300" : "text-gray-600"}`}>{r.DealerNumber}</td>
                                    <td className={`py-1.5 px-2 font-mono ${isDark ? "text-slate-300" : "text-gray-600"}`}>{r.InvoiceNumber}</td>
                                    <td className={`py-1.5 px-2 font-mono ${isDark ? "text-slate-300" : "text-gray-600"}`}>{r.ProductCode}</td>
                                    <td className={`py-1.5 px-2 font-mono ${isDark ? "text-slate-300" : "text-gray-600"}`}>{r.InvoiceDate}</td>
                                    <td className={`py-1.5 px-2 font-mono ${isDark ? "text-slate-300" : "text-gray-600"}`}>{r.Quantity}</td>
                                    <td className={`py-1.5 px-2 font-mono ${isDark ? "text-slate-300" : "text-gray-600"}`}>{r.SellPricePerTire}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {results.milestarOut.length > 8 && (
                            <p className={`text-xs mt-2 font-mono ${isDark ? "text-slate-500" : "text-gray-400"}`}>+ {results.milestarOut.length - 8} more rows in download</p>
                          )}
                        </>
                      ) : (
                        <div className={`p-3 rounded-lg text-sm ${isDark ? "bg-blue-500/10 text-blue-300 border border-blue-500/20" : "bg-blue-50 text-blue-700 border border-blue-200"}`}>
                          No Milestar Momentum dealers matched in this ART24T.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3 mt-5">
                  <button
                    onClick={resetAll}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDark ? "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700" : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"}`}
                  >
                    Start New Upload
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </Protected>
  );
}
