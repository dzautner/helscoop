export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType: string;
}

export async function sendEmail(to: string, subject: string, body: string, attachments: EmailAttachment[] = []): Promise<boolean> {
  const attachmentSummary = attachments.length > 0 ? ` with ${attachments.length} attachment(s)` : "";
  console.log(`[EMAIL] Email would be sent to ${to}: ${subject}${attachmentSummary}`);
  return true;
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  console.log(`[EMAIL] Password reset email would be sent to ${email} with token ${token}`);
  return true;
}

export async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  console.log(`[EMAIL] Verification email would be sent to ${email} with token ${token}`);
  return true;
}

export async function sendPriceAlertEmail(email: string, alertData: Record<string, unknown>): Promise<boolean> {
  console.log(`[EMAIL] Price alert email would be sent to ${email}`);
  return true;
}
