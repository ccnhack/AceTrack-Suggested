const { device } = require('detox');

beforeAll(async () => {
  await device.launchApp({
    newInstance: true,
    permissions: { notifications: 'YES', location: 'always' },
  });
});
