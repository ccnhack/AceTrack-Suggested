import puppeteer from 'puppeteer';

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3005';

(async () => {
  console.log("🚀 Starting End-to-End Automated Browser Tests...");
  console.log(`🌐 Target Environment: ${TARGET_URL}`);
  
  // Launch browser with UI visible so the user can interact
  const browser = await puppeteer.launch({ 
    headless: false, 
    defaultViewport: null,
    args: ['--start-maximized']
  });
  
  const page = await browser.newPage();
  
  try {
    console.log("➡️ Navigating to the landing page...");
    await page.goto(TARGET_URL);
    
    console.log("=========================================================");
    console.log("⏳ WAITING FOR MANUAL LOGIN");
    console.log("Please interact with the browser window to enter your");
    console.log("credentials and complete the login/MFA flow.");
    console.log("The script will wait until you successfully log in.");
    console.log("=========================================================");
    
    // Wait for an element that indicates a successful login.
    // For AceTrack, we can wait for the sidebar or header containing 'Logout' or 'Dashboard'.
    // Here we wait for an element that contains 'Logout' or is part of the protected app.
    // We set a long timeout (5 minutes) to give the user time to log in.
    await page.waitForFunction(
      () => {
        // Look for text 'Logout' or a known dashboard element
        const bodyText = document.body.innerText;
        return bodyText.includes('Logout') || bodyText.includes('Dashboard');
      },
      { timeout: 300000 } // 5 minutes
    );
    
    console.log("✅ Login successful! Protected route detected.");
    
    // =========================================================
    // 🧪 AUTOMATED SCENARIOS (POST-LOGIN)
    // =========================================================
    console.log("🧪 Executing automated post-login scenarios...");
    
    // Example: Take a screenshot of the dashboard
    await page.screenshot({ path: 'dashboard_snapshot.png' });
    console.log("📸 Dashboard snapshot saved to dashboard_snapshot.png");
    
    // You can add more automated actions here, e.g.,
    // await page.click('button.some-class');
    // await page.waitForSelector('.some-loaded-data');
    
    console.log("🎉 All automated scenarios completed successfully.");
  } catch (err) {
    console.error("❌ Test failed or timed out:", err.message);
  } finally {
    console.log("🛑 Closing browser in 10 seconds...");
    setTimeout(async () => {
      await browser.close();
      process.exit(0);
    }, 10000);
  }
})();
