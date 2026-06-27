import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'screens', 'MatchmakingScreen.js');
let src = fs.readFileSync(file, 'utf8');
const lines = src.split('\n');

const challengeContent = lines.slice(1286, 1492).join('\n');
const detailsContent = lines.slice(1494, 1690).join('\n');
const counterContent = lines.slice(1691, 1870).join('\n');
const reportScoreContent = lines.slice(1871, 1945).join('\n');

// 1. ChallengeModal
const challengeJs = `import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import styles from "./MatchmakingScreen.styles";
import { Sport } from '../../types';

export const ChallengeModal = (props) => {
  const { isChallengeModalVisible, setIsChallengeModalVisible, selectedOpponent, selectedSport, setSelectedSport,
    challengeDate, setChallengeDate, challengeMarkedDates, TIME_SLOTS, challengeTime, setChallengeTime,
    isTimeSlotBlocked, getNextAvailableSlot, venueSearchQuery, setVenueSearchQuery, nearbyVenues,
    selectedAcademyForVenue, setSelectedAcademyForVenue, isFetchingVenues, isSubmitting, confirmChallenge, colors } = props;
  
  return (
${challengeContent}
  );
};
`;
fs.writeFileSync(path.join(process.cwd(), 'screens', 'matchmaking', 'ChallengeModal.js'), challengeJs);

// 2. DetailsModal
const detailsJs = `import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SafeAvatar from '../../components/SafeAvatar';
import styles from "./MatchmakingScreen.styles";

export const DetailsModal = (props) => {
  const { isDetailsModalVisible, setIsDetailsModalVisible, selectedChallenge, getOpponentName, getOpponentStats,
    getTournamentDetails, user, handleAcceptChallenge, handleAcceptCountered, handleCounter, handleDeclineChallenge, handleCancelChallenge, setReportScoreMatch, colors } = props;
  
  return (
${detailsContent}
  );
};
`;
fs.writeFileSync(path.join(process.cwd(), 'screens', 'matchmaking', 'DetailsModal.js'), detailsJs);

// 3. CounterModal
const counterJs = `import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import styles from "./MatchmakingScreen.styles";

export const CounterModal = (props) => {
  const { isCounterModalVisible, setIsCounterModalVisible, selectedChallenge, getOpponentName,
    counterDate, setCounterDate, counterMarkedDates, TIME_SLOTS, counterTime, setCounterTime,
    isTimeSlotBlocked, getNextAvailableSlot, venueSearchQuery, setVenueSearchQuery, nearbyVenues,
    selectedAcademyForVenue, setSelectedAcademyForVenue, isFetchingVenues, counterComment, setCounterComment,
    isSubmitting, submitCounterProposal, colors } = props;
  
  return (
${counterContent}
  );
};
`;
fs.writeFileSync(path.join(process.cwd(), 'screens', 'matchmaking', 'CounterModal.js'), counterJs);

// 4. ReportScoreModal
const reportScoreJs = `import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "./MatchmakingScreen.styles";

export const ReportScoreModal = (props) => {
  const { reportScoreMatch, setReportScoreMatch, reportSets, setReportSets, getOpponentName, user, submitScoreReport } = props;
  
  return (
${reportScoreContent}
  );
};
`;
fs.writeFileSync(path.join(process.cwd(), 'screens', 'matchmaking', 'ReportScoreModal.js'), reportScoreJs);

// Modify original file (replace from bottom to top)
lines.splice(1871, 75, 
  `      <ReportScoreModal {...{ reportScoreMatch, setReportScoreMatch, reportSets, setReportSets, getOpponentName, user, submitScoreReport }} />`
);

lines.splice(1691, 180, 
  `      <CounterModal {...{ isCounterModalVisible, setIsCounterModalVisible, selectedChallenge, getOpponentName, counterDate, setCounterDate, counterMarkedDates, TIME_SLOTS, counterTime, setCounterTime, isTimeSlotBlocked, getNextAvailableSlot, venueSearchQuery, setVenueSearchQuery, nearbyVenues, selectedAcademyForVenue, setSelectedAcademyForVenue, isFetchingVenues, counterComment, setCounterComment, isSubmitting, submitCounterProposal, colors }} />`
);

lines.splice(1494, 197, 
  `      <DetailsModal {...{ isDetailsModalVisible, setIsDetailsModalVisible, selectedChallenge, getOpponentName, getOpponentStats, getTournamentDetails, user, handleAcceptChallenge, handleAcceptCountered, handleCounter, handleDeclineChallenge, handleCancelChallenge, setReportScoreMatch, colors }} />`
);

lines.splice(1286, 207, 
  `      <ChallengeModal {...{ isChallengeModalVisible, setIsChallengeModalVisible, selectedOpponent, selectedSport, setSelectedSport, challengeDate, setChallengeDate, challengeMarkedDates, TIME_SLOTS, challengeTime, setChallengeTime, isTimeSlotBlocked, getNextAvailableSlot, venueSearchQuery, setVenueSearchQuery, nearbyVenues, selectedAcademyForVenue, setSelectedAcademyForVenue, isFetchingVenues, isSubmitting, confirmChallenge, colors }} />`
);

let newSrc = lines.join('\n');
newSrc = newSrc.replace("import MatchService from '../services/MatchService';", 
`import MatchService from '../services/MatchService';
import { ChallengeModal } from './matchmaking/ChallengeModal';
import { DetailsModal } from './matchmaking/DetailsModal';
import { CounterModal } from './matchmaking/CounterModal';
import { ReportScoreModal } from './matchmaking/ReportScoreModal';`
);

fs.writeFileSync(file, newSrc);
console.log("MatchmakingScreen refactor complete!");
