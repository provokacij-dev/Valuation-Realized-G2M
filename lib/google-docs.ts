import { google, docs_v1 } from "googleapis";
import { getGoogleOAuth2Client } from "./google-auth";

// Docs/Drive calls run as the real user (provokacij@gmail.com) via OAuth —
// service accounts have no Drive storage quota so they can't create files.
function getAuth() {
  return getGoogleOAuth2Client();
}

/** Structured brief content used by createFormattedBriefDoc. */
export type BriefContent = {
  meta: {
    email: string;
    phone?: string | null;
    scheduledDisplay: string;
  };
  bookingAnswers?: Array<{ question: string; answer: string }>;
  research?: string | null;
  scoring?: {
    fitScore: number | null;
    fitReasoning?: string | null;
    likelyObjection?: string | null;
    meetingAngle?: string | null;
  };
  questions?: string[];
  levers?: { upside?: string[]; downside?: string[] } | null;
};

/**
 * Create a new Google Doc in GOOGLE_DOCS_FOLDER_ID with the given title and plain-text content.
 * Returns the public URL of the created doc.
 * Kept for backward compatibility (e.g. appendToDoc callers); new callers should prefer
 * createFormattedBriefDoc which produces a properly formatted brief with headings and a table.
 */
export async function createBriefDoc(title: string, content: string): Promise<string> {
  const folderId = process.env.GOOGLE_DOCS_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_DOCS_FOLDER_ID not configured");

  const auth = getAuth();
  const docs = google.docs({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  const file = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: "application/vnd.google-apps.document",
      parents: [folderId],
    },
    fields: "id",
  });
  const docId = file.data.id!;

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
 * Create a Google Doc with proper formatting: HEADING_1 title, HEADING_2 section
 * headers, numbered list for questions, and a 2-column table for valuation levers
 * with a bold header row.
 */
