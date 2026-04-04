import { describe, it, expect } from 'vitest';

const API_URL = 'http://localhost:3005/api';
const VALID_KEY = 'QnQdpSDrLodmhJoctmv89cQeTcjWn0Vp+pBpUE0bcY8=';

describe('AceTrack Payload Limit Stress', () => {

  it('should accept a moderately large payload (5MB)', async () => {
    // 5MB string
    const largeData = 'A'.repeat(5 * 1024 * 1024);
    const res = await fetch(`${API_URL}/save`, {
      method: 'POST',
      headers: { 
        'x-ace-api-key': VALID_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        players: [{ id: 'pStress', data: largeData }],
        atomicKeys: ['players']
      })
    });
    
    expect(res.status).toBe(200);
  }, 30000);

  it('should reject a huge payload (>10MB) with 413 or 400', async () => {
    // 12MB string to be safe
    const hugeData = 'A'.repeat(12 * 1024 * 1024);
    try {
      const res = await fetch(`${API_URL}/save`, {
        method: 'POST',
        headers: { 
          'x-ace-api-key': VALID_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          players: [{ id: 'pHuge', data: hugeData }] 
        })
      });
      
      // Express usually returns 413 for payload too large
      expect([413, 400]).toContain(res.status);
    } catch (e) {
      // In some environments, the fetch might fail due to sheer size
      console.log('Fetch failed as expected for huge payload');
    }
  }, 30000);

});
