import { Builder, logging } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

export async function createDriver() {
  const prefs = new logging.Preferences();
  prefs.setLevel(logging.Type.PERFORMANCE, logging.Level.ALL);
  prefs.setLevel(logging.Type.BROWSER, logging.Level.ALL);

  let options = new chrome.Options();
  options.addArguments('--start-maximized');
  options.setLoggingPrefs(prefs);

  return await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();
}

export async function trackLogs(driver, scenarioName) {
  let hasErrors = false;
  try {
    const browserLogs = await driver.manage().logs().get(logging.Type.BROWSER);
    browserLogs.forEach(entry => {
      if (entry.level.name === 'SEVERE') {
        console.error(`[${scenarioName} - CONSOLE] ❌ ${entry.message}`);
        hasErrors = true;
      }
    });

    const perfLogs = await driver.manage().logs().get(logging.Type.PERFORMANCE);
    perfLogs.forEach(entry => {
      try {
        const msg = JSON.parse(entry.message).message;
        if (msg.method === 'Network.responseReceived') {
          const status = msg.params.response.status;
          const url = msg.params.response.url;
          if (status >= 400 && url.includes('/api/')) {
            console.error(`[${scenarioName} - NETWORK] ❌ HTTP ${status} on ${url}`);
            hasErrors = true;
          }
        }
      } catch (e) {}
    });
  } catch(e) {}
  return hasErrors;
}

// Utility to sleep
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

import readline from 'readline';

export function waitForSignal(promptMessage) {
  return new Promise((resolve) => {
    console.log(`\n⏳ PAUSED: ${promptMessage}`);
    console.log("👉 [BACKEND AGENT]: Please type 'PROCEED' when you are done.");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.on('line', (line) => {
      if (line.trim() === 'PROCEED') {
        rl.close();
        resolve();
      }
    });
  });
}
