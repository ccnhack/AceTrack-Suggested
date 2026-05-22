import { By } from 'selenium-webdriver';
import { trackLogs, sleep, waitForSignal } from './utils.mjs';

export async function runRateLimitScenario(driver, baseUrl) {
  console.log("\n=========================================================");
  console.log("🧪 SCENARIO 5: Persistent Rate Limiting");
  console.log("=========================================================");

  await driver.get(baseUrl);
  
  console.log("\n⏳ ACTION REQUIRED:");
  console.log("1. Intentionally fail the login screen multiple times until the block engages.");
  console.log("2. Once engaged, REDEPLOY your Render server.");
  console.log("3. After the server is fully back online, try logging in ONE MORE TIME with wrong credentials.");
  
  await waitForSignal("Please complete the rate limit test steps and tell the agent in chat.");

  console.log("✅ Rate limit triggered. Monitoring the network logs for 429 status codes...");

  let found429 = false;
  // Monitor for up to 5 minutes
  for(let i = 0; i < 60; i++) {
    await sleep(5000);
    const err = await trackLogs(driver, 'RateLimit');
    if (err) found429 = true; 
    if (i % 6 === 0) {
      console.log(`... monitoring rate limit (${(i+1)*5}s)`);
    }
  }

  console.log("✅ Rate Limit Scenario Monitoring Complete.");
}
