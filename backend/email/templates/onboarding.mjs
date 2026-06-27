import { sendMailWithTimeout } from '../transport.mjs';

// ═══════════════════════════════════════════════════════════════
// 📧 Onboarding Email Template
// Phase 1D Split (v2.6.345)
// ═══════════════════════════════════════════════════════════════

export function buildOnboardingHtml(displayName, email, setupLink, expiryFormatted) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to AceTrack</title>
</head>
<body style="margin:0;padding:0;background-color:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F1F5F9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background:linear-gradient(135deg,#0F172A 0%,#1E293B 100%);border-radius:16px 16px 0 0;padding:32px 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="background:rgba(99,102,241,0.2);border-radius:12px;padding:10px;vertical-align:middle;">
                          <img src="https://img.icons8.com/fluency/48/shield.png" alt="Shield" width="28" height="28" style="display:block;">
                        </td>
                        <td style="padding-left:14px;vertical-align:middle;">
                          <span style="color:#F8FAFC;font-size:22px;font-weight:800;letter-spacing:-0.5px;">AceTrack</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="background:rgba(99,102,241,0.2);color:#A5B4FC;font-size:11px;font-weight:700;padding:6px 14px;border-radius:20px;letter-spacing:1px;">CONFIDENTIAL</span>
                  </td>
                </tr>
              </table>
              <div style="height:3px;background:linear-gradient(90deg,#4F46E5,#7C3AED,#EC4899);border-radius:2px;margin-top:24px;"></div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#FFFFFF;padding:40px;">
              <h1 style="margin:0 0 8px;font-size:26px;font-weight:800;color:#0F172A;">Welcome to the Team!</h1>
              <p style="margin:0 0 24px;font-size:16px;color:#475569;line-height:1.6;">
                Hi <strong style="color:#0F172A;">${displayName}</strong>
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.7;">
                You've been officially invited to join <strong style="color:#0F172A;">AceTrack</strong> as a <strong style="color:#4F46E5;">Support Agent</strong>. 
                We're excited to have you on board! Complete your account setup to get started with managing player support and tournament operations.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="${setupLink}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#FFFFFF;font-size:16px;font-weight:700;text-decoration:none;padding:16px 48px;border-radius:12px;letter-spacing:0.3px;">
                      Complete Your Setup
                    </a>
                  </td>
                </tr>
              </table>
              <div style="height:1px;background:#E2E8F0;margin:4px 0 28px;"></div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:28px;">
                <tr>
                  <td width="33%" style="padding:0 6px 0 0;">
                    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px;text-align:center;">
                      <div style="font-size:20px;margin-bottom:6px;">User</div>
                      <div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:1px;">Your Role</div>
                      <div style="font-size:14px;font-weight:700;color:#1E293B;margin-top:4px;">Support Agent</div>
                    </div>
                  </td>
                  <td width="33%" style="padding:0 3px;">
                    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px;text-align:center;">
                      <div style="font-size:20px;margin-bottom:6px;">Office</div>
                      <div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:1px;">Department</div>
                      <div style="font-size:14px;font-weight:700;color:#1E293B;margin-top:4px;">Customer Success</div>
                    </div>
                  </td>
                  <td width="33%" style="padding:0 0 0 6px;">
                    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px;text-align:center;">
                      <div style="font-size:20px;margin-bottom:6px;">Chart</div>
                      <div style="font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:1px;">Reports To</div>
                      <div style="font-size:14px;font-weight:700;color:#1E293B;margin-top:4px;">System Admin</div>
                    </div>
                  </td>
                </tr>
              </table>
              <h2 style="margin:0 0 16px;font-size:18px;font-weight:800;color:#0F172A;">What's Next?</h2>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom:8px;">
                <tr><td style="padding:8px 0;"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#FFF;font-size:12px;font-weight:800;width:28px;height:28px;border-radius:50%;text-align:center;line-height:28px;vertical-align:top;">1</td><td style="padding-left:14px;font-size:14px;color:#475569;line-height:1.5;"><strong style="color:#1E293B;">Click the button</strong> above to open your secure setup page</td></tr></table></td></tr>
                <tr><td style="padding:8px 0;"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#FFF;font-size:12px;font-weight:800;width:28px;height:28px;border-radius:50%;text-align:center;line-height:28px;vertical-align:top;">2</td><td style="padding-left:14px;font-size:14px;color:#475569;line-height:1.5;"><strong style="color:#1E293B;">Fill in your personal details</strong> - name, phone, and permanent address</td></tr></table></td></tr>
                <tr><td style="padding:8px 0;"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#FFF;font-size:12px;font-weight:800;width:28px;height:28px;border-radius:50%;text-align:center;line-height:28px;vertical-align:top;">3</td><td style="padding-left:14px;font-size:14px;color:#475569;line-height:1.5;"><strong style="color:#1E293B;">Upload your Government ID</strong> - Aadhaar, PAN, Passport, or Driving License</td></tr></table></td></tr>
                <tr><td style="padding:8px 0;"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#FFF;font-size:12px;font-weight:800;width:28px;height:28px;border-radius:50%;text-align:center;line-height:28px;vertical-align:top;">4</td><td style="padding-left:14px;font-size:14px;color:#475569;line-height:1.5;"><strong style="color:#1E293B;">Set a secure password</strong> - minimum 8 characters</td></tr></table></td></tr>
              </table>
              <div style="height:1px;background:#E2E8F0;margin:24px 0;"></div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:16px 20px;">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="vertical-align:top;padding-right:12px;font-size:16px;font-weight:bold;color:#9A3412;">Important:</td>
                        <td>
                          <div style="font-size:13px;font-weight:700;color:#9A3412;margin-bottom:4px;">Security Notice</div>
                          <div style="font-size:12px;color:#C2410C;line-height:1.5;">
                            This invitation link expires on <strong>${expiryFormatted} IST</strong>. 
                            Do not forward this email - the link is bound to your email address. 
                            If the link has expired, contact the System Administrator for a new one.
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:12px;color:#94A3B8;line-height:1.6;">
                If the button doesn't work, copy and paste this URL into your browser:<br>
                <a href="${setupLink}" style="color:#4F46E5;word-break:break-all;font-size:11px;">${setupLink}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#0F172A;border-radius:0 0 16px 16px;padding:28px 40px;text-align:center;">
              <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#F8FAFC;">AceTrack</p>
              <p style="margin:0 0 16px;font-size:12px;color:#64748B;">Sports Tournament Platform - Powering Competitive Excellence</p>
              <div style="height:1px;background:#334155;margin:0 auto 16px;max-width:200px;"></div>
              <p style="margin:0;font-size:11px;color:#475569;line-height:1.6;">
                This is an automated email from AceTrack Systems.<br>
                Please do not reply to this email.
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

