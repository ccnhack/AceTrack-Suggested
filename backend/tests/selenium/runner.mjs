import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { runAdminScenario } from './admin.test.mjs';
import { runSupportScenario } from './support.test.mjs';
import { runLiveSyncScenario } from './live_sync.test.mjs';
import { runOccSyncScenario } from './occ_sync.test.mjs';
import { runRateLimitScenario } from './rate_limit.test.mjs';
import { runInviteScenario } from './invite.test.mjs';
import { createDriver } from './utils.mjs';

const TARGET_URL = 'https://acetrack-suggested.onrender.com';

(async function runAllTests() {
  console.log("🚀 Starting Selenium E2E Test Suite...");
  console.log(`🌐 Target Environment: ${TARGET_URL}`);
  
  let driver;
  try {
    driver = await createDriver();
  } catch (e) {
    console.error("❌ Failed to launch Chrome. Please ensure Google Chrome is installed on your system.");
    console.error(e.message);
    process.exit(1);
  }

  try {
    console.log("\n==========================================");
    console.log("🧪 PHASE 1: Login Validations");
    console.log("==========================================");
    
    // Original scenarios
    await runAdminScenario(driver, TARGET_URL);
    await driver.manage().deleteAllCookies();
    await runSupportScenario(driver, TARGET_URL);
    await driver.manage().deleteAllCookies();

    // New advanced scenarios
    await runOccSyncScenario(driver, TARGET_URL);
    await driver.manage().deleteAllCookies();

    await runLiveSyncScenario(driver, TARGET_URL);
    await driver.manage().deleteAllCookies();

    await runInviteScenario(driver, TARGET_URL);
    await driver.manage().deleteAllCookies();

    await runRateLimitScenario(driver, TARGET_URL);

    console.log("\n🎉 All Selenium test scenarios completed successfully.");
  } catch (err) {
    console.error("\n❌ Test Suite Failed:", err);
  } finally {
    console.log("\n🛑 Closing browser in 10 seconds...");
    setTimeout(async () => {
      if (driver) await driver.quit();
      process.exit(0);
    }, 10000);
  }
})();
