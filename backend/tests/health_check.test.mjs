import { describe, it, expect } from 'vitest';

const API_URL = 'http://localhost:3005/api';

describe('AceTrack Health Check', () => {

  it('should return 200 and status ok for public health endpoint', async () => {
    const res = await fetch(`${API_URL}/health`);
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.version).toBeDefined();
    expect(data.uptime).toBeGreaterThanOrEqual(0);
  });

});