export async function createFormattedBriefDoc(
  title: string,
  brief: BriefContent,
): Promise<string> {
  const folderId = process.env.GOOGLE_DOCS_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_DOCS_FOLDER_ID not configured");

  const auth = getAuth();
  const docs = google.docs({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });

  // 1. Create doc inside the target folder.
  const file = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: "application/vnd.google-apps.document",
      parents: [folderId],
    },
    fields: "id",
  });
  const docId = file.data.id!;

  // 2. Build concatenated text + record formatting ranges. Docs API uses 1-based
  //    indices where index 1 is the first body position. A paragraph ending in "\n"
  //    spans [start, start + len(paragraph + "\n")).
  type Styling = { startIndex: number; endIndex: number; namedStyleType: string };
  const paragraphStyles: Styling[] = [];
  let text = "";

  const appendPara = (content: string, namedStyleType?: string) => {
    const startIndex = text.length + 1;
    const chunk = content + "\n";
    text += chunk;
    const endIndex = text.length + 1;
    if (namedStyleType) {
      paragraphStyles.push({ startIndex, endIndex, namedStyleType });
    }
    return { startIndex, endIndex };
  };

  // Title (H1)
  appendPara(title, "HEADING_1");

  // Meta line
  const metaParts = [
    `Email: ${brief.meta.email}`,
    brief.meta.phone ? `Phone: ${brief.meta.phone}` : null,
    `Scheduled: ${brief.meta.scheduledDisplay}`,
  ].filter(Boolean) as string[];
  appendPara(metaParts.join(" · "));
  appendPara("");

  // Booking form answers (H2 + plain paragraphs)
  if (brief.bookingAnswers && brief.bookingAnswers.length > 0) {
    appendPara("Booking form answers", "HEADING_2");
    for (const qa of brief.bookingAnswers) {
      appendPara(`${qa.question}: ${qa.answer}`);
    }
    appendPara("");
  }

  // Research (H2 + body paragraphs)
  if (brief.research) {
    appendPara("Research", "HEADING_2");
    const paragraphs = brief.research.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    for (const p of paragraphs) {
      appendPara(p);
    }
    appendPara("");
  }

  // Lead scoring (H2 + key-value lines)
  if (brief.scoring) {
    appendPara("Lead scoring", "HEADING_2");
    appendPara(`Fit score: ${brief.scoring.fitScore ?? "N/A"}/10`);
    if (brief.scoring.fitReasoning) appendPara(`Reasoning: ${brief.scoring.fitReasoning}`);
    if (brief.scoring.likelyObjection) appendPara(`Likely objection: ${brief.scoring.likelyObjection}`);
    if (brief.scoring.meetingAngle) appendPara(`Meeting angle: ${brief.scoring.meetingAngle}`);
    appendPara("");
  }

  // Sector-specific questions (H2 + numbered list)
  let questionsRange: { startIndex: number; endIndex: number } | null = null;
  if (brief.questions && brief.questions.length > 0) {
    appendPara("Sector-specific questions", "HEADING_2");
    const listStart = text.length + 1;
    for (const q of brief.questions) {
      appendPara(q);
    }
    const listEnd = text.length + 1;
    questionsRange = { startIndex: listStart, endIndex: listEnd };
    appendPara("");
  }

  // Valuation levers: H2 header inserted now, the table itself goes in a second pass
  // because tables need explicit insertTable + cell population via index lookups.
  let tableAnchor: number | null = null;
  const up = brief.levers?.upside ?? [];
  const dn = brief.levers?.downside ?? [];
  const hasLevers = up.length > 0 || dn.length > 0;
  if (hasLevers) {
    appendPara("Valuation levers", "HEADING_2");
    tableAnchor = text.length + 1;
    appendPara(""); // blank paragraph; table will be inserted at tableAnchor, which is just before this newline
  }

  // First batchUpdate: all text + paragraph styles + numbered list
  const firstRequests: docs_v1.Schema$Request[] = [
    { insertText: { location: { index: 1 }, text } },
  ];
  for (const s of paragraphStyles) {
    firstRequests.push({
      updateParagraphStyle: {
        range: { startIndex: s.startIndex, endIndex: s.endIndex },
        paragraphStyle: { namedStyleType: s.namedStyleType },
        fields: "namedStyleType",
      },
    });
  }
  if (questionsRange) {
    firstRequests.push({
      createParagraphBullets: {
        range: questionsRange,
        bulletPreset: "NUMBERED_DECIMAL_ALPHA_ROMAN",
      },
    });
  }
  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: { requests: firstRequests },
  });

  // Second pass: insert table + populate cells + bold header row.
  if (tableAnchor !== null && hasLevers) {
    const rowCount = Math.max(up.length, dn.length);
    const rowData: Array<[string, string]> = [["Upside levers", "Downside levers"]];
    for (let i = 0; i < rowCount; i++) {
      rowData.push([up[i] ?? "", dn[i] ?? ""]);
    }

    // Insert empty table.
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [
          {
            insertTable: {
              location: { index: tableAnchor },
              rows: rowData.length,
              columns: 2,
            },
          },
        ],
      },
    });

    // Fetch doc to find cell indices, then fill cells (reverse order keeps earlier indices valid).
    const docData = await docs.documents.get({ documentId: docId });
    const tableEl = (docData.data.body?.content ?? []).filter((c) => c.table).pop();
    const tableRows = tableEl?.table?.tableRows ?? [];

    const fillRequests: docs_v1.Schema$Request[] = [];
    for (let r = rowData.length - 1; r >= 0; r--) {
      for (let c = 1; c >= 0; c--) {
        const cellStartIdx = tableRows[r]?.tableCells?.[c]?.content?.[0]?.startIndex;
        const value = rowData[r][c];
        if (cellStartIdx != null && value) {
          fillRequests.push({
            insertText: { location: { index: cellStartIdx }, text: value },
          });
        }
      }
    }
    if (fillRequests.length > 0) {
      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: { requests: fillRequests },
      });
    }

    // Bold the header row. Re-fetch for updated cell text ranges.
    const docData2 = await docs.documents.get({ documentId: docId });
    const tableEl2 = (docData2.data.body?.content ?? []).filter((c) => c.table).pop();
    const headerCells = tableEl2?.table?.tableRows?.[0]?.tableCells ?? [];
    const boldRequests: docs_v1.Schema$Request[] = [];
    for (const cell of headerCells) {
      const elem = cell.content?.[0]?.paragraph?.elements?.[0];
      if (elem?.startIndex != null && elem?.endIndex != null && elem.endIndex > elem.startIndex + 1) {
        boldRequests.push({
          updateTextStyle: {
            range: { startIndex: elem.startIndex, endIndex: elem.endIndex - 1 },
            textStyle: { bold: true },
            fields: "bold",
          },
        });
      }
    }
    if (boldRequests.length > 0) {
      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: { requests: boldRequests },
      });
    }
  }

  return `https://docs.google.com/document/d/${docId}/edit`;
}

/** Input to appendFormattedAnalysis — shape the post-call analysis to render. */
export type FormattedAnalysis = {
  overallScore: number | null;
  insights: string[];
  categories: Array<{ category: string; score: number; notes: string }>;
};

/**
 * Append a formatted "Post-call analysis" section to an existing Google Doc:
 * HEADING_2 section title, overall score paragraph, HEADING_3 insights with
 * numbered list, and HEADING_3 category scores with a 3-column table
 * (Category / Score / Notes) with a bold header row.
 */
