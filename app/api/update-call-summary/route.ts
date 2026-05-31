import { NextRequest, NextResponse } from "next/server";
import { appendCallToMasterSummary } from "@/lib/call-summary-updater";

/**
 * POST /api/update-call-summary
 * Body: { engagement_id: string }
 *
 * Manual trigger to append a completed engagement's summary to the master
 * call summary Drive file. Useful when the Zoom webhook ran but the summary
 * file needs to be re-synced, or for testing.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const engagementId = body?.engagement_id as string | undefined;
    if (!engagementId) {
      return NextResponse.json({ error: "engagement_id required" }, { status: 400 });
    }
    await appendCallToMasterSummary(engagementId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("update-call-summary route error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
