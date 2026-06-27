import { sendMailWithTimeout } from '../transport.mjs';

// ═══════════════════════════════════════════════════════════════
// 🎉 Welcome & Credentials Email Templates
// Phase 1D Split (v2.6.345)
// ═══════════════════════════════════════════════════════════════

export function buildWelcomeHtml(firstName) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to the family</title>
</head>
<body style="margin:0;padding:0;background-color:#F1F5F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F1F5F9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background:linear-gradient(135deg,#6366F1 0%,#4F46E5 100%);border-radius:16px 16px 0 0;padding:40px;text-align:center;">
              <div style="background:rgba(255,255,255,0.2);width:80px;height:80px;border-radius:40px;margin:0 auto 20px;display:flex;align-items:center;justify-content:center;">
                 <span style="font-size:40px;">❤️</span>
              </div>
              <h1 style="margin:0;font-size:28px;font-weight:800;color:#FFFFFF;letter-spacing:-0.5px;">Welcome to the Family!</h1>
            </td>
          </tr>
          <tr>
            <td style="background-color:#FFFFFF;padding:40px;border-radius:0 0 16px 16px;">
              <p style="font-size:18px;color:#0F172A;line-height:1.6;margin-bottom:24px;">
                Hi <strong>${firstName}</strong>
              </p>
              <p style="font-size:16px;color:#475569;line-height:1.7;margin-bottom:20px;">
                Congratulations on completing your onboarding! You are now officially an <strong style="color:#4F46E5;">AceTrackian</strong>.
              </p>
              <p style="font-size:16px;color:#475569;line-height:1.7;margin-bottom:24px;">
                Joining AceTrack isn't just about a job; it's about joining a mission to redefine competitive excellence in sports management. We are thrilled to have your energy and expertise on board.
              </p>
              <p style="font-size:16px;color:#475569;line-height:1.7;margin-bottom:32px;font-style:italic;">
                "Your journey with us starts today, and I am personally excited to see the impact you'll make in our support ecosystem. Welcome to the organization!"
              </p>
              
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-top:10px;">
                    <p style="margin:0;font-size:16px;font-weight:800;color:#0F172A;">Shashank Shekhar</p>
                    <p style="margin:0;font-size:14px;color:#64748B;font-weight:600;">CEO, AceTrack</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildCredentialsHtml(name, email, username, phone) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your AceTrack Login Details</title>
</head>
<body style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#F8FAFC;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="550" cellspacing="0" cellpadding="0" style="max-width:550px;width:100%;">
          <tr>
            <td style="background-color:#FFFFFF;padding:40px;border-radius:20px;border:1px solid #E2E8F0;">
              <h2 style="margin:0 0 20px;font-size:20px;font-weight:800;color:#0F172A;text-align:center;">Secure Login Credentials</h2>
              
              <p style="font-size:14px;color:#64748B;line-height:1.6;margin-bottom:24px;text-align:center;">
                Below are your official credentials for the AceTrack Management Portal. Please keep this information secure.
              </p>

              <div style="background-color:#F1F5F9;border-radius:14px;padding:24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding-bottom:12px;font-size:11px;font-weight:800;color:#94A3B8;text-transform:uppercase;letter-spacing:1px;">Full Name</td>
                  </tr>
                  <tr>
                    <td style="padding-bottom:20px;font-size:15px;font-weight:700;color:#0F172A;">${name}</td>
                  </tr>
                  <tr>
                    <td style="padding-bottom:12px;font-size:11px;font-weight:800;color:#94A3B8;text-transform:uppercase;letter-spacing:1px;">Registered Email</td>
                  </tr>
                  <tr>
                    <td style="padding-bottom:20px;font-size:15px;font-weight:700;color:#4F46E5;">${email}</td>
                  </tr>
                  <tr>
                    <td style="padding-bottom:12px;font-size:11px;font-weight:800;color:#94A3B8;text-transform:uppercase;letter-spacing:1px;">Username</td>
                  </tr>
                  <tr>
                    <td style="font-size:18px;font-weight:900;color:#0F172A;letter-spacing:0.5px;">${username}</td>
                  </tr>
                  <tr>
                    <td style="padding-top:20px;padding-bottom:12px;font-size:11px;font-weight:800;color:#94A3B8;text-transform:uppercase;letter-spacing:1px;">Registered Contact</td>
                  </tr>
                  <tr>
                    <td style="font-size:15px;font-weight:700;color:#0F172A;">${phone || 'Not Provided'}</td>
                  </tr>
                </table>
              </div>

              <div style="margin-top:24px;text-align:center;">
                 <p style="font-size:12px;color:#94A3B8;">Use your password set during setup to log in.</p>
                 <a href="https://acetrack-suggested.onrender.com/login" style="display:inline-block;margin-top:12px;background:#0F172A;color:#FFFFFF;padding:12px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">Access Portal</a>
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

export async function sendOnboardingSuccessEmail(toEmail, firstName) {
  const mailOptions = {
    from: `"Shashank Shekhar" <${process.env.GMAIL_USER || "acetrack.noreply@gmail.com"}>`,
    to: toEmail,
    subject: `\u{2764}\uFE0F Welcome to AceTrack, ${firstName}!`,
    html: buildWelcomeHtml(firstName),
    text: `Welcome to the family, ${firstName}! Congratulations on becoming an AceTrackian. Message from CEO Shashank Shekhar: Welcome to the organization!`
  };
  try {
    await sendMailWithTimeout(mailOptions);
    return { success: true };
  } catch (err) {
    console.error("Success email failed:", err.message);
    return { success: false };
  }
}

export async function sendLoginDetailsEmail(toEmail, name, username, phone) {
  const mailOptions = {
    from: `"AceTrack Systems" <${process.env.GMAIL_USER || "acetrack.noreply@gmail.com"}>`,
    to: toEmail,
    subject: `\u{1F510} Your AceTrack Login Credentials`,
    html: buildCredentialsHtml(name, toEmail, username, phone),
    text: `Login Details:\nName: ${name}\nEmail: ${toEmail}\nUsername: ${username}\nContact: ${phone || 'N/A'}`
  };
  try {
    await sendMailWithTimeout(mailOptions);
    return { success: true };
  } catch (err) {
    console.error("Credentials email failed:", err.message);
    return { success: false };
  }
}


