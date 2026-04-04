import { describe, it, expect } from 'vitest';
import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3005';
const VALID_KEY = 'QnQdpSDrLodmhJoctmv89cQeTcjWn0Vp+pBpUE0bcY8=';

describe('AceTrack Socket.io Auth Hardening', () => {

  it('should reject connection without API Key', () => {
    return new Promise((resolve) => {
      const socket = io(SOCKET_URL, {
        reconnection: false,
        timeout: 2000,
        transports: ['websocket']
      });

      socket.on('connect_error', (err) => {
        expect(err.message).toContain('Unauthorized');
        socket.close();
        resolve();
      });
    });
  });

  it('should reject connection with wrong API Key', () => {
    return new Promise((resolve) => {
      const socket = io(SOCKET_URL, {
        reconnection: false,
        timeout: 2000,
        transports: ['websocket'],
        auth: { token: 'WRONG_KEY' }
      });

      socket.on('connect_error', (err) => {
        expect(err.message).toContain('Unauthorized');
        socket.close();
        resolve();
      });
    });
  });

  it('should accept connection with valid API Key in auth', () => {
    return new Promise((resolve, reject) => {
      const socket = io(SOCKET_URL, {
        reconnection: false,
        timeout: 2000,
        transports: ['websocket'],
        auth: { token: VALID_KEY }
      });

      socket.on('connect', () => {
        expect(socket.connected).toBe(true);
        socket.close();
        resolve();
      });

      socket.on('connect_error', (err) => {
        reject(err);
      });
    });
  });

});
