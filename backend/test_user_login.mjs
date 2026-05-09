import fetch from 'node-fetch';

async function test() {
  const res = await fetch('https://acetrack-suggested.onrender.com/api/v1/user/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ace-api-key': 'AceTrack_Client_v2_Production'
    },
    body: JSON.stringify({
      identifier: 'shush',
      password: 'wrong_password' 
    })
  });
  console.log(res.status);
  console.log(await res.text());
}
test();
