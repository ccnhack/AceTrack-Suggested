describe('Tournament Waitlist Promotion E2E', () => {
  const TOURNAMENT_TITLE = 'Waitlist Test E2E Sync';

  beforeAll(async () => {
    await device.launchApp({ 
      delete: true,
      launchArgs: { detoxPrintBusyIdleResources: 'YES' }
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  const performLogin = async (username, password) => {
    // Add a small delay for device readiness
    if (!device) throw new Error('Detox device is null');
    try {
      await device.disableSynchronization();
    } catch (e) {
      console.warn('Silent failure on disableSynchronization:', e.message);
    }
    await waitFor(element(by.id('app.loading.container'))).not.toBeVisible().withTimeout(20000);
    
    // Check if we are already on the dashboard
    let isDashboardVisible = false;
    try {
      await waitFor(element(by.id('nav.tab.Profile'))).toBeVisible().withTimeout(3000);
      isDashboardVisible = true;
    } catch (e) {}

    if (isDashboardVisible) {
      // Avoid logout if we are already the correct user
      let isCorrectUser = false;
      try {
        await element(by.id('nav.tab.Profile')).tap();
        await waitFor(element(by.text(username))).toBeVisible().withTimeout(2000);
        isCorrectUser = true;
      } catch (e) {
        // Not the correct user or text not found
      }

      if (!isCorrectUser) {
        await performLogout();
      } else {
        // Already logged in as correct user
        await device.enableSynchronization();
        return;
      }
    }

    let isOnLoginScreen = false;
    try {
      await waitFor(element(by.id('app.landing.screen'))).toExist().withTimeout(5000);
    } catch (e) {
      isOnLoginScreen = true;
    }

    if (!isOnLoginScreen) {
      // If we're on the landing screen, tap login
      await element(by.id('landing.login.btn')).tap().catch(async () => {
        try {
          await element(by.text('LOGIN')).atIndex(0).tap();
        } catch (e) {
          // Maybe we are already on login screen?
        }
      });
    }
    
    // Ensure we are on login screen
    await waitFor(element(by.id('auth.login.username.input'))).toBeVisible().withTimeout(5000).catch(() => {});
    
    await device.enableSynchronization();
    await element(by.id('auth.login.username.input')).clearText();
    await element(by.id('auth.login.username.input')).typeText(username);
    await element(by.id('auth.login.password.input')).clearText();
    await element(by.id('auth.login.password.input')).typeText(password);
    await element(by.id('auth.login.password.input')).tapReturnKey();
    
    try {
      await device.disableSynchronization();
      await element(by.id('auth.login.scrollview')).scroll(300, 'down');
      await device.enableSynchronization();
    } catch (e) {}
    await element(by.id('auth.login.submit.button')).tap().catch(() => {});
    
    await waitFor(element(by.id('nav.tab.Profile'))).toBeVisible().withTimeout(15000);
  };

  const performLogout = async () => {
    await device.disableSynchronization();
    try {
      await element(by.id('nav.tab.Profile')).tap();
      await new Promise(resolve => setTimeout(resolve, 1000));
      // Try to scroll multiple times if needed
      for (let i = 0; i < 2; i++) {
        try {
          await element(by.id('profile.scrollview')).scroll(400, 'down');
        } catch (e) {}
      }
      try {
        await element(by.id('profile.logout.button')).tap();
      } catch (e) {
        // Try one more scroll if tap failed
        await element(by.id('profile.scrollview')).scroll(300, 'down');
        await element(by.id('profile.logout.button')).tap();
      }
      // Wait for landing screen
      await waitFor(element(by.id('app.landing.screen'))).toExist().withTimeout(10000);
    } catch (e) {
      console.log("Logout failed or already logged out:", e.message);
      // Force reload if we are really stuck
      await device.reloadReactNative();
    }
    await device.enableSynchronization();
  };

  // Helper: scroll Explore screen to find the tournament by title
  const scrollToTournament = async (title) => {
    // The tournament should be visible on the Explore screen. Scroll down if needed.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await waitFor(element(by.text(title))).toBeVisible().withTimeout(3000);
        return; // Found it
      } catch (e) {
        // Scroll the main screen down
        await element(by.type('android.widget.ScrollView')).atIndex(0).scroll(300, 'down').catch(() => {});
      }
    }
    // Final attempt — wait for it to appear
    await waitFor(element(by.text(title))).toBeVisible().withTimeout(5000);
  };

  it('Phase 1: Academy creates a 2-slot tournament', async () => {
    await performLogin('testingacademy', 'password');
    await element(by.id('nav.tab.Academy')).tap();
    
    await waitFor(element(by.id('academy.createTournament.btn'))).toBeVisible().withTimeout(5000);
    await element(by.id('academy.createTournament.btn')).tap();
    
    // Use autofill to populate all fields (including coach assignment and date)
    await waitFor(element(by.id('academy.form.autofillBtn'))).toBeVisible().withTimeout(5000);
    await element(by.id('academy.form.autofillBtn')).tap();
    
    // Override title and max players for our test scenario
    await element(by.id('academy.form.title')).replaceText(TOURNAMENT_TITLE);
    await element(by.id('academy.form.maxPlayers')).replaceText('2');
    
    // Scroll to submit button and tap
    await element(by.id('academy.form.scrollview')).scroll(1500, 'down');
    await element(by.id('academy.form.submitBtn')).tap();
    await waitFor(element(by.text(TOURNAMENT_TITLE))).toExist().withTimeout(15000);
    await performLogout();
  });

  it('Phase 2 & 3: Two players register to fill slots', async () => {
    const players = ['testindividual', 'testindividual2'];
    for (const player of players) {
      await performLogin(player, 'password');
      await element(by.id('nav.tab.Explore')).tap();
      
      // Scroll to find the tournament
      await scrollToTournament(TOURNAMENT_TITLE);
      await element(by.text(TOURNAMENT_TITLE)).atIndex(0).tap();
      
      // Wait for the detail modal and tap Register / Pay
      await waitFor(element(by.id('tournament.detail.actionBtn'))).toBeVisible().withTimeout(5000);
      await element(by.id('tournament.detail.actionBtn')).tap();

      // Use Pay with UPI to bypass wallet balance
      await waitFor(element(by.id('explore.payment.upiBtn'))).toBeVisible().withTimeout(5000);
      await element(by.id('explore.payment.upiBtn')).tap();
      
      // Dismiss success alert
      await waitFor(element(by.text('OK'))).toBeVisible().withTimeout(10000);
      await element(by.text('OK')).tap();
      await performLogout();
    }
  });

  it('Phase 4: Third player joins waitlist', async () => {
    await performLogin('testindividual3', 'password');
    await element(by.id('nav.tab.Explore')).tap();
    
    // Scroll to find the tournament
    await scrollToTournament(TOURNAMENT_TITLE);
    await element(by.text(TOURNAMENT_TITLE)).atIndex(0).tap();
    
    // The tournament is full — action should show "Join Waitlist"
    await waitFor(element(by.id('tournament.detail.actionBtn'))).toBeVisible().withTimeout(5000);
    await element(by.id('tournament.detail.actionBtn')).tap();
    
    // Dismiss confirmation / success alert
    await waitFor(element(by.text('OK'))).toBeVisible().withTimeout(10000);
    await element(by.text('OK')).tap();
    
    // Navigate to Matches tab and verify "Waitlisted" status
    // Navigate to Matches tab reliably
    let tapped = false;
    for (let i = 0; i < 3; i++) {
      await element(by.id('nav.tab.Matches')).tap();
      try {
        await waitFor(element(by.id('matches.screen.container'))).toBeVisible().withTimeout(3000);
        tapped = true;
        break;
      } catch (e) {
        // Retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    if (!tapped) throw new Error('Failed to navigate to Matches screen tab');

    await waitFor(element(by.id(`match.card.waitlistedBtn.${TOURNAMENT_TITLE}`))).toBeVisible().withTimeout(10000);
    
    await performLogout();
  });

  it('Phase 5 & 6: Player 1 opts out, Player 3 gets promoted', async () => {
    // 1. Player 1 Opts Out
    await performLogin('testindividual', 'password');
    await element(by.id('nav.tab.Matches')).tap();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Tap Opt-out on the first tournament card
    await waitFor(element(by.id(`match.card.optOutBtn.${TOURNAMENT_TITLE}`))).toBeVisible().withTimeout(5000);
    await element(by.id(`match.card.optOutBtn.${TOURNAMENT_TITLE}`)).tap();
    
    // Confirm the opt-out dialog
    await waitFor(element(by.text('Yes, Opt Out'))).toBeVisible().withTimeout(5000);
    await element(by.text('Yes, Opt Out')).tap();
    
    // Dismiss success dialog
    await waitFor(element(by.text('OK'))).toBeVisible().withTimeout(5000);
    await element(by.text('OK')).tap();
    
    await performLogout();

    // 2. Academy verifies roster: Player 1 (strike) and Player 3 (timer)
    await performLogin('testingacademy', 'password');
    
    // Navigate to Academy tab reliably
    // Wait for the Academy tab to actually exist (role hydration)
    await waitFor(element(by.id('nav.tab.Academy'))).toExist().withTimeout(10000);
    
    let academyTapped = false;
    for (let i = 0; i < 3; i++) {
        await element(by.id('nav.tab.Academy')).tap();
        try {
            // Wait for a unique element on the Academy screen
            await waitFor(element(by.text('Active Events'))).toBeVisible().withTimeout(5000);
            academyTapped = true;
            break;
        } catch (e) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    if (!academyTapped) throw new Error('Failed to navigate to Academy screen');
    
    // Final stabilization wait for sync data to populate
    await new Promise(resolve => setTimeout(resolve, 3000)); 
    
    await waitFor(element(by.id(`academy.tournament.manageRoster.${TOURNAMENT_TITLE}`))).toBeVisible().withTimeout(15000);
    await element(by.id(`academy.tournament.manageRoster.${TOURNAMENT_TITLE}`)).tap();
    
    // Verify Player 1 is strikethrough in roster
    await waitFor(element(by.id(`participants.player.name.strike.testindividual`))).toExist().withTimeout(5000);
    
    // Verify Player 3 has 30-min timer in roster
    await waitFor(element(by.id(`participants.player.timer.testindividual3`))).toExist().withTimeout(5000);
    
    await element(by.id('participants.modal.close')).tap();
    await performLogout();

    // 3. Player 3 (testindividual3) verifies promotion and Timer
    await performLogin('testindividual3', 'password');
    await element(by.id('nav.tab.Matches')).tap();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Verify status changed to Pending Payment and Timer is visible
    await waitFor(element(by.id(`match.card.payBtn.${TOURNAMENT_TITLE}`))).toBeVisible().withTimeout(15000);
    await waitFor(element(by.id('match.card.timer'))).toBeVisible().withTimeout(5000);
    
    // Complete payment
    await element(by.id(`match.card.payBtn.${TOURNAMENT_TITLE}`)).tap();
    await waitFor(element(by.id('matches.payment.upiBtn'))).toBeVisible().withTimeout(10000);
    await element(by.id('matches.payment.upiBtn')).tap();
    
    // Dismiss success alert
    await waitFor(element(by.text('OK'))).toBeVisible().withTimeout(10000);
    await element(by.text('OK')).tap();
    
    // Verify confirmed status
    await waitFor(element(by.text('Confirmed'))).toBeVisible().withTimeout(10000);
  });
});
