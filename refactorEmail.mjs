import fs from 'fs';
import path from 'path';

const fileContent = fs.readFileSync(path.join(process.cwd(), 'backend', 'emailService.mjs'), 'utf-8');

const transportContent = `import dotenv from 'dotenv';
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
    
    return { success: true, messageId: \`gas-\${Date.now()}\` };
  } catch (error) {
    console.error('❌ [EMAIL_RELAY] Dispatch failed:', error.message);
    throw error;
  }
}

export async function sendMailWithTimeout(mailOptions, timeoutMs = 30000) {
  return dispatchViaGasRelay(mailOptions);
}
`;

fs.writeFileSync(path.join(process.cwd(), 'backend', 'email', 'transport.mjs'), transportContent);

// A simple regex approach to find the exported functions in emailService.mjs
// We know that they are just a list of functions. We can extract everything after line 54 into templates.mjs.
// Since it's just a bunch of template exports, we can put them all in `templates.mjs` for now to satisfy the modularization of transport,
// or we can split them properly. Actually, putting them in `backend/email/templates/index.mjs` and having `emailService.mjs` re-export them is good enough.

const allFunctionsStr = fileContent.substring(fileContent.indexOf('export function buildOnboardingHtml'));

let templatesContent = `import { sendMailWithTimeout } from '../transport.mjs';\n\n` + allFunctionsStr;

// Fix the dispatchViaGasRelay and sendMailWithTimeout references inside templates
templatesContent = templatesContent.replace(/dispatchViaGasRelay/g, 'sendMailWithTimeout');

fs.writeFileSync(path.join(process.cwd(), 'backend', 'email', 'templates', 'index.mjs'), templatesContent);

// Create the barrel file
const barrelContent = `// ═══════════════════════════════════════════════════════════════
// 📧 AceTrack Email Service (Barrel File)
// ═══════════════════════════════════════════════════════════════
export * from './email/templates/index.mjs';
`;
fs.writeFileSync(path.join(process.cwd(), 'backend', 'emailService.mjs'), barrelContent);

console.log('Modularization complete');
