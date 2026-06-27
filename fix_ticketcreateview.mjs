import fs from 'fs';
let content = fs.readFileSync('components/tickets/TicketCreateView.js', 'utf-8');
content = content.replace(/const \{ onCreateTicket.*\} = props;/, 'const { setView, showTypePicker, setShowTypePicker, formData, setFormData, handleCreate, showAgentPicker, setShowAgentPicker, filterAgentId, setFilterAgentId, availableAgents, TICKET_TYPES } = props;');
fs.writeFileSync('components/tickets/TicketCreateView.js', content);
