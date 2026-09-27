import { Resend } from "resend";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
export function invitationEmail(workspaceName: string, inviteUrl: string) {
  const name = escapeHtml(workspaceName),
    url = escapeHtml(inviteUrl);
  return {
    subject: `Join ${workspaceName} on AutoLister`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1d2926"><h1 style="color:#17644c">AutoLister</h1><p>You have been invited to join <strong>${name}</strong>.</p><p><a href="${url}" style="display:inline-block;background:#17644c;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Accept invitation</a></p><p>This link expires in 48 hours and works only for your email address.</p><p>If you did not expect this invitation, you can ignore it.</p></div>`,
  };
}
export async function sendInvitationEmail(
  to: string,
  workspaceName: string,
  inviteUrl: string,
) {
  if (process.env.OPS_INVITE_MAIL_ENABLED !== "1")
    throw new Error("Invitation mail is disabled");
  const key = process.env.RESEND_API_KEY,
    from = process.env.OPS_INVITE_FROM;
  if (!key || !from)
    throw new Error("Invitation mail configuration is incomplete");
  const { data, error } = await new Resend(key).emails.send({
    from,
    to,
    ...invitationEmail(workspaceName, inviteUrl),
  });
  if (error) throw error;
  return { messageId: data?.id ?? null };
}
