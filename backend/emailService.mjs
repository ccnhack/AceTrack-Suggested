// ═══════════════════════════════════════════════════════════════
// 📧 AceTrack Email Service (v2.6.168)
// Uses Nodemailer + Gmail SMTP (free, 500 emails/day)
// ═══════════════════════════════════════════════════════════════
import nodemailer from 'nodemailer';

// Gmail SMTP Transporter
// Requires: GMAIL_USER and GMAIL_APP_PASSWORD env vars on Render
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

/**
 * Builds the premium HTML email body for onboarding.
 * Exported separately so it can be used by the /preview route.
 * @param {string} displayName - Formatted as "LastName, FirstName"
 */
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
          
          <!-- HEADER -->
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
              <!-- Gradient line -->
              <div style="height:3px;background:linear-gradient(90deg,#4F46E5,#7C3AED,#EC4899);border-radius:2px;margin-top:24px;"></div>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background-color:#FFFFFF;padding:40px;">
              
              <!-- Welcome -->
              <h1 style="margin:0 0 8px;font-size:26px;font-weight:800;color:#0F172A;">Welcome to the Team!</h1>
              <p style="margin:0 0 24px;font-size:16px;color:#475569;line-height:1.6;">
                Hi <strong style="color:#0F172A;">${displayName}</strong>,
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.7;">
                You've been officially invited to join <strong style="color:#0F172A;">AceTrack</strong> as a <strong style="color:#4F46E5;">Support Agent</strong>. 
                We're excited to have you on board! Complete your account setup to get started with managing player support and tournament operations.
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="${setupLink}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#FFFFFF;font-size:16px;font-weight:700;text-decoration:none;padding:16px 48px;border-radius:12px;letter-spacing:0.3px;">
                      Complete Your Setup
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <div style="height:1px;background:#E2E8F0;margin:4px 0 28px;"></div>

              <!-- Info Cards -->
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

              <!-- What's Next -->
              <h2 style="margin:0 0 16px;font-size:18px;font-weight:800;color:#0F172A;">What's Next?</h2>
              
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom:8px;">
                <tr>
                  <td style="padding:8px 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#FFF;font-size:12px;font-weight:800;width:28px;height:28px;border-radius:50%;text-align:center;line-height:28px;vertical-align:top;">1</td>
                        <td style="padding-left:14px;font-size:14px;color:#475569;line-height:1.5;">
                          <strong style="color:#1E293B;">Click the button</strong> above to open your secure setup page
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#FFF;font-size:12px;font-weight:800;width:28px;height:28px;border-radius:50%;text-align:center;line-height:28px;vertical-align:top;">2</td>
                        <td style="padding-left:14px;font-size:14px;color:#475569;line-height:1.5;">
                          <strong style="color:#1E293B;">Fill in your personal details</strong> - name, phone, and permanent address
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#FFF;font-size:12px;font-weight:800;width:28px;height:28px;border-radius:50%;text-align:center;line-height:28px;vertical-align:top;">3</td>
                        <td style="padding-left:14px;font-size:14px;color:#475569;line-height:1.5;">
                          <strong style="color:#1E293B;">Upload your Government ID</strong> - Aadhaar, PAN, Passport, or Driving License
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#FFF;font-size:12px;font-weight:800;width:28px;height:28px;border-radius:50%;text-align:center;line-height:28px;vertical-align:top;">4</td>
                        <td style="padding-left:14px;font-size:14px;color:#475569;line-height:1.5;">
                          <strong style="color:#1E293B;">Set a secure password</strong> - minimum 8 characters
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <div style="height:1px;background:#E2E8F0;margin:24px 0;"></div>

              <!-- Security Notice -->
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

              <!-- Fallback Link -->
              <p style="margin:24px 0 0;font-size:12px;color:#94A3B8;line-height:1.6;">
                If the button doesn't work, copy and paste this URL into your browser:<br>
                <a href="${setupLink}" style="color:#4F46E5;word-break:break-all;font-size:11px;">${setupLink}</a>
              </p>
            </td>
          </tr>

          <!-- FOOTER -->
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

/**
 * Sends the premium onboarding email to a new support agent.
 * @param {string} toEmail - Recipient email
 * @param {string} setupLink - Onboarding setup URL
 * @param {string} expiresAt - ISO expiry string
 * @param {string} firstName - Agent first name
 * @param {string} lastName - Agent last name
 */
