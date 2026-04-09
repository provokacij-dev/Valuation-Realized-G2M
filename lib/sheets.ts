import { google } from "googleapis";
import { getGoogleAuth } from "./google-auth";

const SHEET_ID = process.env.GOOGLE_SHEETS_ID!;

export async function getSheetData(tab: string): Promise<string[][]> {
  if (!SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    return [];
  }

  const auth = getGoogleAuth(["https://www.googleapis.com/auth/spreadsheets.readonly"]);
  const sheets = google.sheets({ version: "v4", auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: tab,
  });

  return (response.data.values as string[][]) || [];
}
