import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'components', 'SupportTicketSystem.js');
let src = fs.readFileSync(file, 'utf8');

// The lines we know:
// list: 613 to 856
// create: 858 to 986
// detail: 988 to 1402

// We can just replace the if blocks.
// Wait, I will use regex or string split to extract exactly the blocks.

const listMatch = src.match(/(if\s*\(view\s*===\s*'list'\)\s*\{)([\s\S]*?)(\n\s*\}\n\s*if\s*\(view\s*===\s*'create'\))/);
const createMatch = src.match(/(if\s*\(view\s*===\s*'create'\)\s*\{)([\s\S]*?)(\n\s*\}\n\s*if\s*\(view\s*===\s*'detail'\s*\&\&\s*selectedTicket\))/);
const detailMatch = src.match(/(if\s*\(view\s*===\s*'detail'\s*\&\&\s*selectedTicket\)\s*\{)([\s\S]*?)(\n\s*\}\n\s*return\s*null;)/);

if (!listMatch || !createMatch || !detailMatch) {
    console.log("Failed to match blocks");
    process.exit(1);
}

const listBody = listMatch[2];
const createBody = createMatch[2];
const detailBody = detailMatch[2];

// Write TicketListView.js
fs.writeFileSync(path.join(process.cwd(), 'components', 'tickets', 'TicketListView.js'), `import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "./SupportTicketSystem.styles";

export const TicketListView = (props) => {
  const {
    filteredTickets, globalMatchCount, listSearchQuery, setListSearchQuery,
    assignmentScope, setAssignmentScope, filterAgentId, setFilterAgentId,
    listTab, setListTab, availableAgents, isAgent, userId,
    showAgentPicker, setShowAgentPicker, setView, setSelectedTicket,
    handleClaim, statusColors, tickets
  } = props;
  
  ${listBody}
};
`);

// Write TicketCreateView.js
fs.writeFileSync(path.join(process.cwd(), 'components', 'tickets', 'TicketCreateView.js'), `import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "./SupportTicketSystem.styles";

const TICKET_TYPES = [
  'Technical Issue', 'Bug', 'Refund', 'Enhancement Request',
  'Fraud Report', 'Match Recordings', 'Payment Issue', 'Tournament Issue', 'Other'
];

export const TicketCreateView = (props) => {
  const {
    setView, formData, setFormData, showTypePicker, setShowTypePicker, handleCreate
  } = props;
  
  ${createBody}
};
`);

// Write TicketDetailView.js
fs.writeFileSync(path.join(process.cwd(), 'components', 'tickets', 'TicketDetailView.js'), `import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal, KeyboardAvoidingView, Platform, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import config from '../../config';
import styles from "./SupportTicketSystem.styles";

export const TicketDetailView = (props) => {
  const {
    selectedTicket, setSelectedTicket, setView, isSearchingChat, setIsSearchingChat,
    chatSearchText, setChatSearchText, searchMatchIndices, activeMatchIndex,
    handlePrevMatch, handleNextMatch, userId, isAgent, showEscalateModal, setShowEscalateModal,
    showClosureModal, setShowClosureModal, closureReason, setClosureReason, isClosing, handleUserClosure,
    isGeneratingSummary, handleGenerateMissingSummary, isAdminTyping, csatRating, setCsatRating,
    csatFeedback, setCsatFeedback, isSubmittingRating, handleRateTicket, replyToMsg, setReplyToMsg,
    selectedImage, setSelectedImage, showPlusMenu, setShowPlusMenu, pickImage, newMessage, setNewMessage,
    onTypingStart, onTypingStop, handleSendMessage, handleReopen, escalationTarget, setEscalationTarget,
    escalationReason, setEscalationReason, handleEscalate, isEscalating, statusColors, messageYOffsets,
    renderDateHeader, renderMessage, scrollViewRef, isAtBottom, textInputRef
  } = props;
  
  ${detailBody}
};
`);

// Now modify SupportTicketSystem.js
src = src.replace(listMatch[0], \`if (view === 'list') {
    return <TicketListView {...{
      filteredTickets, globalMatchCount, listSearchQuery, setListSearchQuery,
      assignmentScope, setAssignmentScope, filterAgentId, setFilterAgentId,
      listTab, setListTab, availableAgents, isAgent, userId,
      showAgentPicker, setShowAgentPicker, setView, setSelectedTicket,
      handleClaim, statusColors, tickets
    }} />;
  }
  if (view === 'create'\`);

src = src.replace(createMatch[0], \`if (view === 'create') {
    return <TicketCreateView {...{
      setView, formData, setFormData, showTypePicker, setShowTypePicker, handleCreate
    }} />;
  }
  if (view === 'detail' && selectedTicket\`);

src = src.replace(detailMatch[0], \`if (view === 'detail' && selectedTicket) {
    return <TicketDetailView {...{
      selectedTicket, setSelectedTicket, setView, isSearchingChat, setIsSearchingChat,
      chatSearchText, setChatSearchText, searchMatchIndices, activeMatchIndex,
      handlePrevMatch, handleNextMatch, userId, isAgent, showEscalateModal, setShowEscalateModal,
      showClosureModal, setShowClosureModal, closureReason, setClosureReason, isClosing, handleUserClosure,
      isGeneratingSummary, handleGenerateMissingSummary, isAdminTyping, csatRating, setCsatRating,
      csatFeedback, setCsatFeedback, isSubmittingRating, handleRateTicket, replyToMsg, setReplyToMsg,
      selectedImage, setSelectedImage, showPlusMenu, setShowPlusMenu, pickImage, newMessage, setNewMessage,
      onTypingStart, onTypingStop, handleSendMessage, handleReopen, escalationTarget, setEscalationTarget,
      escalationReason, setEscalationReason, handleEscalate, isEscalating, statusColors, messageYOffsets,
      renderDateHeader: (dateStr) => {
        const date = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);

        let label = date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', year: 'numeric' });
        if (date.toDateString() === today.toDateString()) label = 'Today';
        else if (date.toDateString() === yesterday.toDateString()) label = 'Yesterday';

        return (
          <View style={styles.dateHeader}>
            <Text style={styles.dateHeaderText}>{label}</Text>
          </View>
        );
      },
      renderMessage, scrollViewRef, isAtBottom, textInputRef
    }} />;
  }
  return null;\`);

// add imports
src = src.replace("import styles from \\\"./tickets/SupportTicketSystem.styles\\\";", \`import styles from "./tickets/SupportTicketSystem.styles";
import { TicketListView } from './tickets/TicketListView';
import { TicketCreateView } from './tickets/TicketCreateView';
import { TicketDetailView } from './tickets/TicketDetailView';\`);

fs.writeFileSync(file, src);
console.log("Success");
