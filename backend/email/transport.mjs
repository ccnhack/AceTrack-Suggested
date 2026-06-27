import dotenv from 'dotenv';
dotenv.config();

/**
 * Dispatches an email payload via the Google Apps Script Web App.
 * This runs over port 443 (HTTPS), completely bypassing Render's port 465 SMTP firewall.
 */
async function dispatchViaGasRelay(mailOptions) {
  const gasUrl = process.env.GAS_EMAIL_URL;
  if (!gasUrl) {
    console.warn("⚠️ GAS_EMAIL_URL is not set. Emails will fail.");
    throw new Error('GAS_EMAIL_URL environment variable is missing.');
  }

  const payload = {
    to: mailOptions.to,
    subject: mailOptions.subject,
    html: mailOptions.html,
    text: mailOptions.text
  };

  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Unknown error from GAS Relay');
    }
    
    return { success: true, messageId: `gas-${Date.now()}` };
  } catch (error) {
    console.error('❌ [EMAIL_RELAY] Dispatch failed:', error.message);
    throw error;
  }
}

export async function sendMailWithTimeout(mailOptions, timeoutMs = 30000) {
  return dispatchViaGasRelay(mailOptions);
}
