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
 * Case-insensitive substring match: returns the first file whose name
 * contains the lead's name. Lead's name is trimmed before matching;
 * names shorter than 3 characters are ignored to avoid bogus matches
 * (e.g. "Al" matching "Almost final draft.docx").
 */
export function findSalesCallDocByName(
  files: SalesCallDriveFile[],
  leadName: string | null,
): SalesCallDriveFile | null {
  if (!leadName) return null;
  const target = leadName.toLowerCase().trim();
  if (target.length < 3) return null;
  return files.find((f) => f.name.toLowerCase().includes(target)) ?? null;
}
