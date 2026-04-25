export async function getZoomToken(): Promise<string> {
  const accountId = process.env.ZOOM_ACCOUNT_ID!;
  const clientId = process.env.ZOOM_CLIENT_ID!;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET!;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}` },
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoom token error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.access_token as string;
}

export type ZoomParticipant = {
  user_email?: string;
  name?: string;
  duration?: number;
  user_id?: string;
};

/**
 * Fetch the participant list for a past Zoom meeting.
 * UUIDs containing `/` or `+` must be DOUBLE URL-encoded for the API to work,
 * per Zoom's documented gotcha.
 *
 * Requires scope: dashboard:read:list_meeting_participants:admin
 *               or report:read:list_meeting_participants:admin
 *
 * Used by the Zoom recording.completed webhook to match the recording back to
 * an engagement by invitee email (more reliable than meeting ID, which depends
 * on Calendly's Zoom location URL format being stable).
 */
export async function getMeetingParticipants(uuid: string): Promise<ZoomParticipant[]> {
  const token = await getZoomToken();
  const encodedUuid = encodeURIComponent(encodeURIComponent(uuid));
  const url = `https://api.zoom.us/v2/past_meetings/${encodedUuid}/participants?page_size=300`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoom participants ${res.status}: ${text}`);
  }
  const data = await res.json();
  return (data.participants ?? []) as ZoomParticipant[];
}
