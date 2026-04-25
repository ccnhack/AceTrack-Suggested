fetch('https://acetrack-suggested.onrender.com/api/v1/data', {
  headers: {
    'x-ace-api-key': 'QnQdpSDrLodmhJoctmv89cQeTcjWn0Vp+pBpUE0bcY8=',
    'x-user-id': 'admin'
  }
})
  .then(res => res.json())
  .then(data => {
    const players = data.players || [];
    console.log(`Found ${players.length} players`);
    const supportUsers = players.filter(p => p.role === 'support');
    console.log('Support Users:', supportUsers.map(p => ({id: p.id, email: p.email, name: p.name, username: p.username})));
    
    const tickets = data.supportTickets || [];
    console.log(`Found ${tickets.length} tickets`);
    const myTicket = tickets.find(t => t.title && t.title.includes('Refund'));
    if (myTicket) console.log('Refund ticket:', { id: myTicket.id, assignedTo: myTicket.assignedTo });
  })
  .catch(console.error);
