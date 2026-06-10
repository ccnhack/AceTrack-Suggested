import { AppState, Player, SupportTicket, Tournament } from '../models/index.mjs';

/**
 * Initializes and registers all WebSocket handlers.
 */
export default function registerWebSocketHandlers(io, logServerEvent) {
io.on('connection', async (socket) => {
  logServerEvent('WS_CLIENT_CONNECTED', { socketId: socket.id });
  
  // 🕐 [SESSION TRACKER] (v2.6.267): Track support employee sessions
  const connUserId = socket.handshake?.query?.userId;
  const connRole = socket.handshake?.query?.role;
  const connDeviceName = socket.handshake?.query?.deviceName || 'Browser';
  // 🛡️ [USER-AGENT CAPTURE] (v2.6.424): Differentiate multiple browser sessions
  const connUserAgent = socket.handshake?.headers?.['user-agent'] || 'Unknown';

  console.log(`📡 [WS_HANDSHAKE] socket=${socket.id} | userId=${connUserId} | role=${connRole} | device=${connDeviceName}`);

  // 🏗️ PHASE 4: Join user-specific room for targeted emissions
  if (connUserId && connUserId !== 'guest') {
    socket.join(`user:${connUserId}`);
    console.log(`🎯 [ROOM_INIT] ${connUserId} joined room user:${connUserId}`);
    socket.join('authenticated');
  } else {
    console.warn(`⚠️ [WS_WARN] socket=${socket.id} connected without userId! Waiting for manual join...`);
  }

  // 🛡️ [CATCH_UP] (v2.6.617): Send missed events to reconnecting clients
  // When a mobile app comes back from background, it may have missed entity_updated events.
  // The client sends lastSyncTimestamp in the handshake query; we replay changes since then.
  const lastSyncTs = socket.handshake?.query?.lastSyncTimestamp;
  if (lastSyncTs && !isNaN(Number(lastSyncTs))) {
    const sinceDate = new Date(Number(lastSyncTs));
    const maxCatchupWindow = 10 * 60 * 1000; // 10 minutes max to prevent abuse
    const now = Date.now();
    
    if (now - sinceDate.getTime() <= maxCatchupWindow) {
      try {
        const [changedTickets, changedTournaments] = await Promise.all([
          SupportTicket.find({ lastUpdated: { $gt: sinceDate } }).select('data').lean().limit(50),
          Tournament.find({ lastUpdated: { $gt: sinceDate } }).select('data').lean().limit(50),
        ]);

        const totalChanges = changedTickets.length + changedTournaments.length;
        if (totalChanges > 0) {
          socket.emit('catch_up', {
            supportTickets: changedTickets.map(d => d.data),
            tournaments: changedTournaments.map(d => d.data),
            timestamp: now
          });
          console.log(`🔄 [CATCH_UP] Sent ${totalChanges} missed entities to ${connUserId || socket.id} (window: ${Math.round((now - sinceDate.getTime()) / 1000)}s)`);
        }
      } catch (e) {
        console.warn(`[CATCH_UP] Failed for ${connUserId || socket.id}:`, e.message);
      }
    }
  }

  // 🛡️ [VAPT-F10] (v2.6.556): Validate room joins against authenticated identity
  socket.on('join', (userId) => {
    if (!userId) return;
    const requestedId = userId.toLowerCase();
    // Only allow joining own room if authenticated
    if (socket.user && socket.user.id) {
      if (socket.user.id.toLowerCase() !== requestedId && socket.user.role !== 'admin') {
        console.warn(`🛑 [ROOM_BLOCKED] ${socket.user.id} tried to join room user:${requestedId} — rejected`);
        return;
      }
    }
    const room = `user:${requestedId}`;
    socket.join(room);
    socket.join('authenticated');
    console.log(`🎯 [ROOM_MANUAL] ${userId} joined room ${room} via explicit join event.`);
  });

  // Role-based rooms
  if (connRole === 'admin') socket.join('role:admin');
  if (connRole === 'support') socket.join('role:support');
  
  if (connUserId && connUserId !== 'guest') {
    console.log(`[DEBUG] WS Connection from user: ${connUserId}, provided role: ${connRole || 'none'}, device: ${connDeviceName}`);
    
    // 🛡️ [MULTI-SESSION SUPPORT] (v2.6.424): Removed dedup eviction.
    // Multiple browser tabs/sessions from the same user are now tracked individually.
    // Each socket.id is unique, so concurrent sessions are distinguished by their socket ID + user-agent.

    // Use the explicitly provided role from the client if available
    // 🛡️ [SCALABILITY FIX] (v2.6.620): Migrate active sessions to DB for multi-instance support.
    const startSession = async () => {
      try {
        await Player.updateOne(
          { id: String(connUserId) },
          { $set: { 
              "data.isLive": true, 
              "data.liveSocketId": socket.id, 
              "data.liveDeviceName": connDeviceName, 
              "data.liveUserAgent": connUserAgent, 
              "data.liveSessionStart": Date.now() 
            } 
          }
        );
        console.log(`🕐 [SESSION] Support employee ${connUserId} DB session started (socket: ${socket.id})`);
      } catch (e) {
        console.warn('[SESSION] Failed to start DB session:', e.message);
      }
    };

    if (connRole === 'support') {
      startSession();
    } else {
      // Fallback: check database if client didn't provide role
      try {
        const playerDoc = await Player.findOne({ id: String(connUserId) }).lean();
        const player = playerDoc?.data;
        if (player && player.role === 'support') {
          startSession();
        }
      } catch (e) {
        console.warn('[SESSION] Failed to check user role on connect:', e.message);
      }
    }
  }

  socket.on('admin_pull_diagnostics', (data) => {
    logServerEvent('ADMIN_PULL_DIAGNOSTICS_REQUESTED', data);
    // 🛡️ [TARGETED_RELAY] (v2.6.316): Target the specific user's room for efficiency
    // This avoids global broadcasts and loops, ensuring only the target device receives the trigger.
    if (data.targetUserId) {
      io.to(`user:${data.targetUserId}`).emit('force_upload_diagnostics', data);
      console.log(`[DIAG] Target relay: force_upload_diagnostics to user:${data.targetUserId}`);
    } else {
      // Emergency fallback for legacy admin hub pings that might miss a targetId
      io.to('authenticated').emit('force_upload_diagnostics', data);
    }
  });

  socket.on('admin_ping_device', (data) => {
    logServerEvent('ADMIN_PING_DEVICE', { targetUserId: data.targetUserId, fromSocket: socket.id });
    // 🏗️ PHASE 4: Target the specific user's room instead of global broadcast
    io.to(`user:${data.targetUserId}`).emit('admin_ping_device_relay', data);
  });

  socket.on('device_pong', async (data) => {
    logServerEvent('DEVICE_PONG_RECEIVED', { targetUserId: data.targetUserId, deviceId: data.deviceId, deviceName: data.deviceName, fromSocket: socket.id });
    // 🏗️ PHASE 4: Send pong only to admin room instead of global broadcast
    io.to('role:admin').emit('device_pong_relay', data);

    // 🛡️ [AUTO-REGISTRATION] (v2.6.259)
    // If a live pong is received, ensure this device is in the user's permanent history
    if (data.targetUserId && data.deviceId) {
      try {
        // 🛡️ SCALABILITY FIX (v2.6.316): Read/write via Player distinct collection
        const playerDoc = await Player.findOne({ id: String(data.targetUserId) });
        if (playerDoc && playerDoc.data) {
            const user = playerDoc.data;
            user.devices = user.devices || [];
            const dIdx = user.devices.findIndex(d => d && d.id === data.deviceId);
            
            if (dIdx === -1) {
              console.log(`📡 [AUTO-REG] Adding new device ${data.deviceId} to user ${data.targetUserId}`);
              user.devices.push({
                id: data.deviceId,
                name: data.deviceName || 'Unknown Device',
                appVersion: data.appVersion || '2.6.316',
                lastActive: Date.now()
              });
            } else {
              // Update last active and metadata
              user.devices[dIdx].lastActive = Date.now();
              user.devices[dIdx].name = data.deviceName || user.devices[dIdx].name;
              user.devices[dIdx].appVersion = data.appVersion || user.devices[dIdx].appVersion;
            }
            // 🛡️ ARCHITECTURE FIX (v2.6.527): Cap array to prevent 16MB MongoDB explosion
            if (user.devices.length > 5) {
              user.devices.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
              user.devices = user.devices.slice(0, 5);
            }
            await Player.updateOne(
              { id: String(data.targetUserId) },
              { $set: { "data.devices": user.devices }, lastUpdated: new Date() }
            );
        }
      } catch (e) {
        console.error('❌ [AUTO-REG] Failed:', e.message);
      }
    }
  });

  // Support chat relay events — 🏗️ PHASE 4: Target ticket participants only
  socket.on('typing_start', (data) => {
    if (data.ticketId && data.recipientId) {
      io.to(`user:${data.recipientId}`).emit('typing_start', data);
    } else {
      io.emit('typing_start', data);
    }
  });
  socket.on('typing_stop', (data) => {
    if (data.ticketId && data.recipientId) {
      io.to(`user:${data.recipientId}`).emit('typing_stop', data);
    } else {
      io.emit('typing_stop', data);
    }
  });

  // 🏗️ PHASE 4: Tournament room management
  socket.on('join_tournament', (data) => {
    if (data.tournamentId) {
      socket.join(`tournament:${data.tournamentId}`);
      console.log(`🎯 [ROOM] ${connUserId || socket.id} joined tournament:${data.tournamentId}`);
    }
  });
  socket.on('leave_tournament', (data) => {
    if (data.tournamentId) {
      socket.leave(`tournament:${data.tournamentId}`);
    }
  });

  socket.on('disconnect', async () => {
    logServerEvent('WS_CLIENT_DISCONNECTED', { socketId: socket.id });
    
    // 🕐 [SESSION TRACKER] (v2.6.267): Persist session duration on disconnect
    // 🕐 [SESSION TRACKER] (v2.6.620): Persist session duration on disconnect using DB
    try {
      const playerDoc = await Player.findOne({ "data.liveSocketId": socket.id }).lean();
      if (playerDoc && playerDoc.data) {
        const session = playerDoc.data;
        if (session.liveSessionStart) {
          const durationMs = Date.now() - session.liveSessionStart;
          const durationMins = Math.round(durationMs / 60000);
          console.log(`🕐 [SESSION] Support employee ${session.id} disconnected after ${durationMins}m`);
          
          if (durationMs > 60000) {
            const { PlayerSession } = await import('../models/index.mjs');
            await PlayerSession.create({
              userId: session.id,
              startTime: new Date(session.liveSessionStart),
              endTime: new Date(),
              durationMs,
              device: session.liveDeviceName || 'Browser',
              userAgent: session.liveUserAgent || 'Unknown'
            });
          }
        }
        
        // Unset live fields
        await Player.updateOne(
          { id: session.id },
          { $unset: { "data.isLive": "", "data.liveSocketId": "", "data.liveDeviceName": "", "data.liveUserAgent": "", "data.liveSessionStart": "" } }
        );
      }
    } catch (e) {
      console.error('🕐 [SESSION] Failed to persist session on disconnect:', e.message);
    }
  });
});
}
