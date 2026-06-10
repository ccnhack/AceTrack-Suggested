/**
 * ADMIN SEED (v2.6.620 — Phase 2 Modularization)
 * Ensures the admin player document exists in the Player collection on startup.
 * Extracted from server.mjs (v2.6.521 / VAPT-F11)
 */
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Player } from '../models/index.mjs';
import { logServerEvent } from '../services/AuditService.mjs';

export async function seedAdmin() {
  try {
    const existingAdmin = await Player.findOne({ id: 'admin' }).lean();
    
    const generateRandomPassword = () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
      let password = '';
      const randomBytes = crypto.randomBytes(24);
      for (let i = 0; i < 24; i++) {
        password += chars[randomBytes[i] % chars.length];
      }
      return password;
    };
    
    const sendAdminPasswordEmail = async (password, reason) => {
      try {
        const nodemailer = (await import('nodemailer')).default;
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.SMTP_USER || 'acetrack.noreply@gmail.com',
            pass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD
          }
        });
        await transporter.sendMail({
          from: '"AceTrack Security" <acetrack.noreply@gmail.com>',
          to: 'acetrack.noreply@gmail.com',
          subject: `🔐 [SECURITY ALERT] Admin Password ${reason}`,
          html: `
            <h2>AceTrack Admin Password ${reason}</h2>
            <p><strong>Reason:</strong> ${reason}</p>
            <p><strong>Temporary Password:</strong> <code>${password}</code></p>
            <p><strong>Time:</strong> ${new Date().toISOString()}</p>
            <p>⚠️ Please change this password immediately after login.</p>
            <p><em>This is an automated security notification from AceTrack Backend.</em></p>
          `
        });
        console.log('📧 [ADMIN SEED] Password notification email sent to acetrack.noreply@gmail.com');
      } catch (emailErr) {
        console.error('❌ [ADMIN SEED] Failed to send email notification:', emailErr.message);
        logServerEvent('ADMIN_SEED_EMAIL_FAILED', { error: emailErr.message, passwordHint: password.substring(0, 3) + '***' });
      }
    };
    
    if (!existingAdmin) {
      const randomPw = generateRandomPassword();
      const hashedPassword = await bcrypt.hash(randomPw, 10);
      await Player.create({
        id: 'admin',
        data: {
          id: 'admin',
          name: 'System Admin',
          role: 'admin',
          email: '',
          password: hashedPassword,
          mustChangePassword: true
        },
        lastUpdated: new Date()
      });
      console.log('✅ [ADMIN SEED] Admin player document created with random credentials.');
      logServerEvent('ADMIN_SEED_CREATED', { message: 'Admin user was missing and has been seeded with a random password.' });
      await sendAdminPasswordEmail(randomPw, 'New Admin Account Created');
    } else {
      // 🛡️ Check if password field is missing or empty (corrupted document)
      const adminWithPw = await Player.findOne({ id: 'admin' }).select('+data.password').lean();
      if (!adminWithPw?.data?.password) {
        const randomPw = generateRandomPassword();
        const hashedPassword = await bcrypt.hash(randomPw, 10);
        await Player.updateOne(
          { id: 'admin' },
          { $set: { 'data.password': hashedPassword, 'data.mustChangePassword': true, lastUpdated: new Date() } }
        );
        console.log('⚠️ [ADMIN SEED] Admin had no password — reset to random credentials.');
        logServerEvent('ADMIN_PASSWORD_REPAIRED', { message: 'Admin password was null/empty and has been reset to a random value.' });
        await sendAdminPasswordEmail(randomPw, 'Password Reset (Empty/Corrupted)');
      } else {
        console.log('✅ [ADMIN SEED] Admin player document exists and has a password. No action taken.');
      }
    }
  } catch (seedErr) {
    console.error('❌ [ADMIN SEED] Failed to verify/create admin:', seedErr.message);
  }
}