export async function sendOnboardingEmail(toEmail, setupLink, expiresAt, firstName = '', lastName = '') {
  const expiryDate = new Date(expiresAt);
  const expiryFormatted = expiryDate.toLocaleString('en-IN', { 
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' 
  });

  // Build display name: "LastName, FirstName" or fallback to email-derived name
  let displayName;
  if (firstName && lastName) {
    displayName = `${lastName}, ${firstName}`;
  } else if (firstName) {
    displayName = firstName;
  } else {
    // Fallback: derive from email, strip trailing digits, split on dots/underscores/camelCase
    displayName = toEmail.split('@')[0]
      .replace(/\d+$/g, '')                    // strip trailing digits (e.g. "shekhar0517" → "shekhar")
      .replace(/([a-z])([A-Z])/g, '$1 $2')     // split camelCase
      .replace(/[._-]/g, ' ')                  // split on delimiters
      .replace(/\b\w/g, c => c.toUpperCase())  // capitalize each word
      .trim() || 'Team Member';
  }

  const htmlBody = buildOnboardingHtml(displayName, toEmail, setupLink, expiryFormatted);
  
  // Plain text version (critical for inbox delivery — spam filters penalize HTML-only emails)
  const textBody = `Welcome to AceTrack!

Hi ${displayName},

You've been invited to join AceTrack as a Support Agent. Complete your account setup to get started.

Complete Your Setup: ${setupLink}

Your role: Support Agent
Department: Customer Success

Security Notice:
This invitation link expires on ${expiryFormatted} IST. Do not forward this email.

Best regards,
AceTrack Systems`;

  const mailOptions = {
    from: `"AceTrack Systems" <${process.env.GMAIL_USER}>`,
    replyTo: process.env.GMAIL_USER,
    to: toEmail,
    subject: `\u{1F6E1}\uFE0F AceTrack \u2014 Complete Your Support Agent Setup`,
    html: htmlBody,
    text: textBody,
    headers: {
      'List-Unsubscribe': `<mailto:${process.env.GMAIL_USER}?subject=unsubscribe>`
    }
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${toEmail}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`Failed to send onboarding email to ${toEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

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
                Hi <strong>${displayName}</strong>,<br><br>
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
    from: `"AceTrack Security" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `\u{1F512} AceTrack Password Reset Request`,
    html: htmlBody,
    text: `Reset your AceTrack password: ${resetLink}\n\nThis link expires on ${expiryFormatted} IST.`
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`Failed to send reset email to ${toEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Builds the CEO's congratulations email.
 */
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
                Hi <strong>${firstName}</strong>,
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

/**
 * Builds the login credentials email.
 */
export function buildCredentialsHtml(name, email, username) {
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
                </table>
              </div>

              <div style="margin-top:24px;text-align:center;">
                 <p style="font-size:12px;color:#94A3B8;">Use your password set during setup to log in.</p>
                 <a href="https://acetrack-suggested.onrender.com/admin" style="display:inline-block;margin-top:12px;background:#0F172A;color:#FFFFFF;padding:12px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">Access Portal</a>
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
    from: `"Shashank Shekhar" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `\u{2764}\uFE0F Welcome to AceTrack, ${firstName}!`,
    html: buildWelcomeHtml(firstName),
    text: `Welcome to the family, ${firstName}! Congratulations on becoming an AceTrackian. Message from CEO Shashank Shekhar: Welcome to the organization!`
  };
  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (err) {
    console.error("Success email failed:", err.message);
    return { success: false };
  }
}

export async function sendLoginDetailsEmail(toEmail, name, username) {
  const mailOptions = {
    from: `"AceTrack Systems" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `\u{1F510} Your AceTrack Login Credentials`,
    html: buildCredentialsHtml(name, toEmail, username),
    text: `Login Details:\nName: ${name}\nEmail: ${toEmail}\nUsername: ${username}`
  };
  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (err) {
    console.error("Credentials email failed:", err.message);
    return { success: false };
  }
}

/**
 * Builds the Force Password Reset email (Admin Triggered).
 */
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
                 <a href="https://acetrack-suggested.onrender.com/admin" style="display:inline-block;background:#EF4444;color:#FFFFFF;padding:16px 40px;border-radius:12px;text-decoration:none;font-weight:800;font-size:15px;box-shadow:0 10px 15px -3px rgba(239,68,68,0.3);">Login to AceTrack</a>
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
    from: `"AceTrack Security" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `\u{26A0}\uFE0F ACTION REQUIRED: Your AceTrack Password Has Been Reset`,
    html: buildForceResetHtml(name, newPassword),
    text: `Your AceTrack password has been reset due to organizational policy.\nNew Password: ${newPassword}\nLogin: https://acetrack-suggested.onrender.com/admin`
  };
  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (err) {
    console.error("Force reset email failed:", err.message);
    return { success: false };
  }
}

/**
 * Builds the Promotion email.
 */
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
                Hi <strong>${name}</strong>,<br><br>
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

/**
 * Builds the supportive Demotion email (v2.6.148).
 */
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
                Hi <strong>${name}</strong>,<br><br>
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


/**
 * Builds the Termination email.
 */
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
                Dear <strong>${name}</strong>,<br><br>
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

export async function sendPromotionEmail(toEmail, name, newRole) {
  const mailOptions = {
    from: `"AceTrack HR" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `🌟 Congratulations on your Promotion!`,
    html: buildPromotionHtml(name, newRole)
  };
  return transporter.sendMail(mailOptions).catch(e => console.error(e));
}

export async function sendDemotionEmail(toEmail, name, newRole) {
  const mailOptions = {
    from: `"AceTrack HR" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `💙 A supportive update regarding your AceTrack role`,
    html: buildDemotionHtml(name, newRole)
  };
  return transporter.sendMail(mailOptions).catch(e => console.error(e));
}


export async function sendTerminationEmail(toEmail, name) {
  const mailOptions = {
    from: `"AceTrack HR" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `Important update regarding your employment`,
    html: buildTerminationHtml(name)
  };
  return transporter.sendMail(mailOptions).catch(e => console.error(e));
}

/**
 * Re-Onboarding Email — sent when a terminated employee is reinstated.
 * Includes new login credentials.
 */
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
    from: `"AceTrack HR" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `🎉 Welcome Back to AceTrack — Your Account Has Been Reinstated`,
    html: buildReOnboardingHtml(name, newPassword),
    text: `Welcome back to AceTrack, ${name}! Your account has been reinstated.\nNew Access Key: ${newPassword}\nLogin: https://acetrack-suggested.onrender.com/login`
  };
  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (err) {
    console.error("Re-onboarding email failed:", err.message);
    return { success: false };
  }
}

export default { 
  sendOnboardingEmail, 
  sendPasswordResetEmail, 
  buildOnboardingHtml,
  sendOnboardingSuccessEmail,
  sendLoginDetailsEmail,
  sendAdminResetPasswordEmail,
  sendPromotionEmail,
  sendDemotionEmail,
  sendTerminationEmail,
  sendReOnboardingEmail
};

