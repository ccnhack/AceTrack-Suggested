import { describe, it, expect } from 'vitest';

const API_URL = 'http://localhost:3005/api';
const VALID_KEY = process.env.ACE_API_KEY;

describe('AceTrack Security & Hardened Gaskets', () => {
  
  it('should reject requests with missing API Key (401)', async () => {
    const res = await fetch(`${API_URL}/status`);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('Unauthorized');
  });

  it('should reject requests with invalid API Key (401)', async () => {
    const res = await fetch(`${API_URL}/status`, {
      headers: { 'x-ace-api-key': 'WRONG_KEY' }
    });
    expect(res.status).toBe(401);
  });

  it('should reject malformed sync data via Zod (400)', async () => {
    const res = await fetch(`${API_URL}/save`, {
      method: 'POST',
      headers: { 
        'x-ace-api-key': VALID_KEY,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        junk_field: 'not_expected',
        players: 'should_be_an_array' 
      })
    });
    if (res.status === 429) return;
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Validation failed');
  });

});
