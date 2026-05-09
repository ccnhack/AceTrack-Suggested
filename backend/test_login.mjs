import fetch from 'node-fetch';

async function test() {
  const res = await fetch('https://acetrack-suggested.onrender.com/api/support/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ace-api-key': 'AceTrack_Client_v2_Production'
    },
    body: JSON.stringify({
      identifier: 'shush',
      password: 'test' // the password doesn't matter, we want to see if it finds the user
    })
  });
  console.log(res.status);
  console.log(await res.text());
}
test();
