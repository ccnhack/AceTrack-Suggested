describe('Matchmaking Suite', () => {
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

  it('Player A creates a request, Player B accepts it', async () => {
    // Player A logs in
    await element(by.id('login.phone')).typeText('8888888888');
    await element(by.id('login.submit')).tap();
    await element(by.id('login.otp')).typeText('123456');
    
    // Create Request
    await element(by.id('nav.matchmaking')).tap();
    await element(by.id('matchmaking.create_btn')).tap();
    await element(by.id('matchmaking.form.slots')).typeText('1');
    await element(by.id('matchmaking.form.level')).typeText('Advanced');
    await element(by.id('matchmaking.form.submit')).tap();
    
    await expect(element(by.text('Request Created'))).toBeVisible();

    // Player B logs in
    await device.reloadReactNative();
    await device.disableSynchronization();
    await element(by.id('login.phone')).typeText('7777777777');
    await element(by.id('login.submit')).tap();
    await element(by.id('login.otp')).typeText('123456');

    // Accept Request
    await element(by.id('nav.matchmaking')).tap();
    await element(by.id('matchmaking.tab.requests')).tap();
    
    // Assuming the request card has a specific testID or text we can tap
    await element(by.text('Advanced')).tap();
    await element(by.id('matchmaking.challenge.submit')).tap(); // "Accept Request"

    await expect(element(by.text('Match Confirmed!'))).toBeVisible();

    // Verify it moved to Bookings tab
    await element(by.id('matchmaking.tab.bookings')).tap();
    await expect(element(by.text('Advanced'))).toBeVisible();
  });
});