export async function sendOnboardingEmail(toEmail, setupLink, expiresAt, firstName = '', lastName = '') {
  const expiryDate = new Date(expiresAt);
  const expiryFormatted = expiryDate.toLocaleString('en-IN', { 
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' 
  });

  let displayName;
  if (firstName && lastName) {
    displayName = `${lastName}, ${firstName}`;
  } else if (firstName) {
    displayName = firstName;
  } else {
    displayName = toEmail.split('@')[0]
      .replace(/\d+$/g, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[._-]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim() || 'Team Member';
  }

  const htmlBody = buildOnboardingHtml(displayName, toEmail, setupLink, expiryFormatted);
  const textBody = `Welcome to AceTrack!\n\nHi ${displayName}\n\nYou've been invited to join AceTrack as a Support Agent.\n\nComplete Your Setup: ${setupLink}\n\nThis link expires on ${expiryFormatted} IST.\n\nBest regards,\nAceTrack Systems`;

  const mailOptions = {
    from: `"AceTrack Systems" <${process.env.GMAIL_USER || "acetrack.noreply@gmail.com"}>`,
    replyTo: process.env.GMAIL_USER || "acetrack.noreply@gmail.com",
    to: toEmail,
    subject: `\u{1F6E1}\uFE0F AceTrack \u2014 Complete Your Support Agent Setup`,
    html: htmlBody,
    text: textBody,
    headers: {
      'List-Unsubscribe': `<mailto:${process.env.GMAIL_USER || "acetrack.noreply@gmail.com"}?subject=unsubscribe>`
    }
  };

  try {
    const info = await sendMailWithTimeout(mailOptions);
    console.log(`Email sent to ${toEmail}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`Failed to send onboarding email to ${toEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}
