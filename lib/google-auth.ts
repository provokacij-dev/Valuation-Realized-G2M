import { google } from "googleapis";

// Service account auth. Works for APIs that don't create Drive-owned files
// (e.g. reading a spreadsheet shared with the service account).
// Does NOT work for creating Google Docs/Drive files because service accounts
// have zero Drive storage quota — use getGoogleOAuth2Client() for that.
export function getGoogleAuth(scopes: string[]) {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes,
  });
}

// OAuth2 client authenticated as the real user (provokacij@gmail.com) via
// a long-lived refresh token. Use this for any call that creates or modifies
// Drive files so the file is owned by the user and consumes the user's quota.
export function getGoogleOAuth2Client() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Google OAuth env vars missing (need GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN)",
    );
  }
  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}
