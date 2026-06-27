import fs from 'fs';

function updateFile(file, replacements) {
    let content = fs.readFileSync(file, 'utf-8');
    for (const [search, replace] of replacements) {
        content = content.replace(search, replace);
    }
    fs.writeFileSync(file, content);
}

// 1. ActivityModal
updateFile('components/admin/AdminSupportTeamPanel.js', [
    ['<ActivityModal {...{ showActivityModal, setShowActivityModal, selectedSessionForActivity, sessionActivities, formatDuration }} />',
     '<ActivityModal {...{ showActivityModal, setShowActivityModal, selectedSessionForActivity, sessionActivities, formatDuration, selectedAgentStats }} />']
]);

// 2. ActionsModal
const actionsModalProps = `showActionsModal, setShowActionsModal, selectedAgent, isSelectedTerminated, SUPPORT_HIERARCHY, pendingRoleChange, setPendingRoleChange, showRoleConfirmModal, setShowRoleConfirmModal, roleChangeComment, setRoleChangeComment, updateUserStatus, isManaging, handleForceReset, setShowManagerSelect, showDialog, reportCounts, handleTransferTickets, availableTeamLeads, activeAgents, setEditShiftStart, setEditShiftEnd, allSupportAgents, availableManagers, managerSearch, setManagerSearch, handleAssignHierarchy, isAssigningManager, leadSearch, setLeadSearch, editShiftStart, editShiftEnd, isUpdatingShift, setIsUpdatingShift, storage, currentUser, config, apiFetch`;

updateFile('components/admin/AdminSupportTeamPanel.js', [
    [/<ActionsModal \{...\{ showActionsModal.*?\}\} \/>/, 
     `<ActionsModal {...{ ${actionsModalProps} }} />`]
]);

updateFile('components/admin/support/ActionsModal.js', [
    [/export const ActionsModal = \(props\) => \{[^]*?(?=\s+return \()/, 
     `export const ActionsModal = (props) => {\n  const { ${actionsModalProps} } = props;`]
]);

// 3. AttendanceModal
const attendanceProps = `showAttendanceModal, setShowAttendanceModal, selectedAgent, auditLogs, setShowActiveSessionsOnly, showActiveSessionsOnly, setSelectedSessionForActivity, selectedAgentStats`;
updateFile('components/admin/AdminSupportTeamPanel.js', [
    [/<AttendanceModal \{...\{ showAttendanceModal, setShowAttendanceModal, selectedAgent \} \} \/>/,
     `<AttendanceModal {...{ ${attendanceProps} }} />`]
]);
updateFile('components/admin/support/AttendanceModal.js', [
    [/export const AttendanceModal = \(props\) => \{[^]*?(?=\s+const)/,
     `export const AttendanceModal = (props) => {\n  const { ${attendanceProps} } = props;\n`]
]);

// 4. ManagerSelectModal
const managerSelectProps = `showManagerSelect, setShowManagerSelect, selectedAgent, availableManagers, availableTeamLeads, handleAssignHierarchy, isAssigningManager, reportCounts, showRoleConfirmModal, setShowRoleConfirmModal, setPendingRoleChange, pendingRoleChange, roleChangeComment, setRoleChangeComment, updateUserStatus`;
updateFile('components/admin/AdminSupportTeamPanel.js', [
    [/<ManagerSelectModal \{...\{ showManagerSelect, setShowManagerSelect, selectedAgent, availableManagers, availableTeamLeads, handleAssignHierarchy, isAssigningManager, reportCounts \}\} \/>/,
     `<ManagerSelectModal {...{ ${managerSelectProps} }} />`]
]);
updateFile('components/admin/support/ManagerSelectModal.js', [
    [/export const ManagerSelectModal = \(props\) => \{[^]*?(?=\s+return \()/,
     `export const ManagerSelectModal = (props) => {\n  const { ${managerSelectProps} } = props;`]
]);

// 5. TicketCreateView
const ticketCreateProps = `onCreateTicket, isCreating, categories, departments, user, isSupport, teamDirectory, newTicket, setNewTicket, showAgentPicker, setShowAgentPicker, filterAgentId, setFilterAgentId, availableAgents`;
updateFile('components/tickets/TicketCreateView.js', [
    [/const TicketCreateView = \(props\) => \{[^]*?(?=\s+return \()/,
     `const TicketCreateView = (props) => {\n  const { ${ticketCreateProps} } = props;`]
]);
updateFile('components/SupportTicketSystem.js', [
    [/<TicketCreateView \{...\{ onCreateTicket, isCreating, categories, departments, user, isSupport, teamDirectory, newTicket, setNewTicket \}\} \/>/,
     `<TicketCreateView {...{ ${ticketCreateProps} }} />`]
]);

// 6. DetailsModal
const detailsModalProps = `showMatchDetails, setShowMatchDetails, selectedMatch, renderDate, formatVenue, handleCancelBooking`;
updateFile('screens/matchmaking/DetailsModal.js', [
    [/export const DetailsModal = \(props\) => \{[^]*?(?=\s+const)/,
     `export const DetailsModal = (props) => {\n  const { ${detailsModalProps} } = props;\n`]
]);
updateFile('screens/MatchmakingScreen.js', [
    [/<DetailsModal \{...\{ showMatchDetails, setShowMatchDetails, selectedMatch, renderDate, formatVenue \}\} \/>/,
     `<DetailsModal {...{ ${detailsModalProps} }} />`]
]);

console.log('Props updated successfully');
