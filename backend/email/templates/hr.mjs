import { sendMailWithTimeout } from '../transport.mjs';

// ═══════════════════════════════════════════════════════════════
// 👔 HR Email Templates (Promotion, Demotion, Termination, Suspension, Re-Onboarding)
// Phase 1D Split (v2.6.345)
// ═══════════════════════════════════════════════════════════════

export function buildPromotionHtml(name, newRole) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Congratulations on your Promotion!</title>
</head>
<body style="margin:0;padding:0;background-color:#F0FDF4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F0FDF4;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="550" cellspacing="0" cellpadding="0" style="max-width:550px;width:100%;">
          <tr>
            <td style="background-color:#FFFFFF;padding:40px;border-radius:24px;border:2px solid #22C55E;">
              <div style="background-color:#DCFCE7;width:60px;height:60px;border-radius:30px;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;">
                 <span style="font-size:30px;">🌟</span>
              </div>
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#166534;text-align:center;">Congratulations!</h2>
              
              <p style="font-size:16px;color:#475569;line-height:1.6;margin-bottom:24px;">
                Hi <strong>${name}</strong><br><br>
                We are thrilled to inform you that you have been promoted to the designation of <strong style="color:#15803D;font-size:18px;">${newRole}</strong> !
              </p>

              <blockquote style="margin:0 0 24px;padding:16px 20px;border-left:4px solid #22C55E;background-color:#F0FDF4;font-style:italic;color:#166534;line-height:1.6;">
                "Your dedication to resolving player issues and maintaining high satisfaction ratings has not gone unnoticed. Keep up the excellent work; this is just the beginning of your journey here!"
              </blockquote>

              <p style="font-size:14px;color:#64748B;line-height:1.6;text-align:center;">
                Your new access privileges have automatically been applied to your account.
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

export async function sendPromotionEmail(toEmail, name, newRole) {
  const mailOptions = {
    from: `"AceTrack HR" <${process.env.GMAIL_USER || "acetrack.noreply@gmail.com"}>`,
    to: toEmail,
    subject: `🌟 Congratulations on your Promotion!`,
    html: buildPromotionHtml(name, newRole)
  };
  return sendMailWithTimeout(mailOptions).catch(e => console.error(e));
}

export function buildDemotionHtml(name, newRole) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Let's Grow Together!</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF2FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#EEF2FF;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="550" cellspacing="0" cellpadding="0" style="max-width:550px;width:100%;">
          <tr>
            <td style="background-color:#FFFFFF;padding:40px;border-radius:24px;border:2px solid #6366F1;">
              <div style="background-color:#E0E7FF;width:60px;height:60px;border-radius:30px;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;">
                 <span style="font-size:30px;">💙</span>
              </div>
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#3730A3;text-align:center;">Let's Grow Together!</h2>
              
              <p style="font-size:16px;color:#475569;line-height:1.6;margin-bottom:24px;">
                Hi <strong>${name}</strong><br><br>
                We have updated your designation within the team to <strong style="color:#4338CA;font-size:18px;">${newRole}</strong>.
              </p>

              <p style="font-size:15px;color:#475569;line-height:1.7;margin-bottom:24px;">
                We want you to know that this change is about providing you with the right environment to refine your skills and master the foundations of our support operations. At AceTrack, we value sustainable growth and excellence, and we are fully committed to supporting you as you navigate this learning phase.
              </p>

              <blockquote style="margin:0 0 24px;padding:16px 20px;border-left:4px solid #6366F1;background-color:#F5F7FF;font-style:italic;color:#3730A3;line-height:1.6;">
                "Every great journey involve moments of recalibration. We believe in your potential and are here to help you reach the next level at a pace that ensures your long-term success."
              </blockquote>

              <p style="font-size:14px;color:#64748B;line-height:1.6;text-align:center;">
                Your new access privileges have been updated automatically. Your <strong>manager</strong> will be in touch shortly to discuss a supportive development plan tailored to you.
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

export async function sendDemotionEmail(toEmail, name, newRole) {
  const mailOptions = {
    from: `"AceTrack HR" <${process.env.GMAIL_USER || "acetrack.noreply@gmail.com"}>`,
    to: toEmail,
    subject: `💙 A supportive update regarding your AceTrack role`,
    html: buildDemotionHtml(name, newRole)
  };
  return sendMailWithTimeout(mailOptions).catch(e => console.error(e));
}

export function buildTerminationHtml(name) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Important Employment Update</title>
</head>
<body style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F8FAFC;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="550" cellspacing="0" cellpadding="0" style="max-width:550px;width:100%;">
          <tr>
            <td style="background-color:#FFFFFF;padding:40px;border-radius:24px;border:1px solid #E2E8F0;">
              
              <h2 style="margin:0 0 16px;font-size:20px;font-weight:900;color:#0F172A;">Employment Notice</h2>
              
              <p style="font-size:15px;color:#475569;line-height:1.7;margin-bottom:20px;">
                Dear <strong>${name}</strong><br><br>
                It is with a heavy heart that we are writing to you today. Due to ongoing restructuring situations within the organization, we have had to make the hard decision to reduce our current workforce.
              </p>

              <p style="font-size:15px;color:#475569;line-height:1.7;margin-bottom:24px;">
                Unfortunately, this means we must take the tough decision to terminate your employment with AceTrack, effective immediately. 
              </p>

              <p style="font-size:14px;color:#64748B;line-height:1.6;">
                We want to express our sincere gratitude for the time you spent with us and the effort you put into supporting our player base. It was a pleasure having you on the team, and we wish you the very best in your future endeavors.
              </p>
              
              <div style="margin-top:32px;border-top:1px solid #F1F5F9;padding-top:20px;">
                 <p style="font-size:13px;color:#94A3B8;margin:0;">Sincerely,</p>
                 <p style="font-size:14px;color:#0F172A;font-weight:700;margin:4px 0 0;">AceTrack Management Board</p>
              </div>

            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendTerminationEmail(toEmail, name) {
  const mailOptions = {
    from: `"AceTrack HR" <${process.env.GMAIL_USER || "acetrack.noreply@gmail.com"}>`,
    to: toEmail,
    subject: `Important update regarding your employment`,
    html: buildTerminationHtml(name)
  };
  return sendMailWithTimeout(mailOptions).catch(e => console.error(e));
}

