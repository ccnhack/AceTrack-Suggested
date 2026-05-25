import fetch from 'node-fetch'; // Wait, node 18 has fetch globally

const url = "https://acetrack-suggested.onrender.com/api/support/manage-user";
fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-user-id': 'admin',
    'x-ace-api-key': 'AceTrack_Client_v2_Production' // Need to get the actual key from config.js
  },
  body: JSON.stringify({ targetUserId: 'sup_mpjv2sny', status: 'suspended' })
}).then(res => {
  console.log("Status:", res.status);
  return res.text();
}).then(data => {
  console.log("Response:", data);
  process.exit(0);
}).catch(console.error);
