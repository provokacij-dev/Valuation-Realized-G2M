const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BASE = "https://api.brevo.com/v3";

async function brevoRequest(path: string, method: string, body?: object) {
  if (!BREVO_API_KEY) {
    console.warn("BREVO_API_KEY not configured — skipping Brevo call");
    return null;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

export interface BrevoContactAttrs {
  FIRSTNAME?: string;
  LASTNAME?: string;
  PHONE?: string;
  [key: string]: string | undefined;
}

/**
 * Create or update a contact in Brevo, then add them to a list (email sequence).
 */
export async function enrollInSequence(
  email: string,
  listId: number,
  attrs: BrevoContactAttrs = {}
): Promise<void> {
  // Upsert contact
  await brevoRequest("/contacts", "POST", {
    email,
    attributes: attrs,
    updateEnabled: true,
  });

  // Add to list (sequence)
  await brevoRequest(`/contacts/lists/${listId}/contacts/add`, "POST", {
    emails: [email],
  });
}

/**
 * Send a transactional email via Brevo (e.g. Vaiga notification).
 */
export async function sendTransactionalEmail(opts: {
  to: string;
  subject: string;
  htmlContent: string;
  fromEmail?: string;
  fromName?: string;
}): Promise<void> {
  await brevoRequest("/smtp/email", "POST", {
    sender: {
      email: opts.fromEmail ?? "noreply@valuationrealized.com",
      name: opts.fromName ?? "Valuation Realized",
    },
    to: [{ email: opts.to }],
    subject: opts.subject,
    htmlContent: opts.htmlContent,
  });
}
