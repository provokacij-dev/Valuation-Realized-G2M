import { NextResponse } from "next/server";
import { createFormattedBriefDoc } from "@/lib/google-docs";

// Temporary diagnostic endpoint to surface the actual error from
// createFormattedBriefDoc when a Calendly-triggered brief fails silently.
// REMOVE this file once the underlying Google Docs issue is identified.
export const dynamic = "force-dynamic";

export async function GET() {
  const envCheck = {
    GOOGLE_OAUTH_CLIENT_ID: !!process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_OAUTH_REFRESH_TOKEN: !!process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    GOOGLE_DOCS_FOLDER_ID: !!process.env.GOOGLE_DOCS_FOLDER_ID,
  };

  try {
    const url = await createFormattedBriefDoc(
      `DIAGNOSTIC: brief test ${new Date().toISOString()}`,
      {
        meta: {
          email: "diagnostic@valuationrealized.com",
          scheduledDisplay: new Date().toLocaleString(),
        },
        research: "Diagnostic test - please delete.",
        questions: ["Diagnostic test question"],
      },
    );
    return NextResponse.json({ ok: true, env_check: envCheck, doc_url: url });
  } catch (err) {
    const e = err as { message?: string; name?: string; stack?: string; code?: unknown; status?: unknown; errors?: unknown };
    return NextResponse.json(
      {
        ok: false,
        env_check: envCheck,
        error: {
          message: e.message ?? String(err),
          name: e.name,
          stack: e.stack?.split("\n").slice(0, 8).join("\n"),
          code: e.code,
          status: e.status,
          errors: e.errors,
        },
      },
      { status: 500 },
    );
  }
}
