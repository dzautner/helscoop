/**
 * Transactional email service using Resend.
 *
 * Environment variables:
 *   RESEND_API_KEY  - Resend API key (required for production)
 *   EMAIL_FROM      - Sender address (default: noreply@helscoop.fi)
 *   APP_URL         - Frontend URL for links in emails (default: http://localhost:3000)
 */
import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "Helscoop <noreply@helscoop.fi>";
const APP_URL = process.env.APP_URL || "http://localhost:3000";

// Initialize Resend client (no-ops gracefully if no API key)
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// ---------------------------------------------------------------------------
// Core send function
// ---------------------------------------------------------------------------

interface SendEmailOpts {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOpts): Promise<boolean> {
  if (!resend) {
    console.log(`[EMAIL_DEV] Would send to=${to} subject="${subject}"`);
    console.log(`[EMAIL_DEV] ${html.substring(0, 200)}...`);
    return true; // Don't fail in dev
  }

  try {
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html,
    });

    if (error) {
      console.error(`[EMAIL] Failed to send to ${to}:`, error);
      return false;
    }

    console.log(`[EMAIL] Sent "${subject}" to ${to}`);
    return true;
  } catch (err) {
    console.error(`[EMAIL] Error sending to ${to}:`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

function wrapTemplate(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; background: #0f0f0f; font-family: 'Inter', -apple-system, sans-serif; }
    .container { max-width: 560px; margin: 0 auto; padding: 40px 24px; }
    .header { text-align: center; padding-bottom: 32px; border-bottom: 2px solid #c4915c; margin-bottom: 32px; }
    .logo { font-size: 24px; font-weight: 700; color: #c4915c; text-decoration: none; letter-spacing: -0.5px; }
    .content { color: #e0e0e0; font-size: 15px; line-height: 1.6; }
    .content h2 { color: #ffffff; font-size: 20px; margin: 0 0 16px; }
    .content p { margin: 0 0 16px; }
    .btn { display: inline-block; background: #c4915c; color: #0f0f0f !important; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 600; font-size: 15px; margin: 8px 0 24px; }
    .btn:hover { background: #d4a06c; }
    .footer { margin-top: 40px; padding-top: 24px; border-top: 1px solid #2a2a2a; color: #666; font-size: 12px; text-align: center; }
    .footer a { color: #888; }
    .code { background: #1a1a1a; border: 1px solid #333; padding: 12px 16px; border-radius: 6px; font-family: monospace; font-size: 14px; color: #c4915c; letter-spacing: 2px; text-align: center; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <a href="${APP_URL}" class="logo">Helscoop</a>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Helscoop &mdash; Finnish house renovation platform</p>
      <p>Tama viesti lahetettiin osoitteesta <a href="${APP_URL}">${APP_URL}</a></p>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Password reset email
// ---------------------------------------------------------------------------

export async function sendPasswordResetEmail(to: string, token: string): Promise<boolean> {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;

  const html = wrapTemplate(`
    <h2>Salasanan nollaus / Password Reset</h2>
    <p>Sait taman viestin, koska pyysit salasanan nollausta Helscoop-tilillesi.</p>
    <p>You received this email because you requested a password reset for your Helscoop account.</p>
    <p style="text-align: center;">
      <a href="${resetUrl}" class="btn">Nollaa salasana / Reset Password</a>
    </p>
    <p>Jos painike ei toimi, kopioi tama linkki selaimeen:<br>
    <span style="color: #888; word-break: break-all; font-size: 13px;">${resetUrl}</span></p>
    <p style="color: #888; font-size: 13px;">Linkki on voimassa 1 tunnin. Jos et pyytanyt nollausta, voit jattaa taman viestin huomiotta.<br>
    This link expires in 1 hour. If you did not request this, you can safely ignore this email.</p>
  `);

  return sendEmail({ to, subject: "Helscoop: Salasanan nollaus / Password Reset", html });
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

export async function sendVerificationEmail(to: string, token: string): Promise<boolean> {
  const verifyUrl = `${APP_URL}/verify-email?token=${token}`;

  const html = wrapTemplate(`
    <h2>Vahvista sahkopostiosoitteesi / Verify Your Email</h2>
    <p>Tervetuloa Helscoopiin! Vahvista sahkopostiosoitteesi klikkaamalla alla olevaa painiketta.</p>
    <p>Welcome to Helscoop! Please verify your email address by clicking the button below.</p>
    <p style="text-align: center;">
      <a href="${verifyUrl}" class="btn">Vahvista sahkoposti / Verify Email</a>
    </p>
    <p>Jos painike ei toimi, kopioi tama linkki selaimeen:<br>
    <span style="color: #888; word-break: break-all; font-size: 13px;">${verifyUrl}</span></p>
    <p style="color: #888; font-size: 13px;">Linkki on voimassa 24 tuntia.<br>
    This link expires in 24 hours.</p>
  `);

  return sendEmail({ to, subject: "Helscoop: Vahvista sahkopostisi / Verify Your Email", html });
}

// ---------------------------------------------------------------------------
// Price alert email
// ---------------------------------------------------------------------------

interface PriceAlertItem {
  materialName: string;
  oldPrice: number;
  newPrice: number;
  supplier: string;
  link: string;
}

export async function sendPriceAlertEmail(to: string, items: PriceAlertItem[]): Promise<boolean> {
  const rows = items.map(item => {
    const pctDrop = Math.round((1 - item.newPrice / item.oldPrice) * 100);
    return `<tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #2a2a2a;">${item.materialName}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #2a2a2a; text-decoration: line-through; color: #888;">${item.oldPrice.toFixed(2)} &euro;</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #2a2a2a; color: #4ade80; font-weight: 600;">${item.newPrice.toFixed(2)} &euro; (-${pctDrop}%)</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #2a2a2a;"><a href="${item.link}" style="color: #c4915c;">${item.supplier}</a></td>
    </tr>`;
  }).join("");

  const html = wrapTemplate(`
    <h2>Hintahälytys / Price Drop Alert</h2>
    <p>Hyvät uutiset! Seuraamiesi materiaalien hinnat ovat laskeneet:</p>
    <p>Good news! Prices have dropped on materials you're tracking:</p>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <thead>
        <tr style="text-align: left; color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">
          <th style="padding: 8px 12px; border-bottom: 2px solid #333;">Materiaali</th>
          <th style="padding: 8px 12px; border-bottom: 2px solid #333;">Vanha</th>
          <th style="padding: 8px 12px; border-bottom: 2px solid #333;">Uusi</th>
          <th style="padding: 8px 12px; border-bottom: 2px solid #333;">Kauppa</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="text-align: center;">
      <a href="${APP_URL}" class="btn">Avaa Helscoop / Open Helscoop</a>
    </p>
  `);

  return sendEmail({ to, subject: "Helscoop: Hinnat laskeneet! / Prices Dropped!", html });
}
