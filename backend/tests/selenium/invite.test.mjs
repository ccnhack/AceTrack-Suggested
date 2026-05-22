import { By } from 'selenium-webdriver';
import { trackLogs, sleep, waitForSignal } from './utils.mjs';

export async function runInviteScenario(driver, baseUrl) {
  console.log("\n=========================================================");
  console.log("🧪 SCENARIO 4: Support Invites (Analytics Defuser)");
  console.log("=========================================================");

  await driver.get(baseUrl);

  console.log("\n⏳ ACTION REQUIRED:");
  console.log("1. Please paste the generated setup invite link into the Chrome address bar and hit Enter.");
  console.log("2. Let the page load completely.");
  
  await waitForSignal("Please paste the invite link and tell the agent in chat.");

  console.log("✅ Invite Link pasted. Monitoring analytics payload for array bomb defuser (HTTP 200).");

  let hasErrors = false;
  // Monitor for 1 minute
  for(let i = 0; i < 12; i++) {
    await sleep(5000);
    const err = await trackLogs(driver, 'SupportInvite');
    if (err) hasErrors = true;
    console.log(`... monitoring analytics (${(i+1)*5}s)`);
  }

  if (hasErrors) {
    console.error("❌ Errors detected during Support Invite loading.");
  } else {
    console.log("✅ Support Invite Scenario Complete. No unhandled crashes or 500s detected.");
  }
}
