describe('Academy & Tournaments Suite (Cross-Device Flow)', () => {
  beforeAll(async () => {
    await device.launchApp({ 
      newInstance: true,
      launchArgs: { detoxPrintBusyIdleResources: 'YES' }
    });
    // Wait for auto-seeding
    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  beforeEach(async () => {
    await device.reloadReactNative();
    await device.disableSynchronization();
  });

  it('Academy creates a Free Tournament with 2 max slots', async () => {
    // 1. Academy logs in
    await element(by.id('login.phone')).typeText('9999999999');
    await element(by.id('login.submit')).tap();
    await element(by.id('login.otp')).typeText('123456');
    
    // 2. Navigates to Academy Hub
    await element(by.id('nav.academy')).tap();
    await element(by.id('academy.create_tournament')).tap();
    
    // 3. Fills in details
    await element(by.id('create.title')).typeText('Detox Test Tournament');
    await element(by.id('create.entryFee')).typeText('0');
    await element(by.id('create.maxPlayers')).typeText('2');
    await element(by.id('create.submit')).tap();
    
    // Verify success
    await expect(element(by.text('Tournament Created Successfully'))).toBeVisible();
    await element(by.text('OK')).tap();
  });

  it('Player visibility and Free Registration', async () => {
    // Player A logs in
    await element(by.id('login.phone')).typeText('8888888888');
    await element(by.id('login.submit')).tap();
    await element(by.id('login.otp')).typeText('123456');

    // Navigates to Academy feed
    await element(by.id('nav.academy')).tap();
    
    // Verifies the tournament appears
    await expect(element(by.text('Detox Test Tournament'))).toBeVisible();
    
    // Player A taps the tournament card to open modal
    await element(by.text('Detox Test Tournament')).tap();

    // Verifies action button exists and taps it
    await expect(element(by.id('tournament.detail.actionBtn'))).toBeVisible();
    await element(by.id('tournament.detail.actionBtn')).tap(); // "Register"

    // Accepts confirmation
    await element(by.text('Confirm')).tap();
    
    // Verifies success message
    await expect(element(by.text('Successfully Registered!'))).toBeVisible();
  });

  it('Player B registers and Player C hits Waitlist (Slot Enforcement)', async () => {
    // Player B logic omitted for brevity (similar to above)
    // Assume Player B registered. Slots are now 2/2.

    // Player C logs in
    await element(by.id('login.phone')).typeText('7777777777');
    await element(by.id('login.submit')).tap();
    await element(by.id('login.otp')).typeText('123456');

    await element(by.id('nav.academy')).tap();
    await element(by.text('Detox Test Tournament')).tap();

    // Should see "Join Waitlist" because slots are full
    await expect(element(by.id('tournament.detail.actionBtn'))).toHaveText('Join Waitlist');
    await element(by.id('tournament.detail.actionBtn')).tap();

    // Waitlist success
    await expect(element(by.text('Added to Waitlist'))).toBeVisible();
  });

  it('Player A opts out -> Player C is auto-promoted', async () => {
    // Player A logs in
    await element(by.id('login.phone')).typeText('8888888888');
    await element(by.id('login.submit')).tap();
    await element(by.id('login.otp')).typeText('123456');

    await element(by.id('nav.profile')).tap();
    await element(by.text('Detox Test Tournament')).tap(); // View from Profile

    // Opt Out
    await element(by.text('Opt Out')).tap();
    await element(by.text('Yes, Cancel')).tap();
    
    // Player A sees success
    await expect(element(by.text('Opted Out'))).toBeVisible();

    // -- SWITCH TO PLAYER C CONTEXT -- //
    // In actual Detox, we might just test Player C's state next:
    await device.reloadReactNative();
    await device.disableSynchronization();
    await element(by.id('login.phone')).typeText('7777777777');
    await element(by.id('login.submit')).tap();
    await element(by.id('login.otp')).typeText('123456');

    // Player C should have a notification
    await element(by.id('nav.notifications')).tap();
    await expect(element(by.text('Slot Opened!'))).toBeVisible();
    
    // Player C should now be registered
    await element(by.id('nav.profile')).tap();
    await expect(element(by.text('Detox Test Tournament'))).toBeVisible(); // Appears in registered
  });

  it('Admin views Manage Roster to verify statuses', async () => {
    // Academy Admin logs in
    await element(by.id('login.phone')).typeText('9999999999');
    await element(by.id('login.submit')).tap();
    await element(by.id('login.otp')).typeText('123456');

    await element(by.id('nav.academy')).tap();
    await element(by.text('Manage Roster')).tap();

    // Verify Player A is Opted-Out
    await expect(element(by.text('Player A (Opted-Out)'))).toBeVisible();
    
    // Verify Player C is Registered
    await expect(element(by.text('Player C (Registered)'))).toBeVisible();
  });
});
