import dotenv from 'dotenv';
dotenv.config();

const url = "http://127.0.0.1:10000/api/support/manage-user";
// we need an admin token or ace_api_key
fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-user-id': 'admin',
    'x-ace-api-key': 'AceTrack_Client_v2_Production'
  },
  body: JSON.stringify({ targetUserId: 'sup_mpjv2sny', status: 'suspended' })
}).then(res => {
  console.log("Status:", res.status);
  return res.json();
}).then(data => {
  console.log("Response:", data);
  process.exit(0);
}).catch(console.error);
