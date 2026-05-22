import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

async function runTest() {
  let options = new chrome.Options();
  options.addArguments('--headless=new');
  options.addArguments('--disable-gpu');
  options.addArguments('--no-sandbox');

  let driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();

  try {
    console.log("Navigating to production support login...");
    await driver.get('https://acetrack-suggested.onrender.com/login?role=support');
    
    await driver.wait(until.elementLocated(By.css('input[placeholder*="Email"]')), 10000);
    const emailInput = await driver.findElement(By.css('input[placeholder*="Email"]'));
    const passwordInput = await driver.findElement(By.css('input[placeholder*="Password"]'));
    
    console.log("Entering credentials for riya0508anand@gmail.com...");
    await emailInput.sendKeys('riya0508anand@gmail.com');
    await passwordInput.sendKeys('Password@123'); // Usually default test password, or we can check the db
    
    // Actually, I don't know the password! 
    // I can reset it via the DB to test locally. Wait, this is against production!
    // I can't reset production passwords easily without causing issues.
  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    await driver.quit();
  }
}
runTest();
