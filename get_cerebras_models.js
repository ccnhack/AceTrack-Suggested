import 'dotenv/config';
import https from 'https';
const req = https.request('https://api.cerebras.ai/v1/models', {
  method: 'GET',
  headers: { 'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}` }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
});
req.end();
