import { sendMailWithTimeout } from '../transport.mjs';

// ═══════════════════════════════════════════════════════════════
// 🏆 Coach Invitation Email Templates
// Phase 1D Split (v2.6.345)
// ═══════════════════════════════════════════════════════════════

export function buildCoachInviteHtml(name, academyName, tournamentName, inviteLink, expiryFormatted) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Coach Invitation: ${tournamentName}</title>
</head>
<body style="margin:0;padding:0;background-color:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F1F5F9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background:linear-gradient(135deg,#0F172A 0%,#1E293B 100%);border-radius:16px 16px 0 0;padding:32px 40px;">
              <h1 style="color:#F8FAFC;font-size:24px;font-weight:800;margin:0;">Tournament Invitation</h1>
            </td>
          </tr>
          <tr>
            <td style="background-color:#FFFFFF;padding:40px;border-radius:0 0 16px 16px;">
              <p style="margin:0 0 24px;font-size:16px;color:#475569;line-height:1.6;">
                Hi <strong style="color:#0F172A;">${name || 'Coach'}</strong>,
              </p>
              <p style="margin:0 0 28px;font-size:16px;color:#475569;line-height:1.7;">
                You have been invited by <strong style="color:#0F172A;">${academyName}</strong> to coach at the upcoming tournament: <strong style="color:#4F46E5;">${tournamentName}</strong>.
              </p>
              
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="${inviteLink}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#FFFFFF;font-size:16px;font-weight:700;text-decoration:none;padding:16px 48px;border-radius:12px;letter-spacing:0.3px;">
                      Accept & Register
                    </a>
                  </td>
                </tr>
              </table>

              <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:16px;margin-bottom:24px;">
                <p style="margin:0;font-size:13px;color:#9A3412;line-height:1.5;">
                  <strong>Security Note:</strong> This invitation link is unique to you and expires on <strong>${expiryFormatted} IST</strong>. 
                </p>
              </div>
              
              <p style="margin:0;font-size:12px;color:#94A3B8;line-height:1.6;text-align:center;">
                If the button doesn't work, copy this URL:<br>
                <a href="${inviteLink}" style="color:#4F46E5;">${inviteLink}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendCoachInviteEmail(toEmail, name, academyName, tournamentName, inviteLink, expiresAt) {
  const expiryDate = new Date(expiresAt);
  const expiryFormatted = expiryDate.toLocaleString('en-IN', { 
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' 
  });

  const mailOptions = {
    from: `"AceTrack Tournaments" <${process.env.GMAIL_USER || "acetrack.noreply@gmail.com"}>`,
    to: toEmail,
    subject: `🏆 Coaching Invitation: ${tournamentName}`,
    html: buildCoachInviteHtml(name, academyName, tournamentName, inviteLink, expiryFormatted),
    text: `You have been invited by ${academyName} to coach at ${tournamentName}.\n\nAccept Invitation: ${inviteLink}\n\nThis link expires on ${expiryFormatted} IST.`
  };
  try {
    await sendMailWithTimeout(mailOptions);
    return { success: true };
  } catch (err) {
    console.error("Coach invite email failed:", err.message);
    return { success: false, error: err.message };
  }
}


