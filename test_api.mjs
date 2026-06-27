import fetch from 'node-fetch';

async function test() {
  const res = await fetch('http://localhost:10000/api/v1/support/rate-ticket', {
    method: 'POST',
    headers: { 
        'Content-Type': 'application/json',
        'x-ace-api-key': 'AceTrack_Client_v2_Production',
        'x-user-id': 'u1'
    },
    body: JSON.stringify({
      ticketId: 't1', // Assuming this ticket exists
      rating: 5,
      feedback: 'Good'
    })
  });
  const data = await res.text();
  console.log(data);
}
test();
