import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const webhookUrl = process.env.MAKE_SKILL_UPDATE_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "MAKE_SKILL_UPDATE_WEBHOOK_URL not configured" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Skill update webhook error:", error);
    return NextResponse.json(
      { error: "Couldn't reach Make — check webhook URL" },
      { status: 500 }
    );
  }
}
