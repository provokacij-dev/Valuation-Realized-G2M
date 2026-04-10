import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const webhookUrl = process.env.MAKE_REFRESH_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "MAKE_REFRESH_WEBHOOK_URL not configured" },
      { status: 500 }
    );
  }

  let date_from: string | undefined;
  let date_to: string | undefined;
  try {
    const body = await request.json();
    date_from = body.date_from;
    date_to = body.date_to;
  } catch {
    // no body — use Make's default date range
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trigger: "refresh",
        timestamp: new Date().toISOString(),
        ...(date_from && { date_from }),
        ...(date_to && { date_to }),
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Refresh webhook error:", error);
    return NextResponse.json(
      { error: "Couldn't reach Make — check webhook URL" },
      { status: 500 }
    );
  }
}
