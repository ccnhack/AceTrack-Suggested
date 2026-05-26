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
  addInAppNotification,
  activeSupportSessions
}) {
  const router = express.Router();

router.post('/upload', apiKeyGuard, authGuard, upload.single('video'), async (req, res) => {
  if (!req.file) {
    logServerEvent('UPLOAD_FAILED', { error: 'No file received' });
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    let uploadFolder = 'acetrack';
    if (req.file.mimetype.startsWith('video/')) uploadFolder = 'acetrack/videos';
    else if (req.file.mimetype.startsWith('image/')) uploadFolder = 'acetrack/images';
    else uploadFolder = 'acetrack/others';

    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        folder: uploadFolder,
        public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}${req.file.mimetype.startsWith('image/') ? '.jpg' : ''}`,
        format: req.file.mimetype.startsWith('image/') ? 'jpg' : undefined,
      },
      async (error, result) => {
        if (req.file.path) {
          fs.promises.unlink(req.file.path).catch(e => console.error("Cleanup error:", e));
        }

        if (error) {
          console.error("❌ Cloudinary Upload Error:", error);
          await logServerEvent('UPLOAD_FAILED_CLOUDINARY', { error: error.message });
          return res.status(500).json({ error: "Failed to upload to cloud" });
        }
        
        await logAudit(req, 'FILE_UPLOAD_CLOUDINARY', [], { url: result.secure_url, size: req.file.size });
        await logServerEvent('UPLOAD_SUCCESS_CLOUDINARY', { url: result.secure_url });
        
        res.json({ url: result.secure_url });
      }
    );

    fs.createReadStream(req.file.path).pipe(stream);
  } catch (error) {
    console.error('Upload Process Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post('/videos/save-metadata', apiKeyGuard, authGuard, async (req, res) => {
  const { video } = req.body;
  if (!video) return res.status(400).json({ error: 'Video metadata required' });

  try {
    const generatedId = video.id || `vid-${Date.now()}`;
    const enrichmentVideo = { 
      id: generatedId,
      ...video,
      adminStatus: video.adminStatus || 'Pending',
      timestamp: video.timestamp || new Date().toISOString()
    };

    let doc = await MatchVideo.findOne({ id: generatedId });
    if (!doc) {
      doc = new MatchVideo({ id: generatedId, data: enrichmentVideo });
    } else {
      doc.data = enrichmentVideo;
    }
    
    doc.lastUpdated = new Date();
    doc.markModified('data');
    await doc.save();

    if (io) {
      io.emit('entity_updated', {
        entity: 'matchVideos',
        data: doc.data,
        source: 'api',
        timestamp: Date.now()
      });
    }

    res.json({ success: true, video: doc.data });
  } catch (error) {
    console.error('[API] /videos/save-metadata error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/videos/update-status', apiKeyGuard, authGuard, async (req, res) => {
  const { videoId, status, additionalData } = req.body;
  if (!videoId || !status) return res.status(400).json({ error: 'videoId and status required' });

  try {
    const doc = await MatchVideo.findOne({ id: videoId });
    if (!doc || !doc.data) return res.status(404).json({ error: 'Video not found' });

    doc.data.adminStatus = status;
    if (additionalData) {
      Object.assign(doc.data, additionalData);
    }

    doc.lastUpdated = new Date();
    doc.markModified('data');
    await doc.save();

    if (io) {
      io.emit('entity_updated', {
        entity: 'matchVideos',
        data: doc.data,
        source: 'api',
        timestamp: Date.now()
      });
    }

    res.json({ success: true, video: doc.data });
  } catch (error) {
    console.error('[API] /videos/update-status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

  return router;
}
