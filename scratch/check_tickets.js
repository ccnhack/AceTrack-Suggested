const fs = require('fs');
fetch('https://acetrack-suggested.onrender.com/api/data', {
  headers: {
    'x-ace-api-key': 'QnQdpSDrLodmhJoctmv89cQeTcjWn0Vp+pBpUE0bcY8=',
    'x-user-id': 'admin'
  }
}).then(r => r.json()).then(data => {
  const tickets = data.supportTickets || [];
  const assigned = tickets.map(t => ({ id: t.id, status: t.status, assignedTo: t.assignedTo }));
  console.log("Total Tickets:", tickets.length);
  console.log("Assigned breakdown:", assigned.reduce((acc, t) => {
    const key = `${t.assignedTo} | ${t.status}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {}));
  
  const players = data.players || [];
  console.log("Agents:", players.filter(p => p.role === 'support' || p.role === 'admin').map(p => ({ id: p.id, username: p.username, role: p.role })));
});
