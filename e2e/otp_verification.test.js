/**
 * 🛡️ AceTrack OTP & Pre-Signup Verification Test Suite
 * 
 * Validates the hardened OTP simulation flow implemented in Phase 2
 * to ensure malicious signups are blocked and verification latches hold state.
 * 
 * @version 2.6.314
 */

describe('Pre-Signup OTP Verification Integrity', () => {

  const TIMEOUT = {
    LONG: 30000,
    MEDIUM: 15000,
    SHORT: 5000,
    XS: 2000,
  };

  beforeAll(async () => {
    await device.launchApp({
      delete: true,
      launchArgs: { detoxPrintBusyIdleResources: 'YES' }
    });
    // Wait for auto-seeding
    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  it('1. Navigates to Signup and validates security latch prevents unverified registration', async () => {
    await device.disableSynchronization();
    
    // Navigate to Signup
    try {
      await waitFor(element(by.id('landing.signup.button'))).toBeVisible().withTimeout(TIMEOUT.MEDIUM);
      await element(by.id('landing.signup.button')).tap();
    } catch (e) {
      await element(by.text('SIGN UP')).atIndex(0).tap();
    }

    // Enter basic info
    await element(by.placeholder('John')).replaceText('Tester');
    await element(by.placeholder('Doe')).replaceText('McTest');
    await element(by.placeholder('johndoe123')).replaceText('tester123');
    await element(by.placeholder('john@example.com')).replaceText('tester@example.com');
    await element(by.placeholder('+91 9876543210')).replaceText('+919000000123');
    await element(by.placeholder('••••••••')).replaceText('SecurePass123!');
    await element(by.placeholder('••••••••')).tapReturnKey();

    // Attempt to register BEFORE verifying OTP
    await element(by.text('Complete Registration')).tap();
    
    // The security latch should trigger an error preventing registration
    await waitFor(element(by.text('Please verify your email and phone number before registering.')))
      .toBeVisible()
      .withTimeout(TIMEOUT.SHORT);
      
    // Dismiss error
    await element(by.text('OK')).tap().catch(() => {});
  });

  it('2. Triggers Email OTP simulation and verifies code', async () => {
    // Tap the 'Verify' button next to email (assuming standard layout with 'Verify' text)
    await element(by.text('Verify')).atIndex(0).tap();
    
    // Fallback Alert appears due to TEST_API intercepting the network call
    try {
      await waitFor(element(by.text('Testing Mode'))).toBeVisible().withTimeout(TIMEOUT.SHORT);
      await element(by.text('OK')).tap();
    } catch (e) {}

    // Modal opens, enter simulated code
    await waitFor(element(by.placeholder('000000'))).toBeVisible().withTimeout(TIMEOUT.SHORT);
    await element(by.placeholder('000000')).replaceText('123456');
    await element(by.text('Verify Code')).tap();

    // Success alert
    try {
      await waitFor(element(by.text('Success!'))).toBeVisible().withTimeout(TIMEOUT.SHORT);
      await element(by.text('OK')).tap();
    } catch (e) {}
  });

  it('3. Triggers Phone OTP simulation and verifies code', async () => {
    // Tap the 'Verify' button next to phone (now index 0 because Email is verified)
    await element(by.text('Verify')).atIndex(0).tap();
    
    // Fallback Alert
    try {
      await waitFor(element(by.text('Testing Mode'))).toBeVisible().withTimeout(TIMEOUT.SHORT);
      await element(by.text('OK')).tap();
    } catch (e) {}

    // Modal opens, enter simulated code
    await waitFor(element(by.placeholder('000000'))).toBeVisible().withTimeout(TIMEOUT.SHORT);
    await element(by.placeholder('000000')).replaceText('123456');
    await element(by.text('Verify Code')).tap();

    // Success alert
    try {
      await waitFor(element(by.text('Success!'))).toBeVisible().withTimeout(TIMEOUT.SHORT);
      await element(by.text('OK')).tap();
    } catch (e) {}
  });

  it('4. Successfully registers account now that security latches are satisfied', async () => {
    // Attempt registration again
    await element(by.text('Complete Registration')).tap();
    
    // Should navigate away from signup and into the app OR show success modal
    try {
      await waitFor(element(by.text('Registration Successful'))).toBeVisible().withTimeout(TIMEOUT.SHORT);
      await element(by.text('Login Now')).tap();
    } catch (e) {
      // It might have logged in automatically
    }

    // App should be responsive and tab bar visible
    await waitFor(element(by.id('nav.tab.Profile'))).toBeVisible().withTimeout(TIMEOUT.MEDIUM);
    
    await device.enableSynchronization();
  });

});