export async function appendFormattedAnalysis(
  docId: string,
  analysis: FormattedAnalysis,
): Promise<void> {
  const auth = getAuth();
  const docs = google.docs({ version: "v1", auth });

  // 1. Find the insertion point: just before the final trailing newline.
  const docBefore = await docs.documents.get({ documentId: docId });
  const bodyEnd = docBefore.data.body?.content?.at(-1)?.endIndex ?? 1;
  const baseIndex = Math.max(1, bodyEnd - 1);

  // 2. Build appended text + paragraph styles, keeping indices relative to baseIndex.
  //    Prefix with "\n\n" so we start a fresh blank-line-separated section.
  type Styling = { startIndex: number; endIndex: number; namedStyleType: string };
  const paragraphStyles: Styling[] = [];
  let appended = "\n\n";

  const appendPara = (content: string, namedStyleType?: string) => {
    const startIndex = baseIndex + appended.length;
    appended += content + "\n";
    const endIndex = baseIndex + appended.length;
    if (namedStyleType) {
      paragraphStyles.push({ startIndex, endIndex, namedStyleType });
    }
    return { startIndex, endIndex };
  };

  // Section: Post-call analysis
  appendPara("Post-call analysis", "HEADING_2");
  appendPara(`Overall score: ${analysis.overallScore ?? "N/A"}/100`);

  // Top coaching insights
  let insightsRange: { startIndex: number; endIndex: number } | null = null;
  if (analysis.insights.length > 0) {
    appendPara("Top coaching insights", "HEADING_3");
    const listStart = baseIndex + appended.length;
    for (const ins of analysis.insights) {
      appendPara(ins);
    }
    const listEnd = baseIndex + appended.length;
    insightsRange = { startIndex: listStart, endIndex: listEnd };
  }

  // Category scores — table goes in second batch, anchor is the position right
  // after the HEADING_3 paragraph.
  let tableAnchor: number | null = null;
  const hasCategories = analysis.categories.length > 0;
  if (hasCategories) {
    appendPara("Category scores", "HEADING_3");
    tableAnchor = baseIndex + appended.length;
    appendPara(""); // blank paragraph — table inserted at tableAnchor
  }

  // 3. First batchUpdate: insertText + paragraph styles + bullets.
  const firstRequests: docs_v1.Schema$Request[] = [
    { insertText: { location: { index: baseIndex }, text: appended } },
  ];
  for (const s of paragraphStyles) {
    firstRequests.push({
      updateParagraphStyle: {
        range: { startIndex: s.startIndex, endIndex: s.endIndex },
        paragraphStyle: { namedStyleType: s.namedStyleType },
        fields: "namedStyleType",
      },
    });
  }
  if (insightsRange) {
    firstRequests.push({
      createParagraphBullets: {
        range: insightsRange,
        bulletPreset: "NUMBERED_DECIMAL_ALPHA_ROMAN",
      },
    });
  }
  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: { requests: firstRequests },
  });

  // 4. Second pass: insert the category table + fill + bold header.
  if (tableAnchor !== null && hasCategories) {
    const rowData: Array<[string, string, string]> = [["Category", "Score", "Notes"]];
    for (const c of analysis.categories) {
      rowData.push([c.category, `${c.score}/5`, c.notes]);
    }

    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [
          {
            insertTable: {
              location: { index: tableAnchor },
              rows: rowData.length,
              columns: 3,
            },
          },
        ],
      },
    });

    // Fetch to find cell indices, then fill in reverse order.
    const docMid = await docs.documents.get({ documentId: docId });
    // We want the last table in the document (the one we just inserted).
    const tableEl = (docMid.data.body?.content ?? []).filter((c) => c.table).pop();
    const tableRows = tableEl?.table?.tableRows ?? [];

    const fillRequests: docs_v1.Schema$Request[] = [];
    for (let r = rowData.length - 1; r >= 0; r--) {
      for (let c = 2; c >= 0; c--) {
        const cellStartIdx = tableRows[r]?.tableCells?.[c]?.content?.[0]?.startIndex;
        const value = rowData[r][c];
        if (cellStartIdx != null && value) {
          fillRequests.push({
            insertText: { location: { index: cellStartIdx }, text: value },
          });
        }
      }
    }
    if (fillRequests.length > 0) {
      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: { requests: fillRequests },
      });
    }

    // Bold the header row.
    const docFinal = await docs.documents.get({ documentId: docId });
    const tableEl2 = (docFinal.data.body?.content ?? []).filter((c) => c.table).pop();
    const headerCells = tableEl2?.table?.tableRows?.[0]?.tableCells ?? [];
    const boldRequests: docs_v1.Schema$Request[] = [];
    for (const cell of headerCells) {
      const elem = cell.content?.[0]?.paragraph?.elements?.[0];
      if (elem?.startIndex != null && elem?.endIndex != null && elem.endIndex > elem.startIndex + 1) {
        boldRequests.push({
          updateTextStyle: {
            range: { startIndex: elem.startIndex, endIndex: elem.endIndex - 1 },
            textStyle: { bold: true },
            fields: "bold",
          },
        });
      }
    }
    if (boldRequests.length > 0) {
      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: { requests: boldRequests },
      });
    }
  }
}

/**
 * Append plain text to an existing Google Doc identified by docId.
 * Kept for backward compatibility; prefer appendFormattedAnalysis for post-call
 * analysis so formatting matches the rest of the brief.
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
