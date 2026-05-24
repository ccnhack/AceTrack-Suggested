const prevTickets = [
  {
    id: "2899313",
    status: "In Progress",
    messages: []
  }
];

const ticketId = "2899313";
const newStatus = "Closed";
const summary = undefined;
const justification = undefined;

const updated = (prevTickets || []).map(t => {
  if (t && t.id === ticketId) {
    const oldStatus = t.status || 'Open';
    const patch = { status: newStatus, updatedAt: new Date().toISOString() };
    if (summary) patch.closureSummary = summary;
    
    const activeStates = ['Open', 'In Progress', 'Awaiting Response'];
    if (activeStates.includes(newStatus)) {
      if (oldStatus === 'Resolved' || oldStatus === 'Closed') {
        patch.closureSummary = null;
        patch.closedAt = null;
      }
    } else if (newStatus === 'Resolved' || newStatus === 'Closed') {
      patch.closedAt = new Date().toISOString();
    }

    const messages = [...(t.messages || [])];
    const eventMsg = {
      id: `system-${Date.now()}`,
      senderId: 'system',
      text: `-------- ${newStatus.toUpperCase()} WAS ${oldStatus.toUpperCase()} --------`,
      type: 'event'
    };
    messages.push(eventMsg);
    patch.messages = messages;
    return { ...t, ...patch };
  }
  return t;
});

console.log(JSON.stringify(updated, null, 2));
