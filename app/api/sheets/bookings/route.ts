import { NextResponse } from "next/server";
import { getSheetData } from "@/lib/sheets";
import type { Booking } from "@/types";

export async function GET() {
  try {
    const rows = await getSheetData("Bookings");
    if (rows.length < 2) return NextResponse.json([]);

    const [, ...dataRows] = rows;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const bookings: Booking[] = dataRows
      .filter((row) => {
        if (!row[0]) return false;
        const date = new Date(row[0]);
        return date >= thirtyDaysAgo;
      })
      .map((row) => ({
        timestamp: row[0] || "",
        name: row[1] || "",
        email: row[2] || "",
        utm_source: row[3] || "",
        utm_campaign: row[4] || "",
        utm_content: row[5] || "",
        utm_medium: row[6] || "",
      }));

    return NextResponse.json(bookings);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    return NextResponse.json(
      { error: "Couldn't connect to Sheets — check your API credentials" },
      { status: 500 }
    );
  }
}
