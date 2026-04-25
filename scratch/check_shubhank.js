import fs from 'fs';
fetch('https://acetrack-suggested.onrender.com/api/data')
  .then(res => res.json())
  .then(data => {
    const players = data.players || [];
    const shubhank = players.find(p => p.email === 'hackerisback1717@gmail.com' || p.name === 'Shubhank Shekhar');
    console.log(shubhank ? `Found Shubhank: ID=${shubhank.id}, Role=${shubhank.role}, Username=${shubhank.username}` : 'Not found');
    const saumya = players.find(p => p.username === 'saumya');
    console.log(saumya ? `Found Saumya: ID=${saumya.id}, Role=${saumya.role}` : 'Not found');
  })
  .catch(console.error);
