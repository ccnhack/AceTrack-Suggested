import { AppState, Player } from '../models/index.mjs';

/**
 * Initializes and registers all WebSocket handlers.
 */
export default function registerWebSocketHandlers(io, activeSupportSessions, logServerEvent) {
io.on('connection', async (socket) => {
  logServerEvent('WS_CLIENT_CONNECTED', { socketId: socket.id });
  
  // 🕐 [SESSION TRACKER] (v2.6.267): Track support employee sessions
  const connUserId = socket.handshake?.query?.userId;
  const connRole = socket.handshake?.query?.role;
  const connDeviceName = socket.handshake?.query?.deviceName || 'Browser';

  // 🏗️ PHASE 4: Join user-specific room for targeted emissions
  if (connUserId && connUserId !== 'guest') {
    socket.join(`user:${connUserId}`);
    console.log(`🎯 [ROOM] ${connUserId} joined room user:${connUserId}`);
  }
  // All authenticated users join a global 'authenticated' room
  if (connUserId && connUserId !== 'guest') {
    socket.join('authenticated');
  }
  // Role-based rooms
  if (connRole === 'admin') socket.join('role:admin');
  if (connRole === 'support') socket.join('role:support');
  
  if (connUserId && connUserId !== 'guest' && connUserId !== 'admin') {
    console.log(`[DEBUG] WS Connection from user: ${connUserId}, provided role: ${connRole || 'none'}, device: ${connDeviceName}`);
    
    // 🛡️ [DEDUP] (v2.6.274): Evict stale sessions for the same userId to prevent duplicates
    // This handles the case where setUserToken triggers a socket reconnect before the old one disconnects
    for (const [existingSocketId, existingSess] of activeSupportSessions) {
      if (existingSess.userId === connUserId && existingSocketId !== socket.id) {
        console.log(`🕐 [SESSION] Evicting stale session for ${connUserId} (old socket: ${existingSocketId}, new: ${socket.id})`);
        activeSupportSessions.delete(existingSocketId);
      }
    }

    // Use the explicitly provided role from the client if available
    if (connRole === 'support') {
      activeSupportSessions.set(socket.id, {
        userId: connUserId,
        startTime: Date.now(),
        deviceName: connDeviceName
      });
      console.log(`🕐 [SESSION] Support employee ${connUserId} session started via client role (socket: ${socket.id}, device: ${connDeviceName})`);
    } else {
      // Fallback: check database if client didn't provide role
      try {
        const state = await AppState.findOne().sort({ lastUpdated: -1 });
        if (state?.data?.players) {
          const player = state.data.players.find(p => String(p.id) === String(connUserId));
          console.log(`[DEBUG] Database lookup for ${connUserId} returned role: ${player?.role || 'not found'}`);
          if (player && player.role === 'support') {
            activeSupportSessions.set(socket.id, {
              userId: connUserId,
              startTime: Date.now(),
              deviceName: connDeviceName
            });
            console.log(`🕐 [SESSION] Support employee ${connUserId} session started via DB lookup (socket: ${socket.id}, device: ${connDeviceName})`);
          }
        }
      } catch (e) {
        console.warn('[SESSION] Failed to check user role on connect:', e.message);
      }
    }
  }

  socket.on('admin_pull_diagnostics', (data) => {
    logServerEvent('ADMIN_PULL_DIAGNOSTICS_REQUESTED', data);
    // 🛡️ [TARGETED_RELAY] (v2.6.274): Only send to sockets belonging to the target user
    // instead of broadcasting to everyone, which was causing missed deliveries
    for (const [sid, sess] of activeSupportSessions) {
      if (String(sess.userId) === String(data.targetUserId)) {
        io.to(sid).emit('force_upload_diagnostics', data);
        console.log(`[DIAG] Relayed force_upload_diagnostics to socket ${sid} for user ${data.targetUserId}`);
      }
    }
    // Also broadcast to non-support users (regular mobile clients)
    io.emit('force_upload_diagnostics', data);
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
        const state = await AppState.findOne().sort({ lastUpdated: -1 });
        if (state && state.data && state.data.players) {
          const players = [...state.data.players];
          const uIdx = players.findIndex(p => String(p.id) === String(data.targetUserId));
          if (uIdx !== -1) {
            const user = players[uIdx];
            user.devices = user.devices || [];
            const dIdx = user.devices.findIndex(d => d && d.id === data.deviceId);
            
            if (dIdx === -1) {
              console.log(`📡 [AUTO-REG] Adding new device ${data.deviceId} to user ${data.targetUserId}`);
              user.devices.push({
                id: data.deviceId,
                name: data.deviceName || 'Unknown Device',
                appVersion: data.appVersion || '2.6.258',
                lastActive: Date.now()
              });
              state.markModified('data.players');
              await state.save();
            } else {
              // Update last active and metadata
              user.devices[dIdx].lastActive = Date.now();
              user.devices[dIdx].name = data.deviceName || user.devices[dIdx].name;
              user.devices[dIdx].appVersion = data.appVersion || user.devices[dIdx].appVersion;
              state.markModified('data.players');
              await state.save();
            }
          }
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
    const session = activeSupportSessions.get(socket.id);
    if (session) {
      activeSupportSessions.delete(socket.id);
      const durationMs = Date.now() - session.startTime;
      const durationMins = Math.round(durationMs / 60000);
      console.log(`🕐 [SESSION] Support employee ${session.userId} disconnected after ${durationMins}m`);
      
      // Only persist sessions longer than 1 minute to avoid noise from reconnects
      if (durationMs > 60000) {
        try {
          const state = await AppState.findOne().sort({ lastUpdated: -1 });
          if (state?.data?.players) {
            const players = state.data.players;
            const uIdx = players.findIndex(p => String(p.id) === String(session.userId));
            if (uIdx !== -1) {
              players[uIdx].sessionHistory = players[uIdx].sessionHistory || [];
              players[uIdx].sessionHistory.push({
                startTime: new Date(session.startTime).toISOString(),
                endTime: new Date().toISOString(),
                durationMs,
                device: session.deviceName || 'Browser'
              });
              // Cap at 200 entries to prevent unbounded growth
              if (players[uIdx].sessionHistory.length > 200) {
                players[uIdx].sessionHistory = players[uIdx].sessionHistory.slice(-200);
              }
              state.markModified('data.players');
              await state.save();
              console.log(`🕐 [SESSION] Persisted ${durationMins}m session for ${session.userId}`);
            }
          }
        } catch (e) {
          console.error('🕐 [SESSION] Failed to persist session:', e.message);
        }
      }
    }
  });
});
}
