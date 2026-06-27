import fs from 'fs';
import path from 'path';

const panelPath = path.join(process.cwd(), 'components', 'AdminGrievancesPanel.js');
const detailViewPath = path.join(process.cwd(), 'components', 'support', 'TicketDetailView.js');

let panelContent = fs.readFileSync(panelPath, 'utf8');

// The modal starts at roughly:
// <Modal
//   visible={!!selectedTicket}
const modalStartIdx = panelContent.indexOf('<Modal\n        visible={!!selectedTicket}');
const endSearchStr = '          </SafeAreaView>\n        </GestureHandlerRootView>\n      </Modal>\n';
const modalEndIdx = panelContent.indexOf(endSearchStr, modalStartIdx) + endSearchStr.length;

if (modalStartIdx === -1 || modalEndIdx === -1) {
  console.error('Could not find the Modal boundaries.');
  process.exit(1);
}

const modalJSX = panelContent.substring(modalStartIdx, modalEndIdx);

// List of all props this component needs. We'll just define them in the destructured props.
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
import { statusColors } from '../grievances/constants';

export const TicketDetailView = ({
  ${allProps.join(',\n  ')}
}) => {
  const isTicketClosed = selectedTicket?.status === 'Closed' || selectedTicket?.status === 'Resolved';
  const ticketClosedDate = selectedTicket?.closedAt || selectedTicket?.resolvedAt || selectedTicket?.updatedAt;
  const daysSinceTicketClosed = isTicketClosed && ticketClosedDate ? Math.floor((Date.now() - new Date(ticketClosedDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const isPermanentlyClosed = isTicketClosed && daysSinceTicketClosed >= 3;

  return (
    ${modalJSX}
  );
};
`;

fs.writeFileSync(detailViewPath, detailViewComponent);

// Now replace the modal in AdminGrievancesPanel with <TicketDetailView {...ticketDetailProps} />

const replacement = `
      <TicketDetailView
        selectedTicket={selectedTicket}
        setSelectedTicket={setSelectedTicket}
        isSearchingChat={isSearchingChat}
        setIsSearchingChat={setIsSearchingChat}
        chatSearchText={chatSearchText}
        setChatSearchText={setChatSearchText}
        searchMatchIndices={searchMatchIndices}
        activeMatchIndex={activeMatchIndex}
        handlePrevMatch={handlePrevMatch}
        handleNextMatch={handleNextMatch}
        getUserName={getUserName}
        formatTicketDateFull={formatTicketDateFull}
        statusColors={statusColors}
        statusOptions={statusOptions}
        showStatusConfirm={showStatusConfirm}
        setShowStatusConfirm={setShowStatusConfirm}
        pendingStatus={pendingStatus}
        setPendingStatus={setPendingStatus}
        handleStatusUpdate={handleStatusUpdate}
        onDetailToggle={onDetailToggle}
        currentUser={currentUser}
        isUserTyping={isUserTyping}
        replyText={replyText}
        setReplyText={setReplyText}
        onTypingStart={onTypingStart}
        onTypingStop={onTypingStop}
        showPlusMenu={showPlusMenu}
        setShowPlusMenu={setShowPlusMenu}
        selectedImage={selectedImage}
        setSelectedImage={setSelectedImage}
        isGeneratingSummary={isGeneratingSummary}
        generateSummary={generateSummary}
        sendMessage={sendMessage}
        reopenJustification={reopenJustification}
        setReopenJustification={setReopenJustification}
        showReopenModal={showReopenModal}
        setShowReopenModal={setShowReopenModal}
        pendingReopenStatus={pendingReopenStatus}
        setPendingReopenStatus={setPendingReopenStatus}
        swipeableRefs={swipeableRefs}
        messageYOffsets={messageYOffsets}
        scrollViewRef={scrollViewRef}
        textInputRef={textInputRef}
      />
`;

panelContent = panelContent.substring(0, modalStartIdx) + replacement + panelContent.substring(modalEndIdx);

// Make sure to add the import for TicketDetailView at the top
const importStatement = "import { TicketDetailView } from './support/TicketDetailView';\n";
const lastImportIdx = panelContent.lastIndexOf('import ');
const eolAfterLastImport = panelContent.indexOf('\\n', lastImportIdx) + 1;
if(eolAfterLastImport > 0) {
    // Actually just replace import { TicketListItem }...
    panelContent = panelContent.replace(
        "import { TicketListItem } from './support/TicketListItem';",
        "import { TicketListItem } from './support/TicketListItem';\nimport { TicketDetailView } from './support/TicketDetailView';"
    );
}

fs.writeFileSync(panelPath, panelContent);
console.log('Successfully extracted TicketDetailView');
