describe('Authentication Flow', () => {
  beforeAll(async () => {
    await device.launchApp({ delete: true });
    // Wait for TEST_API auto-seeding to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  it('should show landing screen on first launch', async () => {
    await expect(element(by.id('landing.login.button'))).toBeVisible();
    await expect(element(by.id('landing.signup.button'))).toBeVisible();
  });

  it('should navigate to login screen', async () => {
    await element(by.id('landing.login.button')).tap();
    await expect(element(by.id('auth.login.username.input'))).toBeVisible();
  });

  it('should login successfully with admin credentials', async () => {
    // Admin login (v2.6.171: Use environment variables for CI/CD)
    const ADMIN_ID = process.env.ADMIN_ID || 'admin';
    const ADMIN_PW = process.env.ADMIN_PASSWORD || 'Password@123';
    await element(by.id('auth.login.username.input')).replaceText(ADMIN_ID);
    await element(by.id('auth.login.password.input')).replaceText(ADMIN_PW);
    await element(by.id('auth.login.password.input')).tapReturnKey();
    
    // Fallback: tap the button if return key didn't work/dismiss keyboard
    await element(by.id('auth.login.submit.button')).tap().catch(() => {});
    
    // After login, app performs background sync which can block Detox idle detection.
    // Temporarily disable synchronization to allow the UI to settle.
    await device.disableSynchronization();
    
    // Admin user sees the Admin tab after login (longer timeout for initial sync)
    await waitFor(element(by.id('nav.tab.Admin Hub')))
      .toBeVisible()
      .withTimeout(30000);
    
    await device.enableSynchronization();
  });

  it('should logout from profile screen', async () => {
    await device.disableSynchronization();
    
    await element(by.id('nav.tab.Profile')).tap();
    
    // Scroll to logout if needed
    await waitFor(element(by.id('profile.logout.button')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('profile.logout.button')).tap();
    
    // After logout, landing screen should appear again
    await waitFor(element(by.id('landing.login.button')))
      .toBeVisible()
      .withTimeout(10000);
    
    await device.enableSynchronization();
  });
});
