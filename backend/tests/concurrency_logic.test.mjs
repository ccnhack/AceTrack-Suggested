import { describe, it, expect, vi } from 'vitest';

// 🛡️ REPLICATED MUTEX LOGIC FROM server.mjs
class AsyncMutex {
  constructor() {
    this.queue = Promise.resolve();
  }
  acquire() {
    let release;
    const waiter = new Promise(resolve => { release = resolve; });
    const lock = this.queue.then(() => release);
    this.queue = this.queue.then(() => waiter).catch(() => {});
    return lock;
  }
}

describe('AceTrack Backend Concurrency Hardening', () => {
  it('should serialize multiple concurrent requests', async () => {
    const mutex = new AsyncMutex();
    let counter = 0;
    let order = [];

    const simulatedTask = async (id, delay) => {
      const release = await mutex.acquire();
      try {
        order.push(`start-${id}`);
        // Simulate a database operation with delay
        await new Promise(r => setTimeout(r, delay));
        counter++;
        order.push(`end-${id}`);
      } finally {
        release();
      }
    };

    // Fire 3 tasks concurrently
    // Note: They are fired at the same time, but should process one by one
    await Promise.all([
      simulatedTask(1, 50),
      simulatedTask(2, 20),
      simulatedTask(3, 10)
    ]);

    expect(counter).toBe(3);
    // Crucially, every "start" must be followed by its own "end" before the next "start"
    expect(order).toEqual([
      'start-1', 'end-1',
      'start-2', 'end-2',
      'start-3', 'end-3'
    ]);
  });

  describe('Unified Merge Logic Validation', () => {
    const simulateMerge = (current, incoming) => {
       const entityMap = new Map();
       current.forEach(e => entityMap.set(e.id.toLowerCase(), e));
       incoming.forEach(e => {
         const id = e.id.toLowerCase();
         const existing = entityMap.get(id);
         entityMap.set(id, { ...existing, ...e });
       });
       return Array.from(entityMap.values());
    };

    it('should correctly unify casing and merge entities', () => {
      const current = [{ id: 'TOURNEY_1', title: 'Old Title' }];
      const incoming = [{ id: 'tourney_1', title: 'New Title' }];
      const result = simulateMerge(current, incoming);
      
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('New Title');
      expect(result[0].id.toLowerCase()).toBe('tourney_1');
    });
  });
});
