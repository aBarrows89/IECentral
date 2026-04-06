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
      // Trigger 1: Sales data refresh
      try {
        const salesRes = await fetch(`${APP_URL}/api/sales/refresh`, {
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET || ""}` },
        });
        const salesData = await salesRes.json();
        results.push({
          trigger: "sales-refresh",
          status: salesRes.ok ? "success" : "failed",
          message: salesRes.ok ? `Processed ${salesData.rowCount || 0} rows` : salesData.error,
          completedAt: Date.now(),
        });
      } catch (err) {
        results.push({
          trigger: "sales-refresh",
          status: "failed",
          message: err instanceof Error ? err.message : "Unknown error",
          completedAt: Date.now(),
        });
      }

      // Trigger 2: WTD Commission daily run
      try {
        const wtdRes = await fetch(`${APP_URL}/api/wtd-commission/daily-run`, {
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET || ""}` },
        });
        const wtdData = await wtdRes.json();
        results.push({
          trigger: "wtd-commission",
          status: wtdRes.ok ? "success" : "failed",
          message: wtdRes.ok ? `Generated ${wtdData.reportsGenerated || 0} reports` : wtdData.error,
          completedAt: Date.now(),
        });
      } catch (err) {
        results.push({
          trigger: "wtd-commission",
          status: "failed",
          message: err instanceof Error ? err.message : "Unknown error",
          completedAt: Date.now(),
        });
      }

      // Trigger 3: Dealer Rebates (Falken/Milestar) — auto-generate from OEA07V data
      try {
        // The dealer rebates tool processes client-side, but we record that data was available
        results.push({
          trigger: "dealer-rebates",
          status: "success",
          message: "OEA07V data available for dealer rebate processing",
          completedAt: Date.now(),
        });
      } catch (err) {
        results.push({
          trigger: "dealer-rebates",
          status: "failed",
          message: err instanceof Error ? err.message : "Unknown error",
          completedAt: Date.now(),
        });
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
