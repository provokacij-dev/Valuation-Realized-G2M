import { google } from "googleapis";
import { getGoogleOAuth2Client } from "./google-auth";

export type SalesCallDriveFile = {
  id: string;
  name: string;
  webViewLink: string;
};

/**
 * List up to 200 files in the Sales Calls Drive folder. Returns [] on any
 * error (missing env var, auth failure, network) so callers can use it as
 * a non-fatal enrichment step.
 */
export async function listSalesCallDocs(): Promise<SalesCallDriveFile[]> {
  const folderId = process.env.GOOGLE_CONDUCTEDSALES_CALLS_FOLDER_ID;
  if (!folderId) return [];

  try {
    const auth = getGoogleOAuth2Client();
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id, name, webViewLink)",
      pageSize: 200,
      orderBy: "modifiedTime desc",
    });
    return (res.data.files ?? []).map((f) => ({
      id: f.id ?? "",
      name: f.name ?? "",
      webViewLink: f.webViewLink ?? `https://docs.google.com/document/d/${f.id}/edit`,
    }));
  } catch (err) {
    console.error("Drive list (Sales calls folder) error (non-fatal):", err);
    return [];
  }
}

/**
 * Match a Drive doc to a lead by name. Two-stage strategy:
 *
 *   1. Strict substring: doc filename contains the full lead name.
 *      Catches the "Osama Mahmoud → Osama Mahmoud - trading - KSA"
 *      case and any single-name lead.
 *
 *   2. Token-based fallback: tokenize lead name on whitespace, keep
 *      words ≥ 3 chars, and require at least 2 of them to appear in
 *      the doc filename. Catches the "Praveen Raj Parameswaran →
 *      Praveen Raj - UAE - BMS" case where the doc only carries the
 *      first two name parts. Returns the file with the most token
 *      overlaps if there are multiple candidates.
 */
export function findSalesCallDocByName(
  files: SalesCallDriveFile[],
  leadName: string | null,
): SalesCallDriveFile | null {
  if (!leadName) return null;
  const target = leadName.toLowerCase().trim();
  if (target.length < 3) return null;

  // 1. Strict substring.
  const exact = files.find((f) => f.name.toLowerCase().includes(target));
  if (exact) return exact;

  // 2. Token-based.
  const words = target.split(/\s+/).filter((w) => w.length >= 3);
  if (words.length < 2) return null;

  let bestFile: SalesCallDriveFile | null = null;
  let bestCount = 0;
  for (const f of files) {
    const fileText = f.name.toLowerCase();
    const count = words.filter((w) => fileText.includes(w)).length;
    if (count >= 2 && count > bestCount) {
      bestCount = count;
      bestFile = f;
    }
  }
  return bestFile;
}
