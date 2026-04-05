const fetch = require('node-fetch');

async function sendPush(expoPushToken, title, body, data = {}) {
  if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken')) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ to: expoPushToken, title, body, data, sound: 'default' }),
    });
  } catch (e) {
    console.log('Push error:', e.message);
  }
}

module.exports = { sendPush };
