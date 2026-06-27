import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'components', 'admin', 'AdminSupportTeamPanel.js');
let src = fs.readFileSync(file, 'utf8');
const lines = src.split('\n');

// Extract Modals by exact line numbers
const drillDownContent = lines.slice(1120, 1200).join('\n'); // 1121-1200
const attendanceContent = lines.slice(1201, 1777).join('\n'); // 1202-1777
const actionsContent = lines.slice(1778, 2135).join('\n'); // 1779-2135
const managerSelectContent = lines.slice(2136, 2236).join('\n'); // 2137-2236
const activityContent = lines.slice(2237, 2276).join('\n'); // 2238-2276

// 1. DrillDownModal
const drillDownJs = `import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "../AdminSupportTeamPanel.styles";

export const DrillDownModal = (props) => {
  const { drillDownConfig, setDrillDownConfig, analytics, fetchTeamAnalytics, onOpenTicket, players } = props;
  
  if (!drillDownConfig) return null;
  return (
${drillDownContent}
  );
};
`;
fs.writeFileSync(path.join(process.cwd(), 'components', 'admin', 'support', 'DrillDownModal.js'), drillDownJs);

// 2. AttendanceModal
const attendanceJs = `import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import PureJSDateTimePicker from '../../PureJSDateTimePicker';
import styles from "../AdminSupportTeamPanel.styles";

export const AttendanceModal = (props) => {
  const {
    showAttendanceModal, setShowAttendanceModal, attendanceData, selectedAgentId, isLoadingAttendance,
    fetchAttendance, attendanceRangeMode, attendanceDateFilter, attendanceEndDateFilter,
    getLocalDateString, selectedAgent, calendarMonth, setCalendarMonth, attendanceCalendarMode,
    setAttendanceCalendarMode, selectedLeaveDate, setSelectedLeaveDate, setAttendanceRangeMode,
    setShowDatePicker, setShowEndDatePicker, showDatePicker, showEndDatePicker,
    setAttendanceDateFilter, setAttendanceEndDateFilter
  } = props;
  
  return (
${attendanceContent}
  );
};
`;
fs.writeFileSync(path.join(process.cwd(), 'components', 'admin', 'support', 'AttendanceModal.js'), attendanceJs);

// 3. ActionsModal
const actionsJs = `import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "../AdminSupportTeamPanel.styles";

export const ActionsModal = (props) => {
  const {
    showActionsModal, setShowActionsModal, selectedAgent, isisSelectedTerminated, SUPPORT_HIERARCHY,
    pendingRoleChange, setPendingRoleChange, showRoleConfirmModal, setShowRoleConfirmModal,
    roleChangeComment, setRoleChangeComment, updateUserStatus, isManaging,
    handleForceReset, setShowManagerSelect, showDialog, reportCounts, handleTransferTickets,
    availableTeamLeads, activeAgents
  } = props;
  
  return (
${actionsContent}
  );
};
`;
fs.writeFileSync(path.join(process.cwd(), 'components', 'admin', 'support', 'ActionsModal.js'), actionsJs);

// 4. ManagerSelectModal
const managerSelectJs = `import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "../AdminSupportTeamPanel.styles";

export const ManagerSelectModal = (props) => {
  const {
    showManagerSelect, setShowManagerSelect, selectedAgent, availableManagers, availableTeamLeads,
    handleAssignHierarchy, isAssigningManager, reportCounts
  } = props;
  
  return (
${managerSelectContent}
  );
};
`;
fs.writeFileSync(path.join(process.cwd(), 'components', 'admin', 'support', 'ManagerSelectModal.js'), managerSelectJs);

// 5. ActivityModal
const activityJs = `import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "../AdminSupportTeamPanel.styles";

export const ActivityModal = (props) => {
  const {
    showActivityModal, setShowActivityModal, selectedSessionForActivity, sessionActivities, formatDuration
  } = props;
  
  return (
${activityContent}
  );
};
`;
fs.writeFileSync(path.join(process.cwd(), 'components', 'admin', 'support', 'ActivityModal.js'), activityJs);

// Modify original file

// Delete the blocks and replace with component references
lines.splice(2237, 39, 
  `      <ActivityModal {...{ showActivityModal, setShowActivityModal, selectedSessionForActivity, sessionActivities, formatDuration }} />`
);
lines.splice(2136, 100, 
  `      <ManagerSelectModal {...{ showManagerSelect, setShowManagerSelect, selectedAgent, availableManagers, availableTeamLeads, handleAssignHierarchy, isAssigningManager, reportCounts }} />`
);
lines.splice(1778, 357, 
  `      <ActionsModal {...{ showActionsModal, setShowActionsModal, selectedAgent, isSelectedTerminated: (selectedAgent?.supportStatus === 'terminated' || selectedAgent?.supportStatus === 'inactive' || selectedAgent?.supportLevel === 'EX-EMPLOYEE'), SUPPORT_HIERARCHY, pendingRoleChange, setPendingRoleChange, showRoleConfirmModal, setShowRoleConfirmModal, roleChangeComment, setRoleChangeComment, updateUserStatus, isManaging, handleForceReset, setShowManagerSelect, showDialog, reportCounts, handleTransferTickets, availableTeamLeads, activeAgents }} />`
);
lines.splice(1201, 576, 
  `      <AttendanceModal {...{ showAttendanceModal, setShowAttendanceModal, attendanceData, selectedAgentId, isLoadingAttendance, fetchAttendance, attendanceRangeMode, attendanceDateFilter, attendanceEndDateFilter, getLocalDateString, selectedAgent, calendarMonth, setCalendarMonth, attendanceCalendarMode, setAttendanceCalendarMode, selectedLeaveDate, setSelectedLeaveDate, setAttendanceRangeMode, setShowDatePicker, setShowEndDatePicker, showDatePicker, showEndDatePicker, setAttendanceDateFilter, setAttendanceEndDateFilter }} />`
);
lines.splice(1120, 80, 
  `      <DrillDownModal {...{ drillDownConfig, setDrillDownConfig, analytics, fetchTeamAnalytics, onOpenTicket, players }} />`
);

let newSrc = lines.join('\n');
newSrc = newSrc.replace("import AceDialog from '../AceDialog';", 
`import AceDialog from '../AceDialog';
import { DrillDownModal } from './support/DrillDownModal';
import { AttendanceModal } from './support/AttendanceModal';
import { ActionsModal } from './support/ActionsModal';
import { ManagerSelectModal } from './support/ManagerSelectModal';
import { ActivityModal } from './support/ActivityModal';`
);

fs.writeFileSync(file, newSrc);
console.log("AdminSupportTeamPanel refactor complete!");
