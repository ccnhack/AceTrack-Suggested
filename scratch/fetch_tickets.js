import fs from 'fs';
fetch('https://acetrack-suggested.onrender.com/api/v1/data', {
  headers: {
    'x-ace-api-key': 'QnQdpSDrLodmhJoctmv89cQeTcjWn0Vp+pBpUE0bcY8=' // from config.js
  }
})
  .then(res => res.json())
  .then(data => {
    const players = data.players || [];
    const shubhank = players.find(p => p.id === 'sup_do8ux1cc' || p.name.includes('Shubhank'));
    console.log('Shubhank Role:', shubhank?.role, 'Username:', shubhank?.username, 'ID:', shubhank?.id);
    
    const saumya = players.find(p => p.username === 'saumya' || p.name.includes('Saumya'));
    console.log('Saumya Role:', saumya?.role, 'Username:', saumya?.username, 'ID:', saumya?.id);
  })
  .catch(console.error);
