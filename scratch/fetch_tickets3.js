fetch('https://acetrack-suggested.onrender.com/api/v1/data', {
  headers: {
    'x-ace-api-key': 'QnQdpSDrLodmhJoctmv89cQeTcjWn0Vp+pBpUE0bcY8=',
    'x-user-id': 'admin'
  }
})
  .then(res => res.json())
  .then(data => {
    const tickets = data.supportTickets || [];
    const closed = tickets.filter(t => t.status === 'Closed' && t.category === 'Payment/Refund');
    console.log(JSON.stringify(closed.map(t => ({ id: t.id, title: t.title, assignedTo: t.assignedTo, status: t.status })), null, 2));
    
    const players = data.players || [];
    const shubhank = players.find(p => p.email === 'hackerisback1717@gmail.com' || (p.name && p.name.includes('Shubhank')));
    console.log('Shubhank:', shubhank?.id, shubhank?.username, shubhank?.role);
    
    const saumya = players.find(p => p.username === 'saumya' || (p.name && p.name.includes('Saumya')));
    console.log('Saumya:', saumya?.id, saumya?.username, saumya?.role);
  })
  .catch(console.error);
