describe('Tournament Lifecycle E2E', () => {
  beforeAll(async () => {
    await device.launchApp({ 
      delete: true,
      launchArgs: { detoxPrintBusyIdleResources: 'YES' }
    });
    // Wait for auto-seeding
    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  const performLogin = async (username, password) => {
    await device.disableSynchronization();
    
    // 1. Wait for loading to finish
    await waitFor(element(by.id('app.loading.container')))
      .not.toBeVisible()
      .withTimeout(30000);

    // 1.5. Wait for offline screen to clear (if any)
    await waitFor(element(by.id('app.offline.screen')))
      .not.toBeVisible()
      .withTimeout(15000);

    // 1.6. Unified Search for Entrance (Landing or Login)
    let isOnLoginScreen = false;
    try {
      await waitFor(element(by.id('app.landing.screen')))
        .toExist()
        .withTimeout(10000);
      console.log('🧪 [TEST_DEBUG] Found Landing Screen');
    } catch (e) {
      console.log('🧪 [TEST_DEBUG] Landing Screen not found, checking if we are already on Login screen...');
      try {
        await waitFor(element(by.id('auth.login.username.input')))
          .toExist()
          .withTimeout(5000);
        console.log('🧪 [TEST_DEBUG] Found Login Screen directly');
        isOnLoginScreen = true;
      } catch (e2) {
        throw new Error('Could not find Landing or Login screen after initialization.');
      }
    }

    // 2. Perform Login Navigation (if on Landing)
    if (!isOnLoginScreen) {
      try {
        await element(by.id('landing.login.button')).tap();
      } catch (e) {
        console.log('🧪 [TEST_DEBUG] Landing Login button ID tap failed, trying text target...');
        await element(by.text('LOGIN')).atIndex(0).tap();
      }
    }
    await device.enableSynchronization();
    
    await element(by.id('auth.login.username.input')).replaceText(username);
    await element(by.id('auth.login.password.input')).replaceText(password);
    await element(by.id('auth.login.password.input')).tapReturnKey();
    await element(by.id('auth.login.submit.button')).tap().catch(() => {});
    
    // 3. Wait for navigation to complete (Root Tab Bar)
    // Academy users land on Academy tab, others on Explore
    await device.enableSynchronization();
    await waitFor(element(by.id('nav.tab.Profile')))
      .toBeVisible()
      .withTimeout(20000);
  };

  const performLogout = async () => {
    // 🛡️ v2.6.94: Disable synchronization to bypass background timers (SyncManager, MatchCard timers)
    await device.disableSynchronization();

    // Dismiss any stray alerts/modals first
    try { await element(by.text('OK')).tap(); } catch (e) {}
    try { await element(by.text('Close')).tap(); } catch (e) {}
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Navigate to Profile tab (wait for any fading overlays/modals to close)
    await waitFor(element(by.id('nav.tab.Profile')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.id('nav.tab.Profile')).tap();
    
    // Wait for the profile scrollview to actually render
    await waitFor(element(by.id('profile.scrollview')))
      .toBeVisible()
      .withTimeout(10000);
    
    // Try to find logout button — scroll if needed
    try {
      await waitFor(element(by.id('profile.logout.button')))
        .toBeVisible()
        .withTimeout(2000);
    } catch (e) {
      // Not visible yet, scroll down
      await element(by.id('profile.scrollview')).scroll(800, 'down');
      await waitFor(element(by.id('profile.logout.button')))
        .toBeVisible()
        .withTimeout(3000);
    }
      
    await element(by.id('profile.logout.button')).tap();
    
    // Wait for landing screen to confirm logout
    await waitFor(element(by.id('app.landing.screen')))
      .toExist()
      .withTimeout(15000);

    // Give system time to settle post-logout
    await new Promise(resolve => setTimeout(resolve, 1000));
    await device.enableSynchronization();
  };

  it('Phase 1: Academy creates a tournament', async () => {
    // Login as academy
    await performLogin('testingacademy', 'password');

    // Navigate to Academy Hub
    await waitFor(element(by.id('tab.academy')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.id('tab.academy')).tap();

    // Wait for Academy Hub Create Button
    await waitFor(element(by.id('academy.createTournament.btn')))
      .toBeVisible()
      .withTimeout(15000);

    // Create tournament
    await element(by.id('academy.createTournament.btn')).tap();
    
    // Form Fill
    await element(by.id('academy.form.title')).replaceText('Detox E2E Championship');
    await element(by.id('academy.form.title')).tapReturnKey();

    await element(by.id('academy.form.fee')).replaceText('500');
    await element(by.id('academy.form.fee')).tapReturnKey();

    await element(by.id('academy.form.location')).replaceText('Detox Stadium');
    await element(by.id('academy.form.location')).tapReturnKey();

    await element(by.id('academy.form.maxPlayers')).replaceText('16');
    await element(by.id('academy.form.maxPlayers')).tapReturnKey();
    
    // Tap date button to inject mocked date
    await waitFor(element(by.id('academy.form.dateBtn'))).toBeVisible().whileElement(by.type('android.widget.ScrollView')).scroll(200, 'down');
    await element(by.id('academy.form.dateBtn')).tap();
    
    // Choose Platform Coach
    await waitFor(element(by.id('academy.form.coachPlatformBtn')))
      .toBeVisible()
      .whileElement(by.type('android.widget.ScrollView'))
      .scroll(500, 'down');
    await element(by.id('academy.form.coachPlatformBtn')).tap();

    // Submit
    await waitFor(element(by.id('academy.form.submitBtn')))
      .toBeVisible()
      .whileElement(by.type('android.widget.ScrollView'))
      .scroll(200, 'down');
    await element(by.id('academy.form.submitBtn')).tap();

    // Verify it appears in the list
    await waitFor(element(by.text('Detox E2E Championship')))
      .toExist()
      .withTimeout(5000);

    await performLogout();
  });

  it('Phase 2: Individual registers for the tournament', async () => {
    // Login as Individual
    await performLogin('testindividual', 'password');

    // Wait for Explore Hub
    await waitFor(element(by.id('nav.tab.Explore')))
      .toBeVisible()
      .withTimeout(15000);

    // Provide some time for Explore to load cards
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Scroll and look for the created tournament
    // Note: Since we don't have the generated ID, we look by text
    await waitFor(element(by.text('Detox E2E Championship')).atIndex(0))
      .toBeVisible()
      .whileElement(by.type('android.widget.ScrollView'))
      .scroll(500, 'down');

    // Tap to open modal
    await element(by.text('Detox E2E Championship')).atIndex(0).tap();

    // Register - Opens Payment Modal
    await waitFor(element(by.id('tournament.detail.actionBtn')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('tournament.detail.actionBtn')).tap();
    
    // Payment Modal - Pay with Wallet
    await waitFor(element(by.id('explore.payment.payBtn')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('explore.payment.payBtn')).tap();

    // Dismiss Success Alert
    await new Promise(resolve => setTimeout(resolve, 1000));
    await waitFor(element(by.text('OK')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.text('OK')).tap();
    
    // Now logout
    await performLogout();
  });
  it('Phase 3: Academy verifies roster and adds players', async () => {
    // 1. Login as Academy
    await performLogin('testingacademy', 'password');

    // 🛡️ CRITICAL: Disable Detox synchronization for Academy Hub navigation in Phase 3.
    // By this stage, SyncManager has accumulated WebSocket connections and pending timers
    // from the previous logout/login cycle which permanently block Detox's idle detection.
    await device.disableSynchronization();

    // 2. Navigate to Academy Hub
    await waitFor(element(by.id('tab.academy')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.id('tab.academy')).tap();

    // Give Academy Hub time to fully render and hydrate tournament list
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 3. Find our tournament card using testID
    try {
      await waitFor(element(by.id('academy.tournament.card.0')))
        .toExist()
        .withTimeout(10000);
      console.log('🧪 [TEST_DEBUG] Tournament card found via testID');
    } catch (err) {
      console.log('🧪 [TEST_DEBUG] Card testID not found. Trying by.text fallback...');
      try {
        await waitFor(element(by.text('Detox E2E Championship')).atIndex(0))
          .toExist()
          .withTimeout(5000);
        console.log('🧪 [TEST_DEBUG] Tournament card found via text fallback');
      } catch (err2) {
        console.log('🧪 [TEST_DEBUG] Both matchers failed. Dumping debug metrics...');
        try {
          await expect(element(by.id('academy.debug.metrics'))).toHaveText('FORCED_DUMP');
        } catch (dumpErr) {
          throw dumpErr;
        }
      }
    }

    // 6. Tap Manage Roster button (it's in the first card, already on screen)
    await waitFor(element(by.text('Manage Roster')).atIndex(0))
      .toExist()
      .withTimeout(5000);
      
    try {
      await element(by.id('academy.scrollview')).scrollTo('bottom');
    } catch(e) {}
    
    await element(by.text('Manage Roster')).atIndex(0).tap();

    // 7. Verify "Test Individual" is in the roster
    await waitFor(element(by.text('Test Individual')))
      .toBeVisible()
      .withTimeout(5000);
    
    // 8. Add a player manually (Test Player Two)
    await element(by.id('participants.addPlayer.toggle')).tap();
    
    // Re-enable sync for reliable keyboard interaction
    await device.enableSynchronization();
    
    await element(by.id('participants.addPlayer.phoneInput')).tap();
    await element(by.id('participants.addPlayer.phoneInput')).clearText();
    // Using replaceText + small typeText to ensure onChangeText fires
    await element(by.id('participants.addPlayer.phoneInput')).replaceText('+91 900000000');
    await element(by.id('participants.addPlayer.phoneInput')).typeText('4');
    await element(by.id('participants.addPlayer.phoneInput')).tapReturnKey();
    
    // Disable sync again for the waitFor polling
    await device.disableSynchronization();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Wait for "Player Found" indicator
    await waitFor(element(by.id('participants.addPlayer.foundText')))
      .toExist()
      .withTimeout(8000);
    // Submit
    await element(by.id('participants.addPlayer.submitBtn')).tap();
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 9. Verify "Test Player Two" is now in the roster
    await waitFor(element(by.text('Test Player Two')).atIndex(0))
      .toExist()
      .withTimeout(8000);
    
    // Re-enable sync for clean teardown
    await device.enableSynchronization();
  });

  it('Phase 4: Player logs in and pays pending registration', async () => {
    // 0. Close the open modal from Phase 3
    try {
      await element(by.id('participants.modal.close')).tap();
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch(e) {}

    // 1. Logout Academy
    await performLogout();

    // 2. Login as Test Player Two
    await performLogin('testindividual2', 'password');

    // 🛡️ v2.6.93: Must disable sync BEFORE any navigation. SyncManager's WebSocket
    // and ConnectivityService timers will block Detox's idle detection indefinitely.
    await device.disableSynchronization();

    // 3. Navigate to Matches Tab
    await waitFor(element(by.id('tab.matches')))
      .toBeVisible()
      .withTimeout(15000);
    await element(by.id('tab.matches')).tap();

    // Give the FlatList time to hydrate from AsyncStorage
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 4. Find the "Detox E2E Championship" tournament card
    // 🛡️ v2.6.94: Logcat confirms data IS present. Using robust testID rather than brittle uppercase-transformed by.text()
    await waitFor(element(by.id('match.card.Detox E2E Championship')))
      .toExist()
      .withTimeout(15000);
    console.log('🧪 [TEST_DEBUG] Championship card found in Matches tab');


    // 5. Verify Pending Payment state exists on the card
    await waitFor(element(by.id('match.card.payBtn.Detox E2E Championship')))
      .toExist()
      .withTimeout(5000);
    
    // 6. Trigger Payment
    console.log('🧪 [TEST_DEBUG] Tapping Pay Now on card...');
    // Reactivate sync briefly to handle the transition to the modal
    await device.enableSynchronization();
    await element(by.id('match.card.payBtn.Detox E2E Championship')).tap();

    // 🛡️ v2.6.94: Confirm modal appeared
    console.log('🧪 [TEST_DEBUG] Waiting for Payment Modal...');
    await waitFor(element(by.id('matches.payment.modalContent')))
      .toBeVisible()
      .withTimeout(5000);
    console.log('🧪 [TEST_DEBUG] Payment Modal content is visible');

    // 7. Complete Payment via UPI (resilient to zero balance)
    console.log('🧪 [TEST_DEBUG] Tapping Pay with UPI...');
    await waitFor(element(by.id('matches.payment.upiBtn')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('matches.payment.upiBtn')).tap();
    console.log('🧪 [TEST_DEBUG] Tapped Pay with UPI');

    // 8. Payment completed - modal hides automatically (native alert bypassed in __DEV__)
    console.log('🧪 [TEST_DEBUG] Waiting for Modal to dismiss...');
    // Disable sync again to avoid hanging on background timers post-payment
    await device.disableSynchronization();
    await waitFor(element(by.id('matches.payment.modalContent')))
      .not.toBeVisible()
      .withTimeout(5000);
    console.log('🧪 [TEST_DEBUG] Modal dismissed successfully');

    // 9. Verify state shift (The Pay Now button should no longer exist)
    console.log('🧪 [TEST_DEBUG] Verifying Pay Now button is gone...');
    await expect(element(by.id('match.card.payBtn.Detox E2E Championship'))).not.toExist();
    console.log('🧪 [TEST_DEBUG] State shift verified');

    // Now logout
    console.log('🧪 [TEST_DEBUG] Starting performLogout...');
    await performLogout();
    console.log('🧪 [TEST_DEBUG] Phase 4 Complete!');
 
  });
});
