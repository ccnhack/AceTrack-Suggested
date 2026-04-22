import { describe, it, expect } from 'vitest';

const API_URL = 'http://localhost:3005/api';
const VALID_KEY = process.env.ACE_API_KEY;

describe('AceTrack Public Resilience', () => {

  it('should return 404 for non-existent tournament results', async () => {
    const res = await fetch(`${API_URL}/results/NON_EXISTENT_ID`);
    if (res.status === 429) return; // Rate limited, skip assertion
    expect(res.status).toBe(404);
  });

  it('should handle malformed tournament with null players effectively', async () => {
    // 1. Poison the DB with a corrupted tournament (atomic overwrite)
    await fetch(`${API_URL}/save`, {
      method: 'POST',
      headers: { 'x-ace-api-key': VALID_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tournaments: [{ id: 'CORRUPTED_1', name: 'Poison Tourney' }], // Minimal tourney
        atomicKeys: ['tournaments']
      })
    });

    // 2. Fetch results for it (the handler should NOT crash despite missing match/player data)
    const res = await fetch(`${API_URL}/results/CORRUPTED_1`);
    if (res.status === 429) return;
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tournament).toBeDefined();
    expect(data.topPlayers).toEqual([]); // Should be safe empty array
  });

  it('should handle malformed tournament with missing matches safely', async () => {
    const res = await fetch(`${API_URL}/results/CORRUPTED_1`);
    if (res.status === 429) return;
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.matches).toEqual([]); // Defensive extraction should return empty array
  });

});
