import { By } from 'selenium-webdriver';
import { waitForSignal } from './utils.mjs';
import fs from 'fs';

export async function runSupportScenario(driver, baseUrl) {
  console.log("\n=========================================================");
  console.log("🧪 SCENARIO 1: Login Validations (SUPPORT)");
  console.log("=========================================================");

  await driver.get(baseUrl);

  console.log("\n⏳ WAITING FOR MANUAL LOGIN (SUPPORT)");
  console.log("Please interact with the Chrome window to log in as a");
  console.log("Support Employee.");
  console.log("=========================================================\n");

  await waitForSignal("Please complete Support login and tell the agent in chat.");

  console.log("✅ Support Login successful! Portal detected.");

  const screenshot = await driver.takeScreenshot();
  fs.writeFileSync('support_portal_selenium.png', screenshot, 'base64');
  console.log("📸 Support Portal screenshot saved to support_portal_selenium.png");
}
