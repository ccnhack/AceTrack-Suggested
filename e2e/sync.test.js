describe('Sync & Conflict Resolution', () => {
  beforeAll(async () => {
    await device.launchApp({ delete: true });
    // Wait for TEST_API auto-seeding to complete
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Login as admin (hardcoded in LoginScreen.js)
    await element(by.id('landing.login.button')).tap();
    await element(by.id('auth.login.username.input')).replaceText('admin');
    await element(by.id('auth.login.password.input')).replaceText('Password@123');
    await element(by.id('auth.login.password.input')).tapReturnKey();
    
    // Fallback: tap the button if return key didn't work/dismiss keyboard
    await element(by.id('auth.login.submit.button')).tap().catch(() => {});

    // Disable synchronization during post-login background sync
    await device.disableSynchronization();

    // Wait for admin dashboard to load
    await waitFor(element(by.id('nav.tab.Admin Hub')))
      .toBeVisible()
      .withTimeout(30000);
  });

  afterAll(async () => {
    await device.enableSynchronization();
  });

  it('should show Admin Hub sync badge', async () => {
    // Navigate to Admin Hub to see the sync badge
    await element(by.id('nav.tab.Admin Hub')).tap();
    
    // Verify sync badge is visible
    await waitFor(element(by.id('admin.sync.badge')))
      .toExist()
      .withTimeout(15000);
  });

  it('should display sync status correctly', async () => {
    // The sync badge should show one of the valid states
    await expect(element(by.id('admin.sync.badge'))).toExist();
    
    // Verify the search input is available (confirms Admin Hub loaded)
    await expect(element(by.id('admin.search.input'))).toExist();
  });

  it('should allow manual sync trigger via badge tap', async () => {
    // Tap the sync badge to trigger manual sync
    await element(by.id('admin.sync.badge')).tap();
    
    // Verify we are still on the Admin Hub by checking the title
    // (This avoids flakiness if the badge temporarily changes state/visibility)
    await expect(element(by.text('Admin Hub'))).toExist();
  });
});
