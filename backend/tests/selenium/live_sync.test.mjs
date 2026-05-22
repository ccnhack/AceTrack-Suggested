import { Builder, By } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { trackLogs, sleep, createDriver, waitForSignal } from './utils.mjs';

export async function runLiveSyncScenario(driver1, baseUrl) {
  console.log("\n=========================================================");
  console.log("🧪 SCENARIO 3: Live Data Syncing (WebSocket Pub/Sub)");
  console.log("=========================================================");

  let driver2;
  try {
    driver2 = await createDriver();
    
    await driver1.get(baseUrl);
    await driver2.get(baseUrl);

    console.log("\n⏳ ACTION REQUIRED:");
    console.log("1. Please log in to Window 1 (e.g., as Support).");
    console.log("2. Please log in to Window 2 (e.g., as Admin or User).");
    console.log("3. Navigate both to a shared view (like a chat or ticket thread).");
    console.log("4. Send a message in Window 1.");

    await waitForSignal("Please complete WebSocket messaging and tell the agent in chat.");

    console.log("✅ Messages sent. Monitoring for WebSocket synchronization errors...");

    let hasErrors = false;
    for(let i = 0; i < 6; i++) {
      await sleep(5000);
      const err1 = await trackLogs(driver1, 'LiveSync-Window1');
      const err2 = await trackLogs(driver2, 'LiveSync-Window2');
      if (err1 || err2) hasErrors = true;
      console.log(`... monitoring sync (${(i+1)*5}s)`);
    }

    if (hasErrors) {
      console.error("❌ Errors detected during Live Sync.");
    } else {
      console.log("✅ Live Sync Scenario Complete. No unhandled crashes detected across devices.");
    }
  } finally {
    if (driver2) {
      await driver2.quit();
    }
  }
}
