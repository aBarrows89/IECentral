import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://outstanding-dalmatian-787.convex.cloud";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.iecentral.com";

export async function POST(request: NextRequest) {
  try {
    const { uploadId, reportType, s3Key, month } = await request.json();

    if (!uploadId || !reportType || !s3Key) {
      return NextResponse.json({ error: "uploadId, reportType, s3Key required" }, { status: 400 });
    }

    const convex = new ConvexHttpClient(CONVEX_URL);
    const results: { trigger: string; status: string; message?: string; completedAt?: number }[] = [];

    // Update status to processing
    await convex.mutation(api.jmkUploads.updateProcessing, {
      uploadId: uploadId as Id<"jmkUploadHistory">,
      processingStatus: "processing",
    });

    // Process based on report type triggers
    if (reportType === "OEA07V") {
      // Run all 3 triggers in parallel
      const [salesResult, wtdResult, rebateResult] = await Promise.allSettled([
        // Trigger 1: Sales refresh
        fetch(`${APP_URL}/api/sales/refresh`, {
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET || ""}` },
        }).then(async (r) => ({ ok: r.ok, data: await r.json() })),

        // Trigger 2: WTD Commission
        fetch(`${APP_URL}/api/wtd-commission/daily-run`, {
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET || ""}` },
        }).then(async (r) => ({ ok: r.ok, data: await r.json() })),

        // Trigger 3: Dealer Rebates
        fetch(`${APP_URL}/api/dealer-rebates/auto-process`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ s3Key }),
        }).then(async (r) => ({ ok: r.ok, data: await r.json() })),
      ]);

      // Sales refresh result
      if (salesResult.status === "fulfilled") {
        const { ok, data } = salesResult.value;
        results.push({ trigger: "sales-refresh", status: ok ? "success" : "failed", message: ok ? `Processed ${data.rowCount || 0} rows` : data.error, completedAt: Date.now() });
      } else {
        results.push({ trigger: "sales-refresh", status: "failed", message: salesResult.reason?.message || "Failed", completedAt: Date.now() });
      }

      // WTD Commission result
      if (wtdResult.status === "fulfilled") {
        const { ok, data } = wtdResult.value;
        results.push({ trigger: "wtd-commission", status: ok ? "success" : "failed", message: ok ? `Generated ${data.reportsGenerated || 0} reports` : data.error, completedAt: Date.now() });
      } else {
        results.push({ trigger: "wtd-commission", status: "failed", message: wtdResult.reason?.message || "Failed", completedAt: Date.now() });
      }

      // Dealer Rebates result
      if (rebateResult.status === "fulfilled") {
        const { ok, data } = rebateResult.value;
        const summary = ok ? (data.results || []).map((r: any) => `${r.type}: ${r.rows} rows, ${r.dealers} dealers`).join("; ") : data.error;
        results.push({ trigger: "dealer-rebates", status: ok ? "success" : "failed", message: summary || "No qualifying transactions", completedAt: Date.now() });
      } else {
        results.push({ trigger: "dealer-rebates", status: "failed", message: rebateResult.reason?.message || "Failed", completedAt: Date.now() });
      }
    }

    // Update with results
    const allSuccess = results.every((r) => r.status === "success");
    await convex.mutation(api.jmkUploads.updateProcessing, {
      uploadId: uploadId as Id<"jmkUploadHistory">,
      processingStatus: allSuccess ? "complete" : "failed",
      processingResults: results,
    });

    return NextResponse.json({ status: allSuccess ? "complete" : "partial", results });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Processing error" }, { status: 500 });
  }
}
