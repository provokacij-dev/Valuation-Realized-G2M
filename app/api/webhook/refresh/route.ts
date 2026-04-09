import { NextResponse } from "next/server";

export async function POST() {
  const webhookUrl = process.env.MAKE_REFRESH_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "MAKE_REFRESH_WEBHOOK_URL not configured" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "refresh", timestamp: new Date().toISOString() }),
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
