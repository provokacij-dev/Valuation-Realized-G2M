import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getGoogleOAuth2Client } from "@/lib/google-auth";

// Temporary diagnostic endpoint. Returns details about the Sales calls Drive
// folder listing so we can see why name-matching isn't surfacing.
// REMOVE after the underlying issue is fixed.
export async function GET() {
  const folderId = process.env.GOOGLE_CONDUCTEDSALES_CALLS_FOLDER_ID;
  const result: Record<string, unknown> = {
    envVarPresent: Boolean(folderId),
    folderId: folderId ?? null,
    folderIdLength: folderId?.length ?? 0,
  };

  if (!folderId) {
    result.note = "GOOGLE_CONDUCTEDSALES_CALLS_FOLDER_ID is not set in this environment";
    return NextResponse.json(result);
  }

  try {
    const auth = getGoogleOAuth2Client();
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id, name, webViewLink)",
      pageSize: 200,
      orderBy: "modifiedTime desc",
    });
    const files = res.data.files ?? [];
    result.success = true;
    result.fileCount = files.length;
    result.sampleFilenames = files.slice(0, 10).map((f) => f.name);
  } catch (err: unknown) {
    result.success = false;
    if (err && typeof err === "object") {
      const e = err as { message?: string; code?: number | string; status?: number; response?: { status?: number; data?: unknown } };
      result.errorMessage = e.message ?? String(err);
      result.errorCode = e.code ?? null;
      result.errorStatus = e.status ?? e.response?.status ?? null;
      result.errorResponseData = e.response?.data ?? null;
    } else {
      result.errorMessage = String(err);
    }
  }

  return NextResponse.json(result);
}
