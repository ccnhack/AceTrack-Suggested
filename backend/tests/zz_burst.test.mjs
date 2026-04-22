import { describe, it, expect } from 'vitest';

const API_URL = 'http://localhost:3005/api';
const VALID_KEY = process.env.ACE_API_KEY;

describe('AceTrack Global Burst Hardening', () => {

  it('should engage Global Rate Limiter after heavy burst (429)', async () => {
    // Burst 205 requests (limit is 200/min)
    const requests = Array.from({ length: 205 }).map(() => 
      fetch(`${API_URL}/status`, { headers: { 'x-ace-api-key': VALID_KEY } })
    );
    
    const results = await Promise.all(requests);
    const hasLimiterKickedIn = results.some(r => r.status === 429);
    
    console.log(`📡 Burst Stats: ${results.filter(r => r.status === 200).length} OK, ${results.filter(r => r.status === 429).length} Limited`);
    
    expect(hasLimiterKickedIn).toBe(true);
  }, 15000);

});