export function buildReOnboardingHtml(name, newPassword) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome Back to AceTrack!</title>
</head>
<body style="margin:0;padding:0;background-color:#F0FDF4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F0FDF4;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="550" cellspacing="0" cellpadding="0" style="max-width:550px;width:100%;">
          <tr>
            <td style="background-color:#FFFFFF;padding:40px;border-radius:24px;border:2px solid #10B981;">
              <div style="background-color:#D1FAE5;width:60px;height:60px;border-radius:30px;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;">
                 <span style="font-size:30px;">🎉</span>
              </div>
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#065F46;text-align:center;">Welcome Back!</h2>
              
              <p style="font-size:15px;color:#475569;line-height:1.6;margin-bottom:24px;text-align:center;">
                Hi <strong>${name}</strong>,<br><br>
                Great news! Your AceTrack account has been <strong style="color:#059669;">reinstated</strong> by the System Administrator. You are back on the team!
              </p>

              <div style="background-color:#F8FAFC;border:1px dashed #CBD5E1;border-radius:16px;padding:28px;text-align:center;">
                <p style="margin:0 0 12px;font-size:11px;font-weight:800;color:#94A3B8;text-transform:uppercase;letter-spacing:1px;">Your New Access Key</p>
                <div style="font-size:28px;font-weight:900;color:#0F172A;letter-spacing:3px;font-family:monospace;">${newPassword}</div>
              </div>

              <div style="margin-top:32px;text-align:center;">
                 <a href="https://acetrack-suggested.onrender.com/login" style="display:inline-block;background:#10B981;color:#FFFFFF;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:800;font-size:15px;box-shadow:0 10px 15px -3px rgba(16,185,129,0.3);">Login to AceTrack</a>
              </div>

              <p style="margin-top:32px;font-size:12px;color:#94A3B8;line-height:1.6;text-align:center;">
                <strong>Note:</strong> Use your registered email and the access key above to log in. You may update your password from your profile settings once logged in.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#065F46;font-weight:700;">ACETRACK HR DEPARTMENT</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendReOnboardingEmail(toEmail, name, newPassword) {
  const mailOptions = {
    from: `"AceTrack HR" <${process.env.GMAIL_USER || "acetrack.noreply@gmail.com"}>`,
    to: toEmail,
    subject: `🎉 Welcome Back to AceTrack — Your Account Has Been Reinstated`,
    html: buildReOnboardingHtml(name, newPassword),
    text: `Welcome back to AceTrack, ${name}! Your account has been reinstated.\nNew Access Key: ${newPassword}\nLogin: https://acetrack-suggested.onrender.com/login`
  };
  try {
    await sendMailWithTimeout(mailOptions);
    return { success: true };
  } catch (err) {
    console.error("Re-onboarding email failed:", err.message);
    return { success: false };
  }
}

export function buildSuspensionHtml(name) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Access Suspended</title>
</head>
<body style="margin:0;padding:0;background-color:#FFF7ED;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#FFF7ED;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="550" cellspacing="0" cellpadding="0" style="max-width:550px;width:100%;">
          <tr>
            <td style="background-color:#FFFFFF;padding:40px;border-radius:24px;border:2px solid #F97316;">
              <div style="background-color:#FFEDD5;width:60px;height:60px;border-radius:30px;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;">
                 <span style="font-size:30px;">🔒</span>
              </div>
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:900;color:#9A3412;text-align:center;">Account Access Suspended</h2>
              
              <p style="font-size:16px;color:#475569;line-height:1.6;margin-bottom:24px;text-align:center;">
                Hi <strong>${name}</strong>,<br><br>
                Please be informed that your AceTrack access has been temporarily <strong>suspended</strong> by the System Administrator.
              </p>

              <div style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:16px;padding:24px;margin-bottom:24px;">
                <p style="margin:0;font-size:14px;color:#475569;line-height:1.6;">
                  During this period, you will not be able to log in to the management portal or process any player support tickets. All your active sessions have been invalidated for security.
                </p>
              </div>

              <p style="font-size:14px;color:#64748B;line-height:1.6;text-align:center;">
                Please contact your immediate supervisor or the IT department for further clarification regarding this suspension.
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

export async function sendSuspensionEmail(toEmail, name) {
  const mailOptions = {
    from: `"AceTrack Security" <${process.env.GMAIL_USER || "acetrack.noreply@gmail.com"}>`,
    to: toEmail,
    subject: `🔒 SECURITY NOTICE: Your AceTrack account has been suspended`,
    html: buildSuspensionHtml(name),
    text: `Your AceTrack account access has been suspended by the administrator. All active sessions have been terminated. Please contact your supervisor for details.`
  };
  try {
    await sendMailWithTimeout(mailOptions);
    logServerEvent('EMAIL_DISPATCH_SUCCESS', { type: 'suspension', to: toEmail });
    return { success: true };
  } catch (err) {
    console.error("Suspension email failed:", err.message);
    logServerEvent('EMAIL_DISPATCH_FAILED', { type: 'suspension', to: toEmail, error: err.message });
    return { success: false };
  }
}


