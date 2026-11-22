import "server-only";

import nodemailer from "nodemailer";

export type EmailMessage = { to: string; subject: string; text: string; html: string };

export function emailConfig() {
  const user = process.env.GMAIL_USER?.trim();
  const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  return user && appPassword ? { user, appPassword } : null;
}

export async function sendEmail(message: EmailMessage): Promise<{ sent: boolean }> {
  try {
    const { to, subject, text, html } = message;
    const config = emailConfig();
    if (!config) return { sent: false };

    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: config.user, pass: config.appPassword },
    });
    await transport.sendMail({ from: `"FitCoach AI" <${config.user}>`, to, subject, text, html });
    return { sent: true };
  } catch {
    return { sent: false };
  }
}
