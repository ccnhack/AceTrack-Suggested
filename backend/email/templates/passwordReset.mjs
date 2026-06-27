import { sendMailWithTimeout } from '../transport.mjs';

// ═══════════════════════════════════════════════════════════════
// 🔒 Password Reset Email Templates
// Phase 1D Split (v2.6.345)
// ═══════════════════════════════════════════════════════════════

export async function sendPasswordResetEmail(toEmail, resetLink, expiresAt, firstName = '') {
  const expiryDate = new Date(expiresAt);
  const expiryFormatted = expiryDate.toLocaleString('en-IN', { 
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' 
  });

  const displayName = firstName || toEmail.split('@')[0].replace(/\d+$/g, '').replace(/\b\w/g, c => c.toUpperCase());
  
  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your AceTrack Password</title>
</head>
<body style="margin:0;padding:0;background-color:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F1F5F9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background:#0F172A;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
              <span style="color:#F8FAFC;font-size:24px;font-weight:800;letter-spacing:-0.5px;">AceTrack Security</span>
            </td>
          </tr>
          <tr>
            <td style="background-color:#FFFFFF;padding:40px;border-radius:0 0 16px 16px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#0F172A;">Password Reset Request</h1>
              <p style="margin:0 0 24px;font-size:16px;color:#475569;line-height:1.6;">
                Hi <strong>${displayName}</strong><br><br>
                We received a request to reset the password for your AceTrack account. Click the button below to set a new password.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding:10px 0 32px;">
                    <a href="${resetLink}" target="_blank" style="display:inline-block;background:#4F46E5;color:#FFFFFF;font-size:16px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:12px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:16px;margin-bottom:24px;">
                <p style="margin:0;font-size:13px;color:#9A3412;line-height:1.5;">
                  <strong>Security Note:</strong> This link will expire in 60 minutes (at <strong>${expiryFormatted} IST</strong>). If you did not request this, please ignore this email.
                </p>
              </div>
              <p style="margin:0;font-size:12px;color:#94A3B8;line-height:1.6;text-align:center;">
                If the button doesn't work, copy this URL:<br>
                <a href="${resetLink}" style="color:#4F46E5;">${resetLink}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const mailOptions = {
    from: `"AceTrack Security" <${process.env.GMAIL_USER || "acetrack.noreply@gmail.com"}>`,
    to: toEmail,
    subject: `\u{1F512} AceTrack Password Reset Request`,
    html: htmlBody,
    text: `Reset your AceTrack password: ${resetLink}\n\nThis link expires on ${expiryFormatted} IST.`
  };

  return sendMailWithTimeout(mailOptions)
    .catch(error => {
      console.error('Failed to send reset email:', error);
      return { success: false, error: error.message };
    });
}

export function buildForceResetHtml(name, newPassword) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Notice: Password Reset</title>
</head>
<body style="margin:0;padding:0;background-color:#FEE2E2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#FEE2E2;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="550" cellspacing="0" cellpadding="0" style="max-width:550px;width:100%;">
          <tr>
            <td style="background-color:#FFFFFF;padding:40px;border-radius:24px;border:2px solid #EF4444;">
              <div style="background-color:#FEF2F2;width:60px;height:60px;border-radius:30px;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;">
                 <span style="font-size:30px;">🔐</span>
              </div>
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#991B1B;text-align:center;text-transform:uppercase;letter-spacing:1px;">Security Policy Update</h2>
              
              <p style="font-size:15px;color:#475569;line-height:1.6;margin-bottom:24px;text-align:center;">
                Hi <strong>${name}</strong>,<br><br>
                For security reasons and in accordance with organizational policies, your AceTrack account password has been reset by the System Administrator.
              </p>

              <div style="background-color:#F8FAFC;border:1px dashed #CBD5E1;border-radius:16px;padding:28px;text-align:center;">
                <p style="margin:0 0 12px;font-size:11px;font-weight:800;color:#94A3B8;text-transform:uppercase;letter-spacing:1px;">Your New Access Key</p>
                <div style="font-size:28px;font-weight:900;color:#0F172A;letter-spacing:3px;font-family:monospace;">${newPassword}</div>
              </div>

              <div style="margin-top:32px;text-align:center;">
                 <a href="https://acetrack-suggested.onrender.com/login" style="display:inline-block;background:#EF4444;color:#FFFFFF;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:800;font-size:15px;box-shadow:0 10px 15px -3px rgba(239,68,68,0.3);">Login to AceTrack</a>
              </div>

              <p style="margin-top:32px;font-size:12px;color:#94A3B8;line-height:1.6;text-align:center;">
                <strong>Note:</strong> All your previous active sessions have been terminated. After logging in, you may choose to update this password in your profile settings.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#991B1B;font-weight:700;">CONFIDENTIAL SECURITY BROADCAST</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendAdminResetPasswordEmail(toEmail, name, newPassword) {
  const mailOptions = {
    from: `"AceTrack Security" <${process.env.GMAIL_USER || "acetrack.noreply@gmail.com"}>`,
    to: toEmail,
    subject: `\u{26A0}\uFE0F ACTION REQUIRED: Your AceTrack Password Has Been Reset`,
    html: buildForceResetHtml(name, newPassword),
    text: `Your AceTrack password has been reset due to organizational policy.\nNew Password: ${newPassword}\nLogin: https://acetrack-suggested.onrender.com/login`
  };
  try {
    await sendMailWithTimeout(mailOptions);
    return { success: true };
  } catch (err) {
    console.error("Force reset email failed:", err.message);
    return { success: false };
  }
}


