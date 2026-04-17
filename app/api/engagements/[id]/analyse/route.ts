import { NextRequest, NextResponse } from "next/server";
import { runEngagementAnalysis } from "@/lib/engagement-analysis";

/**
 * Manual re-run endpoint for the post-call Zoom analysis. The primary trigger
 * is the Zoom webhook (POST /api/webhooks/zoom), which invokes the same lib
 * function asynchronously via waitUntil. This endpoint stays available for
 * re-runs or for unmatched recordings that were linked to an engagement
 * manually in Supabase.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await runEngagementAnalysis(id);

  if (!result.success) {
    // Translate known error strings to HTTP status codes for the UI.
    const status = result.error === "Engagement not found" ? 404
      : result.error === "No transcript URL on this engagement" ? 400
      : 502;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(result);
}
