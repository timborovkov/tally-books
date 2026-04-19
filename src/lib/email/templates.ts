export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderInvite(args: {
  inviteUrl: string;
  scopeSummary: string;
  invitedByName: string | null;
  invitedByEmail: string;
}): RenderedEmail {
  const inviter = args.invitedByName
    ? `${args.invitedByName} (${args.invitedByEmail})`
    : args.invitedByEmail;
  const subject = "You've been invited to Tally";
  const text = `${inviter} invited you to Tally — a self-hosted bookkeeping workspace.

You'll be given the following access:
${args.scopeSummary}

Accept the invite and set your password:
${args.inviteUrl}

You'll be asked to set up 2FA (TOTP) before you can sign in.
This invite expires in 72 hours.`;

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;line-height:1.5;padding:24px;max-width:560px;margin:0 auto;">
  <h1 style="font-size:20px;margin:0 0 16px;">You've been invited to Tally</h1>
  <p>${escapeHtml(inviter)} invited you to Tally — a self-hosted bookkeeping workspace.</p>
  <p style="margin-top:16px;"><strong>You'll be given the following access:</strong></p>
  <pre style="background:#f1f5f9;padding:12px;border-radius:6px;white-space:pre-wrap;">${escapeHtml(args.scopeSummary)}</pre>
  <p style="margin-top:24px;">
    <a href="${escapeHtml(args.inviteUrl)}" style="background:#0f172a;color:white;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">Accept invite</a>
  </p>
  <p style="color:#64748b;font-size:13px;margin-top:24px;">You'll be asked to set up 2FA (TOTP) before you can sign in. This invite expires in 72 hours.</p>
  <p style="color:#64748b;font-size:12px;margin-top:8px;word-break:break-all;">If the button doesn't work, open this URL: ${escapeHtml(args.inviteUrl)}</p>
</body></html>`;
  return { subject, html, text };
}
