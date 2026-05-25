describe('Support & Grievances Suite', () => {
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

  it('Player creates a ticket and Agent claims it', async () => {
    // Player logs in
    await element(by.id('login.phone')).typeText('8888888888');
    await element(by.id('login.submit')).tap();
    await element(by.id('login.otp')).typeText('123456');
    
    // Create Ticket
    await element(by.id('nav.profile')).tap();
    await element(by.text('Help & Support')).tap();
    await element(by.text('New Ticket')).tap();
    
    await element(by.text('Subject')).typeText('Payment failed');
    await element(by.text('Description')).typeText('I paid but wallet not updated.');
    await element(by.id('support.ticket.submit')).tap();
    
    await expect(element(by.text('Ticket Submitted Successfully'))).toBeVisible();

    // Agent logs in
    await device.reloadReactNative();
    await device.disableSynchronization();
    await element(by.id('login.phone')).typeText('admin_phone'); // Assumed agent number
    await element(by.id('login.submit')).tap();
    await element(by.id('login.otp')).typeText('123456');

    // Agent claims ticket
    await element(by.text('Support Portal')).tap();
    await element(by.text('Unassigned')).tap();
    await element(by.text('Payment failed')).tap();
    
    // Assuming there is a "Claim Ticket" button with test ID 'support.agent.claim'
    await element(by.id('support.agent.claim')).tap();
    await expect(element(by.text('Ticket Claimed'))).toBeVisible();
    
    // Agent sends a message
    await element(by.id('support.chat.input')).typeText('We are looking into this.');
    await element(by.id('support.chat.send')).tap();
    
    // Agent resolves
    await element(by.text('Resolve Ticket')).tap();
    await expect(element(by.text('Ticket marked as Resolved'))).toBeVisible();
  });
});
