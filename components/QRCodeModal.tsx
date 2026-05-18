"use client";

import { QRCodeSVG } from "qrcode.react";
import { useRef } from "react";

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  equipmentType: "picker" | "scanner";
  equipmentId: string;
  equipmentNumber: string;
  locationName: string;
  isDark?: boolean;
}

export default function QRCodeModal({
  isOpen,
  onClose,
  equipmentType,
  equipmentId,
  equipmentNumber,
  locationName,
  isDark = true,
}: QRCodeModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  // Build the URL for the safety check page
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.iecentral.com";
  const safetyCheckUrl = `${appUrl}/safety-check/${equipmentId}`;

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Safety Check QR - ${equipmentType === "picker" ? "Picker" : "Scanner"} #${equipmentNumber}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              padding: 20px;
              box-sizing: border-box;
            }
            .qr-label {
              text-align: center;
              border: 2px solid #000;
              padding: 20px;
              border-radius: 12px;
              background: #fff;
            }
            .qr-label h2 {
              margin: 0 0 5px 0;
              font-size: 24px;
            }
            .qr-label p {
              margin: 0 0 15px 0;
              color: #666;
              font-size: 14px;
            }
            .qr-code {
              margin: 15px auto;
            }
            .instructions {
              font-size: 12px;
              color: #333;
              margin-top: 15px;
              padding-top: 10px;
              border-top: 1px solid #ddd;
            }
            @media print {
              body {
                padding: 0;
              }
            }
          </style>
        </head>
        <body>
          <div class="qr-label">
            <h2>${equipmentType === "picker" ? "Picker" : "Scanner"} #${equipmentNumber}</h2>
            <p>${locationName}</p>
            <div class="qr-code">
              ${printContent.querySelector("svg")?.outerHTML || ""}
            </div>
            <div class="instructions">
              <strong>SCAN BEFORE OPERATING</strong><br>
              Complete safety checklist before use
            </div>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`border rounded-xl p-6 w-full max-w-sm ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-xl font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
            Safety Check QR Code
          </h2>
          <button
            onClick={onClose}
            className={`p-1 rounded-lg transition-colors ${isDark ? "hover:bg-slate-700" : "hover:bg-gray-100"}`}
          >
            <svg className={`w-5 h-5 ${isDark ? "text-slate-400" : "text-gray-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* QR Code Display */}
        <div className={`text-center p-6 rounded-xl ${isDark ? "bg-white" : "bg-gray-50"}`} ref={printRef}>
          <h3 className="text-gray-900 font-bold text-lg mb-1">
            {equipmentType === "picker" ? "Picker" : "Scanner"} #{equipmentNumber}
          </h3>
          <p className="text-gray-500 text-sm mb-4">{locationName}</p>

          <div className="flex justify-center">
            <QRCodeSVG
              value={safetyCheckUrl}
              size={200}
              level="M"
              includeMargin={true}
            />
          </div>

          <p className="text-gray-600 text-xs mt-4 font-medium">
            SCAN BEFORE OPERATING
          </p>
        </div>

        {/* URL Display */}
        <div className="mt-4">
          <label className={`block text-xs font-medium mb-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
            Direct Link
          </label>
          <div className={`flex items-center gap-2 p-2 rounded-lg text-xs ${isDark ? "bg-slate-700/50" : "bg-gray-100"}`}>
            <input
              type="text"
              value={safetyCheckUrl}
              readOnly
              className={`flex-1 bg-transparent border-none focus:outline-none ${isDark ? "text-slate-300" : "text-gray-700"}`}
            />
            <button
              onClick={() => navigator.clipboard.writeText(safetyCheckUrl)}
              className={`p-1.5 rounded transition-colors ${isDark ? "hover:bg-slate-600" : "hover:bg-gray-200"}`}
              title="Copy URL"
            >
              <svg className={`w-4 h-4 ${isDark ? "text-slate-400" : "text-gray-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className={`flex-1 px-4 py-3 font-medium rounded-lg transition-colors ${isDark ? "bg-slate-700 text-white hover:bg-slate-600" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className={`flex-1 px-4 py-3 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${isDark ? "bg-cyan-500 text-white hover:bg-cyan-600" : "bg-blue-600 text-white hover:bg-blue-700"}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Label
          </button>
        </div>
      </div>
    </div>
  );
}
