import { google } from "googleapis";
import { getGoogleAuth } from "./google-auth";

const DOCS_SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive",
];

function getAuth() {
  return getGoogleAuth(DOCS_SCOPES);
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

  // 1. Create empty doc
  const created = await docs.documents.create({ requestBody: { title } });
  const docId = created.data.documentId!;

  // 2. Move to folder
  await drive.files.update({
    fileId: docId,
    addParents: folderId,
    fields: "id, parents",
  });

  // 3. Insert content
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
