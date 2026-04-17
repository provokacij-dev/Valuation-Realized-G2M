import { google } from "googleapis";
import { getGoogleOAuth2Client } from "./google-auth";

// Docs/Drive calls run as the real user (provokacij@gmail.com) via OAuth —
// service accounts have no Drive storage quota so they can't create files.
function getAuth() {
  return getGoogleOAuth2Client();
}

/**
 * Create a new Google Doc in GOOGLE_DOCS_FOLDER_ID with the given title and content.
 * Returns the public URL of the created doc.
 */
export async function createBriefDoc(title: string, content: string): Promise<string> {
  const folderId = process.env.GOOGLE_DOCS_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_DOCS_FOLDER_ID not configured");

  const auth = getAuth();
  const docs = google.docs({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  // 1. Create the doc directly inside the target folder in a single call.
  const file = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: "application/vnd.google-apps.document",
      parents: [folderId],
    },
    fields: "id",
  });
  const docId = file.data.id!;

  // 2. Insert content
  if (content) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: content,
            },
          },
        ],
      },
    });
  }

  return `https://docs.google.com/document/d/${docId}/edit`;
}

/**
 * Append text to an existing Google Doc identified by docId.
 */
export async function appendToDoc(docId: string, content: string): Promise<void> {
  const auth = getAuth();
  const docs = google.docs({ version: "v1", auth });

  // Get current end index
  const doc = await docs.documents.get({ documentId: docId });
  const endIndex = doc.data.body?.content?.at(-1)?.endIndex ?? 1;
  // Insert before the final newline (endIndex - 1)
  const insertIndex = Math.max(1, endIndex - 1);

  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [
        {
          insertText: {
            location: { index: insertIndex },
            text: "\n\n" + content,
          },
        },
      ],
    },
  });
}

/**
 * Extract the doc ID from a Google Docs URL.
 */
export function extractDocId(url: string): string | null {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}
