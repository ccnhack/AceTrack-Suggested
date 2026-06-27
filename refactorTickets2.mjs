import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'components', 'SupportTicketSystem.js');
let src = fs.readFileSync(file, 'utf8');

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

const listJs = "import React from 'react';\n" +
"import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal } from 'react-native';\n" +
"import { Ionicons } from '@expo/vector-icons';\n" +
"import styles from \"../tickets/SupportTicketSystem.styles\";\n" + // Changed path relative to components/tickets/
"\n" +
"export const TicketListView = (props) => {\n" +
"  const {\n" +
"    filteredTickets, globalMatchCount, listSearchQuery, setListSearchQuery,\n" +
"    assignmentScope, setAssignmentScope, filterAgentId, setFilterAgentId,\n" +
"    listTab, setListTab, availableAgents, isAgent, userId,\n" +
"    showAgentPicker, setShowAgentPicker, setView, setSelectedTicket,\n" +
"    handleClaim, statusColors, tickets\n" +
"  } = props;\n" +
"  \n" + listBody + "\n};\n";

fs.writeFileSync(path.join(process.cwd(), 'components', 'tickets', 'TicketListView.js'), listJs);

const createJs = "import React from 'react';\n" +
"import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal } from 'react-native';\n" +
"import { Ionicons } from '@expo/vector-icons';\n" +
"import styles from \"../tickets/SupportTicketSystem.styles\";\n" +
"\n" +
"const TICKET_TYPES = [\n" +
"  'Technical Issue', 'Bug', 'Refund', 'Enhancement Request',\n" +
"  'Fraud Report', 'Match Recordings', 'Payment Issue', 'Tournament Issue', 'Other'\n" +
"];\n" +
"\n" +
"export const TicketCreateView = (props) => {\n" +
"  const {\n" +
"    setView, formData, setFormData, showTypePicker, setShowTypePicker, handleCreate\n" +
"  } = props;\n" +
"  \n" + createBody + "\n};\n";

fs.writeFileSync(path.join(process.cwd(), 'components', 'tickets', 'TicketCreateView.js'), createJs);

const detailJs = "import React, { useRef, useEffect } from 'react';\n" +
"import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal, KeyboardAvoidingView, Platform, Image, ActivityIndicator } from 'react-native';\n" +
"import { Ionicons } from '@expo/vector-icons';\n" +
"import { Swipeable } from 'react-native-gesture-handler';\n" +
"import config from '../../config';\n" +
"import { generateAIResponse } from '../../services/aiService';\n" +
"import styles from \"../tickets/SupportTicketSystem.styles\";\n" +
"\n" +
"export const TicketDetailView = (props) => {\n" +
"  const {\n" +
"    selectedTicket, setSelectedTicket, setView, isSearchingChat, setIsSearchingChat,\n" +
"    chatSearchText, setChatSearchText, searchMatchIndices, activeMatchIndex,\n" +
"    handlePrevMatch, handleNextMatch, userId, isAgent, showEscalateModal, setShowEscalateModal,\n" +
"    showClosureModal, setShowClosureModal, closureReason, setClosureReason, isClosing, handleUserClosure,\n" +
"    isGeneratingSummary, handleGenerateMissingSummary, isAdminTyping, csatRating, setCsatRating,\n" +
"    csatFeedback, setCsatFeedback, isSubmittingRating, handleRateTicket, replyToMsg, setReplyToMsg,\n" +
"    selectedImage, setSelectedImage, showPlusMenu, setShowPlusMenu, pickImage, newMessage, setNewMessage,\n" +
"    onTypingStart, onTypingStop, handleSendMessage, handleReopen, escalationTarget, setEscalationTarget,\n" +
"    escalationReason, setEscalationReason, handleEscalate, isEscalating, statusColors, messageYOffsets,\n" +
"    renderDateHeader, renderMessage, scrollViewRef, isAtBottom, textInputRef\n" +
"  } = props;\n" +
"  \n" + detailBody + "\n};\n";

fs.writeFileSync(path.join(process.cwd(), 'components', 'tickets', 'TicketDetailView.js'), detailJs);

src = src.replace(listMatch[0], "if (view === 'list') {\n" +
"    return <TicketListView {...{\n" +
"      filteredTickets, globalMatchCount, listSearchQuery, setListSearchQuery,\n" +
"      assignmentScope, setAssignmentScope, filterAgentId, setFilterAgentId,\n" +
"      listTab, setListTab, availableAgents, isAgent, userId,\n" +
"      showAgentPicker, setShowAgentPicker, setView, setSelectedTicket,\n" +
"      handleClaim, statusColors, tickets\n" +
"    }} />;\n" +
"  }\n" +
"  if (view === 'create'");

src = src.replace(createMatch[0], "if (view === 'create') {\n" +
"    return <TicketCreateView {...{\n" +
"      setView, formData, setFormData, showTypePicker, setShowTypePicker, handleCreate\n" +
"    }} />;\n" +
"  }\n" +
"  if (view === 'detail' && selectedTicket");

src = src.replace(detailMatch[0], "if (view === 'detail' && selectedTicket) {\n" +
"    return <TicketDetailView {...{\n" +
"      selectedTicket, setSelectedTicket, setView, isSearchingChat, setIsSearchingChat,\n" +
"      chatSearchText, setChatSearchText, searchMatchIndices, activeMatchIndex,\n" +
"      handlePrevMatch, handleNextMatch, userId, isAgent, showEscalateModal, setShowEscalateModal,\n" +
"      showClosureModal, setShowClosureModal, closureReason, setClosureReason, isClosing, handleUserClosure,\n" +
"      isGeneratingSummary, handleGenerateMissingSummary, isAdminTyping, csatRating, setCsatRating,\n" +
"      csatFeedback, setCsatFeedback, isSubmittingRating, handleRateTicket, replyToMsg, setReplyToMsg,\n" +
"      selectedImage, setSelectedImage, showPlusMenu, setShowPlusMenu, pickImage, newMessage, setNewMessage,\n" +
"      onTypingStart, onTypingStop, handleSendMessage, handleReopen, escalationTarget, setEscalationTarget,\n" +
"      escalationReason, setEscalationReason, handleEscalate, isEscalating, statusColors, messageYOffsets,\n" +
"      renderDateHeader: (dateStr) => {\n" +
"        const date = new Date(dateStr);\n" +
"        const today = new Date();\n" +
"        const yesterday = new Date();\n" +
"        yesterday.setDate(today.getDate() - 1);\n" +
"        let label = date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', year: 'numeric' });\n" +
"        if (date.toDateString() === today.toDateString()) label = 'Today';\n" +
"        else if (date.toDateString() === yesterday.toDateString()) label = 'Yesterday';\n" +
"        return (\n" +
"          <View style={styles.dateHeader}>\n" +
"            <Text style={styles.dateHeaderText}>{label}</Text>\n" +
"          </View>\n" +
"        );\n" +
"      },\n" +
"      renderMessage, scrollViewRef, isAtBottom, textInputRef\n" +
"    }} />;\n" +
"  }\n" +
"  return null;");

src = src.replace("import styles from \"./tickets/SupportTicketSystem.styles\";", "import styles from \"./tickets/SupportTicketSystem.styles\";\n" +
"import { TicketListView } from './tickets/TicketListView';\n" +
"import { TicketCreateView } from './tickets/TicketCreateView';\n" +
"import { TicketDetailView } from './tickets/TicketDetailView';");

fs.writeFileSync(file, src);
console.log("Success");
