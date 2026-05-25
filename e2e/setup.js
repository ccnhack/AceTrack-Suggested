const { device } = require('detox');
const { execSync } = require('child_process');

beforeAll(async () => {
  // Global launchApp removed. Let individual test files handle launchApp
  // to prevent double-launching and Detox timeout conflicts.
  
  // WIPE DATA using adb to bypass Android 15 Direct Boot DevInternalSettings crash
  // caused by Detox newInstance: true (which uninstalls and reinstalls the app)
  try {
    execSync('adb -s emulator-5554 shell pm clear com.acetrack');
    console.log('🧪 [TEST_DEBUG] Wiped app data via ADB pm clear successfully');
  } catch (e) {
    console.log('🧪 [TEST_DEBUG] pm clear failed, app might not be installed yet');
  }
});
