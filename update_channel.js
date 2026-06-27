const db = require('./services/database');
(async () => {
  const { updateSettings } = require('./services/database');
  await updateSettings({ channel_url: 'https://t.me/+mKavVHjVnuk3NDU0' });
  console.log('Channel URL updated in DB');
  process.exit(0);
})();
