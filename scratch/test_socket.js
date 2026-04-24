
const { io } = require('socket.io-client');
const socket = io('http://localhost:10000', {
  auth: {
    token: 'AceTrack_Client_v2_Production'
  },
  extraHeaders: {
    'x-ace-api-key': 'QnQdpSDrLodmhJoctmv89cQeTcjWn0Vp+pBpUE0bcY8='
  }
});

socket.on('connect', () => {
  console.log('✅ Socket connected successfully!');
  process.exit(0);
});

socket.on('connect_error', (err) => {
  console.error('❌ Socket connection failed:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log('⌛ Socket connection timed out');
  process.exit(1);
}, 5000);
