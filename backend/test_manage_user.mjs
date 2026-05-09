import fetch from 'node-fetch';

async function test() {
  const res = await fetch('http://localhost:10000/api/support/manage-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'admin',
      'x-ace-api-key': 'AceTrack_Client_v2_Production' // Based on user rules
    },
    body: JSON.stringify({
      targetUserId: 'admin', // Or any player ID if known
      status: null,
      level: 'Manager'
    })
  });
  console.log(res.status);
  console.log(await res.text());
}
test();
