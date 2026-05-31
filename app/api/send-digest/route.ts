import { NextRequest, NextResponse } from "next/server";
import { sendInternalNotification } from "@/lib/email";

const DEFAULT_RECIPIENT = "provokacij@gmail.com";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subject, html_body, to } = body as {
      subject?: unknown;
      html_body?: unknown;
      to?: unknown;
    };

    if (typeof subject !== "string" || subject.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing or empty 'subject'" },
        { status: 400 }
      );
    }
    if (typeof html_body !== "string" || html_body.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing or empty 'html_body'" },
        { status: 400 }
      );
    }
    if (to !== undefined && (typeof to !== "string" || to.trim().length === 0)) {
      return NextResponse.json(
        { error: "'to' must be a non-empty string when provided" },
        { status: 400 }
      );
    }

    const recipient = typeof to === "string" ? to : DEFAULT_RECIPIENT;

    try {
      await sendInternalNotification({
        to: recipient,
        subject,
        htmlContent: html_body,
      });
    } catch (sendError) {
      const message =
        sendError instanceof Error ? sendError.message : String(sendError);
      console.error("send-digest send error:", sendError);
      return NextResponse.json(
        { error: `Failed to send email: ${message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("send-digest error:", error);
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
