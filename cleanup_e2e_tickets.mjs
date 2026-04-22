import fetch from 'node-fetch';

const BASE_URL = 'https://acetrack-suggested.onrender.com';
const API_KEY = process.env.ACE_API_KEY;

async function cleanup() {
  console.log('🧹 Starting E2E Ticket Cleanup...');

  try {
    // 1. Fetch Current State
    const dataRes = await fetch(`${BASE_URL}/api/data`, {
      headers: { 'x-ace-api-key': API_KEY }
    });
    
    if (!dataRes.ok) throw new Error(`Fetch failed: ${dataRes.status}`);
    const state = await dataRes.json();
    
    const initialCount = (state.supportTickets || []).length;
    console.log(`📋 Total tickets found: ${initialCount}`);

    // 2. Filter out e2e_user tickets
    const cleanedTickets = (state.supportTickets || []).filter(t => t.userId !== 'e2e_user');
    const removedCount = initialCount - cleanedTickets.length;

    if (removedCount === 0) {
      console.log('✅ No E2E tickets found to clean.');
      return;
    }

    console.log(`🗑️  Removing ${removedCount} test tickets...`);

    // 3. Sync Cleaned State back to Cloud (v2.6.48 Master Purge)
    const savePayload = {
      supportTickets: cleanedTickets,
      version: 10001, // 🛡️ Master Version Jump (10,001)
      atomicKeys: ['supportTickets'] 
    };

    const saveRes = await fetch(`${BASE_URL}/api/save`, {
      method: 'POST',
      headers: { 
        'x-ace-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(savePayload)
    });

    if (saveRes.ok) {
      console.log(`✨ Cleanup Successful! ${removedCount} tickets removed. State synced to version ${savePayload.version}.`);
    } else {
      const err = await saveRes.json();
      console.error('❌ Failed to sync cleaned state:', err);
    }

  } catch (error) {
    console.error('❌ Cleanup process failed:', error.message);
  }
}

cleanup();
