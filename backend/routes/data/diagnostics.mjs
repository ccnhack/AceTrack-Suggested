import express from 'express';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { AppState, AuditLog, Player, Tournament, Match, MatchVideo, SupportTicket, Evaluation, Matchmaking, ChatbotThread } from '../../models/index.mjs';
import { asyncHandler, getISTTimestamp } from '../../helpers/utils.mjs';
import { processTournamentWaitlist } from '../../promotion_logic.mjs';
import { apiKeyGuard, authGuard, sensitiveCacheGuard, validate, SaveDataSchema, DiagnosticsSchema, AutoFlushSchema, getSanitizedState } from '../../middleware/security.mjs';

export default function ({
  APP_VERSION,
  io,
  logServerEvent,
  logAudit,
  syncMutex,
  cloudinary,
  DIAGNOSTICS_DIR,
  upload,
  SupportMetricsService,
  sendPushNotification,
  addInAppNotification, }) {
  const router = express.Router();

router.get('/diagnostics', apiKeyGuard, sensitiveCacheGuard, asyncHandler(async (req, res) => {
  try {
    const { userId } = req.query;

    // 🛡️ FRONTEND SHIM: The legacy Web Admin Hub might have a stale frontend socket.
    // Hijack this REST query to emit the ping device relay directly from the server.
    if (userId) {
      logServerEvent('ADMIN_PING_DEVICE_SHIM', { targetUserId: userId });
      io.emit('admin_ping_device_relay', { targetUserId: userId });
    }

    let allFilesWithMeta = [];

    // 1. Fetch Cloud Files with metadata
    try {
      const result = await cloudinary.api.resources({
        type: 'upload',
        resource_type: 'raw',
        prefix: 'acetrack/diagnostics/',
        max_results: 500,
        direction: 'desc'
      });
        
      result.resources.forEach(file => {
        const parts = file.public_id.split('/');
        allFilesWithMeta.push({
          name: parts[parts.length - 1], // Raw files usually keep extension in public_id
          timestamp: new Date(file.created_at).getTime()
        });
      });
    } catch (e) {
      console.warn('Cloudinary resources fetch failed:', e.message);
    }
    
    // 2. Fetch Local Files with metadata
    try {
      if (fs.existsSync(DIAGNOSTICS_DIR)) {
        const localFiles = fs.readdirSync(DIAGNOSTICS_DIR);
        localFiles.forEach(file => {
          const stats = fs.statSync(path.join(DIAGNOSTICS_DIR, file));
          allFilesWithMeta.push({
            name: file,
            timestamp: stats.mtime.getTime()
          });
        });
      }
    } catch (e) {
      console.warn('Local diagnostic read failed:', e.message);
    }
    
    // 3. De-duplicate and Sort Global List (Latest First)
    const uniqueFilesMap = new Map();
    allFilesWithMeta.forEach(f => {
      // Keep the one with the latest timestamp if duplicates exist
      if (!uniqueFilesMap.has(f.name) || uniqueFilesMap.get(f.name) < f.timestamp) {
        uniqueFilesMap.set(f.name, f.timestamp);
      }
    });

    if (userId) console.log(`🔍 [AdminFetch] Filtering logs for: ${userId}`);
    
    const sortedFiles = Array.from(uniqueFilesMap.entries())
      .sort((a, b) => b[1] - a[1]) // Descending
      .map(entry => entry[0])
      .filter(f => {
        if (!userId) return true;
        // 🛡️ [MIGRATION FIX] (v2.6.802): Sanitize userId the SAME way the POST handler sanitizes
        // username when creating files (replace(/[^a-z0-9]/gi, '_')). Previously the GET filter used
        // raw toLowerCase(), so usernames with special chars (dots, @, etc.) never matched their
        // stored filenames (e.g. "john.doe" user → file "john_doe_...") → admin saw an empty log list.
        const safeId = String(userId).replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const fName = String(f).toLowerCase();
        console.log(`🔍 [AdminFetch] Checking file ${fName} against ID ${safeId}`);
        // Strict match: starts with user_ OR contains admin_requested_user_ OR manual_upload_ OR starts with user-
        return fName.startsWith(safeId + '_') ||
               fName.includes('_requested_' + safeId + '_') ||
               fName.includes('manual_upload_' + safeId + '_') ||
               fName.startsWith(safeId + '-');
      });

    res.json({ success: true, files: sortedFiles });
  } catch (error) {
    console.error('Diagnostics Fetch Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}));

router.get('/diagnostics/raw_events', apiKeyGuard, asyncHandler(async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }
  const filepath = path.join(DIAGNOSTICS_DIR, 'server_events.jsonl');
  if (fs.existsSync(filepath)) {
    const data = await fs.promises.readFile(filepath, 'utf8');
    res.setHeader('Content-Type', 'text/plain');
    return res.send(data);
  }
  res.status(404).send('Not found');
}));

router.get('/diagnostics/:filename', apiKeyGuard, asyncHandler(async (req, res) => {
  const filename = path.basename(req.params.filename);
  
  try {
    const publicId = `acetrack/diagnostics/${filename}`;
    const fileUrl = cloudinary.url(publicId, { resource_type: 'raw', secure: true });
    const cloudRes = await fetch(fileUrl);
    if (cloudRes.ok) {
      const contentType = cloudRes.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await cloudRes.json();
        return res.json(data);
      } else {
        const text = await cloudRes.text();
        return res.send(text);
      }
    }
  } catch (cloudErr) {
    console.log(`Cloudinary fetch failed for ${filename}, trying local fallback.`);
  }

  const filepath = path.join(DIAGNOSTICS_DIR, filename);
  if (fs.existsSync(filepath)) {
    const data = await fs.promises.readFile(filepath, 'utf8');
    return res.json(JSON.parse(data));
  }

  res.status(404).json({ error: 'File not found in cloud or local storage' });
}));

router.post('/diagnostics', apiKeyGuard, validate(DiagnosticsSchema), asyncHandler(async (req, res) => {
  const { username, logs, prefix, deviceId } = req.body;
    const timestamp = getISTTimestamp();
    const safeUsername = username.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    try {
      // 🛡️ [MIGRATION FIX] (v2.6.802): Rotate BOTH user-prefixed AND admin_requested_ files for this
      // user. The migrated code matched only one prefix, leaving the other kind to grow unbounded.
      const userFiles = fs.readdirSync(DIAGNOSTICS_DIR)
        .filter(f => f.startsWith(`${safeUsername}_`) || f.startsWith(`admin_requested_${safeUsername}_`))
        .sort((a, b) => {
          const statA = fs.statSync(path.join(DIAGNOSTICS_DIR, a));
          const statB = fs.statSync(path.join(DIAGNOSTICS_DIR, b));
          return statA.mtime.getTime() - statB.mtime.getTime();
        });
      while (userFiles.length >= 3) {
        fs.unlinkSync(path.join(DIAGNOSTICS_DIR, userFiles.shift()));
      }
    } catch (e) { /* silent */ }

    const filePrefix = prefix === 'admin_requested' ? 'admin_requested_' : '';
    const safeDeviceId = deviceId ? `_${deviceId.replace(/[^a-z0-9]/gi, '_')}` : '';
    const filename = `${filePrefix}${safeUsername}${safeDeviceId}_${timestamp}.json`;
    const filepath = path.join(DIAGNOSTICS_DIR, filename);

    const istDate = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const reportData = {
      username,
      deviceId: deviceId || 'Unknown Device',
      uploadedAt: istDate.toISOString().replace('Z', '+05:30'),
      logs
    };

    fs.writeFileSync(filepath, JSON.stringify(reportData, null, 2));

    console.log(`☁️ [Cloudinary] Starting upload for: ${filename} (Size: ${fs.statSync(filepath).size} bytes)`);
    try {
      const cloudResult = await cloudinary.uploader.upload(filepath, {
        folder: 'acetrack/diagnostics',
        resource_type: 'raw',
        public_id: filename,
        use_filename: true,
        unique_filename: false
      });
      console.log(`✅ [Cloudinary] Upload Success: ${cloudResult.secure_url} (ID: ${cloudResult.public_id})`);
      logServerEvent('DIAGNOSTICS_CLOUDINARY_BACKUP_SUCCESS', { 
        url: cloudResult.secure_url,
        public_id: cloudResult.public_id,
        filename: filename
      });
      logAudit(req, 'DIAG_UPLOAD_CLOUDINARY_SUCCESS', [], { url: cloudResult.secure_url, filename });
      
      try {
        const result = await cloudinary.api.resources({
          type: 'upload',
          resource_type: 'raw',
          prefix: 'acetrack/diagnostics/',
          max_results: 100,
          direction: 'desc'
        });
          
        // 🛡️ [MIGRATION FIX] (v2.6.802): Match BOTH prefixes so cloud rotation covers all of this
        // user's files, regardless of whether they were user-uploaded or admin-requested.
        const userFilesCloud = result.resources.filter(f => {
          const fName = f.public_id.split('/').pop().toLowerCase();
          return fName.startsWith(`${safeUsername}_`) || fName.startsWith(`admin_requested_${safeUsername}_`);
        });
        
        if (userFilesCloud.length > 3) {
          const filesToDelete = userFilesCloud.slice(3).map(f => f.public_id);
          console.log(`🧹 [Cloudinary] Rotating ${filesToDelete.length} old diagnostic(s) for ${safeUsername}`);
          await cloudinary.api.delete_resources(filesToDelete, { resource_type: 'raw' });
        }
      } catch (rotationErr) {
        console.error('❌ [Cloudinary] Rotation Failed:', rotationErr.message);
      }
      
    } catch (err) {
      console.error('❌ [Cloudinary] Diagnostics Backup Failed:', err.message);
      logServerEvent('DIAGNOSTICS_CLOUDINARY_BACKUP_ERROR', { 
        error: err.message, 
        filename,
        stack: err.stack 
      });
      await logAudit(req, 'DIAG_UPLOAD_CLOUDINARY_FAILED', [], { error: err.message, filename });
    }
    if (io) {
      io.emit('diagnostics_uploaded', { targetUserId: username.toLowerCase() });
    }
    res.json({ success: true, filename });
}));

router.post('/diagnostics/auto-flush', apiKeyGuard, validate(AutoFlushSchema), asyncHandler(async (req, res) => {
  const { username, deviceId, logs } = req.body;
  const safeUser = String(username || 'unknown').replace(/[^a-zA-Z0-9-]/gi, '_');
  const safeDevice = String(deviceId || 'unknown').replace(/[^a-zA-Z0-9-]/gi, '_');
  const timestamp = getISTTimestamp();
  const filename = `${safeUser}_${safeDevice}_${timestamp}.log`;
  
  const filePath = path.join(DIAGNOSTICS_DIR, filename);
  const logContent = logs.map(l => `[${l.timestamp}] ${l.level.toUpperCase()} [${l.type}]: ${l.message}`).join('\n');
  await fs.promises.writeFile(filePath, logContent);

  console.log(`☁️ [Cloudinary Auto-Flush] Starting upload for: ${filename} (Size: ${(await fs.promises.stat(filePath)).size} bytes)`);
  try {
    const cloudResult = await cloudinary.uploader.upload(filePath, {
      folder: 'acetrack/diagnostics/auto-flush',
      resource_type: 'raw',
      public_id: filename,
      use_filename: true,
      unique_filename: false
    });
    console.log(`✅ [Cloudinary Auto-Flush] Success: ${cloudResult.secure_url}`);
    await logServerEvent('AUTO_FLUSH_CLOUDINARY_BACKUP_SUCCESS', { 
      url: cloudResult.secure_url,
      filename: filename
    });
    await logAudit(req, 'AUTO_FLUSH_UPLOAD_CLOUDINARY_SUCCESS', [], { url: cloudResult.secure_url, filename });
  } catch (err) {
    console.error('❌ [Cloudinary Auto-Flush] Backup Failed:', err.message);
    await logServerEvent('AUTO_FLUSH_CLOUDINARY_BACKUP_ERROR', { 
      error: err.message, 
      filename,
      stack: err.stack
    });
    await logAudit(req, 'AUTO_FLUSH_UPLOAD_CLOUDINARY_FAILED', [], { error: err.message, filename });
  }

  const allFiles = await fs.promises.readdir(DIAGNOSTICS_DIR);
  const userFilesRaw = allFiles.filter(f => f.startsWith(`${safeUser}_${safeDevice}_`) && f.endsWith('.log'));
  const userFilesWithStats = await Promise.all(userFilesRaw.map(async f => ({
    name: f,
    mtime: (await fs.promises.stat(path.join(DIAGNOSTICS_DIR, f)).catch(() => ({ mtimeMs: 0 }))).mtimeMs
  })));
  
  const userFiles = userFilesWithStats
    .sort((a, b) => b.mtime - a.mtime) // Newest first
    .map(f => f.name);

  if (userFiles.length > 3) {
    for (const f of userFiles.slice(3)) {
      await fs.promises.unlink(path.join(DIAGNOSTICS_DIR, f)).catch(() => {});
    }
  }

  try {
    const result = await cloudinary.api.resources({
      type: 'upload',
      resource_type: 'raw',
      prefix: 'acetrack/diagnostics/auto-flush/',
      max_results: 100,
      direction: 'desc'
    });
    const userFilesCloud = result.resources.filter(f => {
      const fName = f.public_id.split('/').pop().toLowerCase();
      return fName.startsWith(`${safeUser}_${safeDevice}_`.toLowerCase()) && fName.endsWith('.log');
    });
    
    // Sort descending by timestamp extracted from filename
    userFilesCloud.sort((a, b) => {
      const timeA = parseInt(a.public_id.split('_').pop().replace('.log', '')) || 0;
      const timeB = parseInt(b.public_id.split('_').pop().replace('.log', '')) || 0;
      return timeB - timeA;
    });

    if (userFilesCloud.length > 3) {
      const filesToDelete = userFilesCloud.slice(3).map(f => f.public_id);
      console.log(`🧹 [Cloudinary] Rotating ${filesToDelete.length} old auto-flush logs for ${safeUser}`);
      await cloudinary.api.delete_resources(filesToDelete, { resource_type: 'raw' });
    }
  } catch (rotationErr) {
    console.error('❌ [Cloudinary Auto-Flush] Rotation Failed:', rotationErr.message);
  }

  res.json({ success: true, count: logs.length, retained: 3 });
}));


  return router;
}
