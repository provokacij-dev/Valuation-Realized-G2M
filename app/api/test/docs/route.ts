import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getGoogleAuth } from "@/lib/google-auth";

// Temporary diagnostic endpoint for debugging Google Doc creation.
// GET /api/test/docs → runs 3 probes in order and returns the result of each.
// Remove this file once the Docs pipeline is fixed.
export async function GET() {
  const folderId = process.env.GOOGLE_DOCS_FOLDER_ID ?? "";
  const envCheck = {
    GOOGLE_DOCS_FOLDER_ID: folderId || "MISSING",
    GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "MISSING",
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_LEN: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.length ?? 0,
  };

  const auth = getGoogleAuth([
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive",
  ]);
  const docs = google.docs({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  const results: Record<string, unknown> = { envCheck };

  // Probe 1: inspect the target folder (also tells us if it's a Shared Drive)
  try {
    const meta = await drive.files.get({
      fileId: folderId,
      fields: "id, name, mimeType, driveId, parents, capabilities",
      supportsAllDrives: true,
    });
    results.probe1_folder = { ok: true, data: meta.data };
  } catch (err) {
    results.probe1_folder = { ok: false, error: describe(err) };
  }

  // Probe 2: try creating a doc directly in the folder via Drive API (handles Shared Drives)
  try {
    const file = await drive.files.create({
      requestBody: {
        name: `DIAG drive.files.create ${new Date().toISOString()}`,
        mimeType: "application/vnd.google-apps.document",
        parents: [folderId],
      },
      fields: "id, webViewLink, parents, driveId",
      supportsAllDrives: true,
    });
    results.probe2_drive_create = { ok: true, data: file.data };
  } catch (err) {
    results.probe2_drive_create = { ok: false, error: describe(err) };
  }

  // Probe 3: the original path — docs.documents.create (creates in SA "My Drive")
  try {
    const created = await docs.documents.create({
      requestBody: { title: `DIAG docs.documents.create ${new Date().toISOString()}` },
    });
    results.probe3_docs_create = { ok: true, documentId: created.data.documentId };
  } catch (err) {
    results.probe3_docs_create = { ok: false, error: describe(err) };
  }

  return NextResponse.json(results);
}

function describe(err: unknown) {
  const e = err as Error & { code?: number; errors?: unknown };
  return {
    name: e.name,
    message: e.message,
    code: e.code,
    errors: e.errors,
  };
}
