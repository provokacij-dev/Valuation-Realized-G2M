import { google } from "googleapis";
import { getGoogleOAuth2Client } from "./google-auth";
import { supabase } from "./supabase";

function fitLabel(score: number | null): string {
  if (score === null) return "Unknown";
  if (score >= 9) return "High";
  if (score >= 7) return "Medium-High";
  if (score >= 5) return "Medium";
  if (score >= 3) return "Low-Medium";
  return "Low";
}

/**
 * Append a completed engagement's summary to the master call summary .md file
 * stored in Google Drive (GOOGLE_CALL_SUMMARY_FILE_ID).
 *
 * Inserts a new row into the summary table and a new detailed section before
 * the "## Pipeline status overview" anchor. Non-fatal — all errors are logged
 * and swallowed so the caller's pipeline continues regardless.
 */
export async function appendCallToMasterSummary(engagementId: string): Promise<void> {
  const fileId = process.env.GOOGLE_CALL_SUMMARY_FILE_ID;
  if (!fileId) return;

  try {
    const auth = getGoogleOAuth2Client();
    const drive = google.drive({ version: "v3", auth });

    // 1. Download current file content via stream.
    const dlRes = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" },
    );
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      (dlRes.data as NodeJS.ReadableStream)
        .on("data", (chunk) => chunks.push(Buffer.from(chunk)))
        .on("end", resolve)
        .on("error", reject);
    });
    const existing = Buffer.concat(chunks).toString("utf-8");

    // 2. Fetch engagement from Supabase.
    const { data: eng, error: engFetchError } = await supabase
      .from("engagements")
      .select(
        "name, email, sector, geography, last_revenue, last_profit, indicative_valuation, " +
        "business_summary, pain_point, outcome_verdict, outcome_rationale, " +
        "call_strengths, call_improvements, fit_score, scheduled_at, sales_call_doc_url",
      )
      .eq("id", engagementId)
      .single();

    if (engFetchError || !eng) return;

    // 3. Determine next call number from existing table rows.
    const numMatches = [...existing.matchAll(/^\| (\d+) \|/gm)];
    const lastNum =
      numMatches.length > 0 ? parseInt(numMatches[numMatches.length - 1][1], 10) : 0;
    const callNum = lastNum + 1;

    const callDate = eng.scheduled_at
      ? new Date(eng.scheduled_at).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const contactName = eng.name ?? eng.email;
    const industry = eng.sector ?? "Unknown";
    const geo = eng.geography ?? "Unknown";
    const revenue = eng.last_revenue ?? "—";
    const icpFit = fitLabel(eng.fit_score as number | null);
    const objective = eng.pain_point
      ? (eng.pain_point as string).replace(/\|/g, ",").slice(0, 80)
      : "—";
    const docLink = eng.sales_call_doc_url
      ? `[doc](${eng.sales_call_doc_url})`
      : "—";
    const VERDICT_LABELS: Record<string, string> = {
      win: "Won",
      potential_win: "Active/proposal",
      likely_loss: "Follow up",
      loss: "Disqualified",
    };
    const statusLabel = eng.outcome_verdict
      ? (VERDICT_LABELS[eng.outcome_verdict as string] ?? (eng.outcome_verdict as string))
      : "—";

    // 4. Build new summary table row (columns match master file header).
    const newRow =
      `| ${callNum} | ${callDate} | ${contactName} | (Zoom) | ${geo} | ${industry} | ` +
      `${revenue} | ${icpFit} | ${objective} | ${statusLabel} — ${docLink} |`;

    // 5. Build new detailed section.
    const lines: string[] = [
      "---",
      "",
      `### ${callNum}. ${contactName} — (Zoom)`,
      "",
      `- **Date:** ${callDate}`,
      `- **Contact:** ${contactName}`,
      `- **Geography:** ${geo}`,
      `- **Industry/sector:** ${industry}`,
      `- **Revenue:** ${revenue}`,
    ];
    if (eng.last_profit) lines.push(`- **Profit:** ${eng.last_profit}`);
    if (eng.indicative_valuation) lines.push(`- **Indicative valuation:** ${eng.indicative_valuation}`);
    lines.push(`- **ICP fit:** ${icpFit}`);
    lines.push(`- **Objective:** ${eng.pain_point ?? "—"}`);
    lines.push(`- **Business summary:** ${eng.business_summary ?? "—"}`);
    const verdictLine = eng.outcome_rationale
      ? `${eng.outcome_verdict ?? "—"} — ${eng.outcome_rationale}`
      : (eng.outcome_verdict ?? "—");
    lines.push(`- **Outcome:** ${verdictLine}`);
    if (eng.call_strengths)
      lines.push(`- **What went well:** ${(eng.call_strengths as string).replace(/\n/g, "; ")}`);
    if (eng.call_improvements)
      lines.push(`- **What to improve:** ${(eng.call_improvements as string).replace(/\n/g, "; ")}`);
    if (eng.sales_call_doc_url)
      lines.push(`- **Call doc:** [Open](${eng.sales_call_doc_url})`);
    const detailedSection = lines.join("\n");

    // 6. Splice row into summary table and append detailed section before pipeline status.
    const PIPELINE_ANCHOR = "\n## Pipeline status overview";
    const pipelineIdx = existing.indexOf(PIPELINE_ANCHOR);

    let updated: string;
    if (pipelineIdx !== -1) {
      const before = existing.slice(0, pipelineIdx);
      const after = existing.slice(pipelineIdx);

      // Find the last summary table row in `before` and insert after it.
      const beforeLines = before.split("\n");
      let lastRowLineIdx = -1;
      for (let i = beforeLines.length - 1; i >= 0; i--) {
        if (beforeLines[i].startsWith("| ") && beforeLines[i].endsWith(" |")) {
          lastRowLineIdx = i;
          break;
        }
      }
      if (lastRowLineIdx !== -1) {
        beforeLines.splice(lastRowLineIdx + 1, 0, newRow);
      } else {
        beforeLines.push(newRow);
      }

      updated = beforeLines.join("\n") + "\n\n" + detailedSection + "\n" + after;
    } else {
      updated = existing + "\n\n" + detailedSection + "\n";
    }

    // 7. Bump the Last updated date.
    updated = updated.replace(
      /^Last updated: .+$/m,
      `Last updated: ${callDate}`,
    );

    // 8. Upload updated content.
    await drive.files.update({
      fileId,
      media: { mimeType: "text/plain", body: Buffer.from(updated, "utf-8") },
    });
  } catch (err) {
    console.error("Master call summary append error (non-fatal):", err);
  }
}
