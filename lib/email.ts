import nodemailer, { type Transporter } from "nodemailer";

const SMTP_USER = process.env.GMAIL_SMTP_USER;
const SMTP_PASSWORD = process.env.GMAIL_SMTP_PASSWORD;

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!SMTP_USER || !SMTP_PASSWORD) return null;
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    });
  }
  return cachedTransporter;
}

export async function sendInternalNotification(opts: {
  to: string;
  subject: string;
  htmlContent: string;
}): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("Gmail SMTP not configured — skipping notification email");
    return;
  }
  await transporter.sendMail({
    from: SMTP_USER,
    to: opts.to,
    subject: opts.subject,
    html: opts.htmlContent,
  });
}
