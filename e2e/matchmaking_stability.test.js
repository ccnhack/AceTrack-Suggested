describe('Matchmaking Stability & Sync', () => {
  beforeAll(async () => {
    await device.launchApp({ delete: true });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Login
    await element(by.id('landing.login.button')).tap();
    await element(by.id('auth.login.username.input')).replaceText('testindividual');
    await element(by.id('auth.login.password.input')).replaceText('password');
    await element(by.id('auth.login.submit.button')).tap();

    await waitFor(element(by.id('nav.tab.Profile')))
      .toBeVisible()
      .withTimeout(20000);
  });

  it('should decrease unread count superscript when viewing a new request', async () => {
    // 1. Navigate to Profile to use Backdoor
    await element(by.id('nav.tab.Profile')).tap();
    await element(by.id('profile.scrollview')).scroll(1000, 'down');
    await element(by.id('test.inject.unread')).tap();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 2. Navigate to Matchmaking
    await element(by.id('nav.tab.Matchmaking')).tap();

    // Verify badge exists on Requests tab
    await waitFor(element(by.id('matchmaking.tab.requests.badge')))
      .toExist()
      .withTimeout(5000);
    
    // Tap the request card (marks as read)
    // We assume 'opponent' is the name injected by TEST_API
    await element(by.text('opponent')).atIndex(0).tap();

    // Close details
    try {
      await element(by.text('Close Details')).tap();
    } catch (e) {
      // Fallback for different text or id
    }

    // Verify badge is gone
    await expect(element(by.id('matchmaking.tab.requests.badge'))).not.toExist();
  });

  it('should clear expired requests instantly via bulk remove (Storage Deadlock Test)', async () => {
    // 1. Navigate to Profile to use Backdoor
    await element(by.id('nav.tab.Profile')).tap();
    await element(by.id('profile.scrollview')).scroll(1000, 'down');
    await element(by.id('test.inject.expired')).tap();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 2. Navigate to Matchmaking -> Expired tab
    await element(by.id('nav.tab.Matchmaking')).tap();
    await element(by.id('matchmaking.tab.Expired')).tap();

    // Verify unread badge on Expired tab
    await expect(element(by.id('matchmaking.tab.expired.badge'))).toExist();

    // Tap "Remove All"
    await element(by.id('matchmaking.expired.remove_all')).tap();

    // Confirm Alert (This taps the button in the RN Alert)
    await element(by.text('Remove All')).atIndex(0).tap();

    // VERIFY: The removals happen instantly.
    // If deadlock were present, it would hang for 15s.
    await waitFor(element(by.text('No Expired Requests Found')))
      .toBeVisible()
      .withTimeout(5000);
  });
});
