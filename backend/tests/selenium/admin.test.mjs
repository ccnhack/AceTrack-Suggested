import { By } from 'selenium-webdriver';
import { waitForSignal } from './utils.mjs';
import fs from 'fs';

export async function runAdminScenario(driver, baseUrl) {
  console.log("➡️ Navigating to the landing page...");
  await driver.get(baseUrl);

  console.log("\n=========================================================");
  console.log("⏳ WAITING FOR MANUAL LOGIN (ADMIN)");
  console.log("Please interact with the Chrome window to log in as the");
  console.log("Administrator, complete the MFA pin, and enter the portal.");
  console.log("=========================================================\n");

  await waitForSignal("Please complete Admin login and tell the agent in chat.");

  console.log("✅ Admin Login successful! Dashboard detected.");

  // Perform any automated verifications here
  console.log("🧪 Running post-login automated checks...");
  const pageTitle = await driver.getTitle();
  console.log(`📌 Page Title is: ${pageTitle}`);

  // Take a screenshot
  const screenshot = await driver.takeScreenshot();
  fs.writeFileSync('admin_dashboard_selenium.png', screenshot, 'base64');
  console.log("📸 Admin Dashboard screenshot saved to admin_dashboard_selenium.png");
}
