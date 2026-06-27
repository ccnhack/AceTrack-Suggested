import fs from 'fs';
import path from 'path';

const panelPath = path.join(process.cwd(), 'components', 'AdminGrievancesPanel.js');
const detailViewPath = path.join(process.cwd(), 'components', 'support', 'TicketDetailView.js');

let lines = fs.readFileSync(panelPath, 'utf8').split('\n');

// Find Modal bounds
let modalStart = -1;
let modalEnd = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<Modal') && lines[i+1]?.includes('visible={!!selectedTicket}')) {
    modalStart = i;
  }
  if (modalStart !== -1 && lines[i].trim() === '</Modal>') {
    modalEnd = i;
    break;
  }
}

if (modalStart === -1 || modalEnd === -1) {
  console.error('Could not find Modal bounds');
  process.exit(1);
}

const modalLines = lines.slice(modalStart, modalEnd + 1);

const allProps = [
  'selectedTicket', 'setSelectedTicket', 'isSearchingChat', 'setIsSearchingChat',
  'chatSearchText', 'setChatSearchText', 'searchMatchIndices', 'activeMatchIndex',
  'handlePrevMatch', 'handleNextMatch', 'getUserName', 'formatTicketDateFull',
  'statusColors', 'statusOptions', 'showStatusConfirm', 'setShowStatusConfirm',
  'pendingStatus', 'setPendingStatus', 'handleStatusUpdate', 'onDetailToggle',
  'currentUser', 'isUserTyping', 'replyText', 'setReplyText', 'onTypingStart',
  'onTypingStop', 'showPlusMenu', 'setShowPlusMenu', 'selectedImage', 'setSelectedImage',
  'isGeneratingSummary', 'generateSummary', 'sendMessage', 'reopenJustification',
  'setReopenJustification', 'showReopenModal', 'setShowReopenModal', 'pendingReopenStatus',
  'setPendingReopenStatus', 'swipeableRefs', 'messageYOffsets', 'scrollViewRef',
  'textInputRef', 'formatMessageTime', 'handleDocumentPick', 'isSending', 'isTyping', 'handleCameraPick'
];

const detailViewComponent = `import React from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, TextInput, 
  Modal, SafeAreaView, KeyboardAvoidingView, Platform, Image, ActivityIndicator, Alert, FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import styles from '../grievances/AdminGrievancesPanel.styles';
import { statusColors, statusOptions, formatTicketDateFull } from '../grievances/constants';

export const TicketDetailView = ({
  ${allProps.join(',\n  ')}
}) => {
  const isTicketClosed = selectedTicket?.status === 'Closed' || selectedTicket?.status === 'Resolved';
  const ticketClosedDate = selectedTicket?.closedAt || selectedTicket?.resolvedAt || selectedTicket?.updatedAt;
  const daysSinceTicketClosed = isTicketClosed && ticketClosedDate ? Math.floor((Date.now() - new Date(ticketClosedDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const isPermanentlyClosed = isTicketClosed && daysSinceTicketClosed >= 3;

  return (
${modalLines.join('\n')}
  );
};
`;

fs.writeFileSync(detailViewPath, detailViewComponent);

// Replace in main file
const replacementLines = [
  `      <TicketDetailView`,
  ...allProps.map(p => `        ${p}={${p}}`),
  `      />`
];

const newLines = [
  ...lines.slice(0, modalStart),
  ...replacementLines,
  ...lines.slice(modalEnd + 1)
];

let newContent = newLines.join('\n');

// Update imports
if (!newContent.includes("import { TicketDetailView }")) {
  newContent = newContent.replace(
    "import styles from './grievances/AdminGrievancesPanel.styles';",
    "import styles from './grievances/AdminGrievancesPanel.styles';\nimport { TicketDetailView } from './support/TicketDetailView';"
  );
}
if (!newContent.includes("import { TicketListItem }")) {
  newContent = newContent.replace(
    "import { TicketDetailView } from './support/TicketDetailView';",
    "import { TicketDetailView } from './support/TicketDetailView';\nimport { TicketListItem } from './support/TicketListItem';"
  );
}

fs.writeFileSync(panelPath, newContent);
console.log('Successfully extracted TicketDetailView securely via line indices.');
