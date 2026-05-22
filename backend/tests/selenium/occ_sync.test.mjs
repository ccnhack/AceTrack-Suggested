import { By } from 'selenium-webdriver';
import { trackLogs, sleep, waitForSignal } from './utils.mjs';

export async function runOccSyncScenario(driver, baseUrl) {
  console.log("\n=========================================================");
  console.log("🧪 SCENARIO 2: Cloud Sync Engine (OCC Validation)");
  console.log("=========================================================");

  await driver.get(baseUrl);

  console.log("\n⏳ WAITING FOR MANUAL LOGIN");
  console.log("1. Please log in.");
  console.log("2. Navigate to an entity (like a tournament, team, or profile).");
  console.log("3. Make an edit and save it.");

  await waitForSignal("Please complete OCC edit and tell the agent in chat.");

  console.log("✅ Authenticated and saved.");
  console.log("\n🔄 Monitoring network traffic to ensure OCC resolves without 409 conflicts.");

  let hasErrors = false;
  // Monitor for 30 seconds
  for(let i = 0; i < 6; i++) {
    await sleep(5000);
    const err = await trackLogs(driver, 'OccSync');
    if (err) hasErrors = true;
    console.log(`... monitoring saves (${(i+1)*5}s)`);
  }

  if (hasErrors) {
    console.error("❌ Errors detected during OCC Sync.");
  } else {
    console.log("✅ OCC Sync Scenario Complete. No unhandled crashes or 409s detected.");
  }
}
