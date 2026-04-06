import { NextRequest, NextResponse } from "next/server";

// Expected headers for each report type
const EXPECTED_HEADERS: Record<string, string[]> = {
  OEA07V: ["Item Id", "Item Description", "Sidewall", "Product Type", "MFG Id", "MFG's Item Id"],
  ART24T: ["A/R ACCT ID", "AlphaNumeric Invoice id", "Trans id", "Trans date", "Loc id"],
  ART30S: ["Account", "Invoice", "Trans Date", "Loc", "Item"],
};

export async function POST(request: NextRequest) {
  try {
    const { reportType, headerRow, rowCount } = await request.json();

    if (!reportType || !headerRow) {
      return NextResponse.json({ error: "reportType and headerRow required" }, { status: 400 });
    }

    const expected = EXPECTED_HEADERS[reportType];
    if (!expected) {
      return NextResponse.json({ valid: false, errors: [`Unknown report type: ${reportType}`] });
    }

    const headers = (headerRow as string[]).map((h: string) => h.replace(/"/g, "").trim());
    const errors: string[] = [];

    // Check for key columns
    for (const col of expected) {
      if (!headers.some((h: string) => h.toLowerCase().includes(col.toLowerCase()))) {
        errors.push(`Missing expected column: "${col}"`);
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ valid: false, errors, detectedColumns: headers.length, rowCount });
    }

    return NextResponse.json({ valid: true, detectedColumns: headers.length, rowCount });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Validation error" }, { status: 500 });
  }
}
