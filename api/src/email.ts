import { Resend } from "resend";

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType: string;
}

const DEFAULT_EMAIL_FROM = "noreply@helscoop.fi";

let resendClient: Resend | null = null;
let resendClientKey: string | null = null;

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function cleanEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

function getAppUrl() {
  return (cleanEnv("APP_URL") || "https://helscoop.fi").replace(/\/+$/, "");
}

function getEmailFrom() {
  return cleanEnv("EMAIL_FROM") || DEFAULT_EMAIL_FROM;
}

function getResendClient() {
  const apiKey = cleanEnv("RESEND_API_KEY");
  if (!apiKey) return null;
  if (!resendClient || resendClientKey !== apiKey) {
    resendClient = new Resend(apiKey);
    resendClientKey = apiKey;
  }
  return resendClient;
}

function maskEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return "[redacted-email]";
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

function sensitiveFallback(messageType: string, email: string) {
  const destination = maskEmail(email);
  if (isProduction()) {
    console.error(`[EMAIL] ${messageType} email not sent: RESEND_API_KEY is not configured for ${destination}`);
    return false;
  }
  console.log(`[EMAIL] ${messageType} email would be sent to ${destination} with token [redacted]`);
  return true;
}

export async function sendEmail(to: string, subject: string, body: string, attachments: EmailAttachment[] = []): Promise<boolean> {
  const client = getResendClient();
  if (client) {
    const result = await client.emails.send({
      from: getEmailFrom(),
      to,
      subject,
      text: body,
      attachments: attachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
    });
    if (result.error) {
      console.error(`[EMAIL] Failed to send email to ${maskEmail(to)}: ${result.error.message}`);
      return false;
    }
    return true;
  }

  const attachmentSummary = attachments.length > 0 ? ` with ${attachments.length} attachment(s)` : "";
  if (isProduction()) {
    console.error(`[EMAIL] Email not sent: RESEND_API_KEY is not configured for ${maskEmail(to)}: ${subject}${attachmentSummary}`);
    return false;
  }
  console.log(`[EMAIL] Email would be sent to ${to}: ${subject}${attachmentSummary}`);
  return true;
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  const resetUrl = `${getAppUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const body = [
    "Use the link below to reset your Helscoop password.",
    "",
    resetUrl,
    "",
    "If you did not request this, ignore this email.",
  ].join("\n");

  const client = getResendClient();
  if (!client) return sensitiveFallback("Password reset", email);

  return sendEmail(email, "Reset your Helscoop password", body);
}

export async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  const verifyUrl = `${getAppUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const body = [
    "Use the link below to verify your Helscoop email address.",
    "",
    verifyUrl,
    "",
    "If you did not create this account, ignore this email.",
  ].join("\n");

  const client = getResendClient();
  if (!client) return sensitiveFallback("Verification", email);

  return sendEmail(email, "Verify your Helscoop email", body);
}

export async function sendPriceAlertEmail(email: string, alertData: Record<string, unknown>): Promise<boolean> {
  const material = typeof alertData.material === "string" ? alertData.material : "a watched material";
  return sendEmail(
    email,
    "Helscoop price alert",
    `Price alert: ${material} has a new price update in Helscoop.`,
  );
}
