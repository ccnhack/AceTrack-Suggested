import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, Modal, TextInput, Alert, ScrollView, Platform, LayoutAnimation, Pressable
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import * as Location from 'expo-location';
import { colors, shadows, typography, borderRadius, spacing } from '../theme/designSystem';
import { Sport, SkillLevel } from '../types';
import SafeAvatar from '../components/SafeAvatar';
import { Calendar } from 'react-native-calendars';
import { LinearGradient } from 'expo-linear-gradient';
import venuesData from '../data/venues.json';
import { syncOrchestrator } from '../services/sync/SyncOrchestrator';
import { 
  TimeSlotItem, VenueItem, OpponentCard,
  SentRequestCard, ReceivedRequestCard, CounteredRequestCard,
  ExpiredRequestCard, AcceptedMatchCard, HistoryMatchCard
} from '../components/MatchmakingSubComponents';
import DoublesPartnerBoard from '../components/DoublesPartnerBoard';


// Mock tournament hostings to check for busy slots
const MOCK_ACADEMY_TOURNAMENTS = [
  { id: 't1', academyId: 'a1', date: '2026-03-27', startTime: '10:00 AM', duration: 4 }, // 10 AM to 2 PM
  { id: 't2', academyId: 'a2', date: '2026-03-28', startTime: '02:00 PM', duration: 4 }, // 2 PM to 6 PM
];

const TIME_SLOTS = [
  '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM',
  '06:00 PM', '07:00 PM', '08:00 PM'
];

const MOCK_PLAYERS = [
  { id: '1', name: 'Rahul S.', sport: 'Badminton', level: 'Intermediate', dist: '1.2 km', image: 'https://i.pravatar.cc/150?u=rahul' },
  { id: '2', name: 'Sneha K.', sport: 'Table Tennis', level: 'Advanced', dist: '3.5 km', image: 'https://i.pravatar.cc/150?u=sneha' },
  { id: '3', name: 'Amit V.', sport: 'Badminton', level: 'Beginner', dist: '0.8 km', image: 'https://i.pravatar.cc/150?u=amit' },
];

const MOCK_ACADEMIES = [
  { id: 'a1', name: 'Elite Smashers', managedSports: ['Badminton', 'Cricket'], level: 'Pro Academy', dist: '5 km', phone: '+91 98765 43210', image: 'https://i.pravatar.cc/150?u=elite' },
  { id: 'a2', name: 'Net Kings', managedSports: ['Table Tennis'], level: 'Intermediate', dist: '12 km', phone: '+91 87654 32109', image: 'https://i.pravatar.cc/150?u=netkings' },
  { id: 'a3', name: ' Victory Arena', managedSports: ['Badminton', 'Table Tennis'], level: 'Top Rated', dist: '8 km', phone: '+91 76543 21098', image: 'https://i.pravatar.cc/150?u=victory' },
];

const parseTime = (timeStr) => {
  if (!timeStr) return 0;
  const [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':');
  if (hours === '12') hours = '00';
  if (modifier === 'PM') hours = parseInt(hours, 10) + 12;
  return parseInt(hours, 10) * 60 + parseInt(minutes, 10);
};

const isTimeInPast = (date, timeSlot, serverOffset = 0) => {
  if (!date) return false;
  const now = new Date(Date.now() + serverOffset);
  const todayStr = now.toISOString().split('T')[0];
  if (date < todayStr) return true;
  if (date > todayStr) return false;

  // Same day, check time
  if (!timeSlot) return false;
  const slotMinutes = parseTime(timeSlot);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return slotMinutes <= nowMinutes;
};

import { useAuth } from '../context/AuthContext';
import { usePlayersStore } from '../stores';
import { useSync } from '../context/SyncContext';
import { useMatchmaking } from '../context/MatchmakingContext';
import { useTournamentsStore } from '../stores';
import MatchService from '../services/MatchService';
import { getSuggestedOpponents, getSuggestionReason } from '../utils/matchmakingUtils';
import styles from "./matchmaking/MatchmakingScreen.styles";

const FilterDropdown = ({ label, options, selectedValue, onSelect, styles }) => {
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity style={styles.dropdownBox} onPress={() => setVisible(true)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dropdownLabel}>{label}</Text>
          <Text style={styles.dropdownValue}>{selectedValue}</Text>
        </View>
        <Ionicons name="chevron-down" size={16} color="#94A3B8" />
      </TouchableOpacity>
      
      <Modal visible={visible} transparent animationType="fade">
        <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={styles.dropdownMenu} onStartShouldSetResponder={() => true}>
            <View style={styles.dropdownMenuHeader}>
              <Text style={styles.dropdownMenuTitle}>Select {label}</Text>
              <TouchableOpacity onPress={() => setVisible(false)}>
                <Ionicons name="close" size={24} color="#94A3B8" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {options.map(opt => (
                <TouchableOpacity 
                  key={opt} 
                  style={[styles.dropdownItem, selectedValue === opt && styles.dropdownItemActive]}
                  onPress={() => { onSelect(opt); setVisible(false); }}
                >
                  <Text style={[styles.dropdownItemText, selectedValue === opt && styles.dropdownItemTextActive]}>{opt}</Text>
                  {selectedValue === opt && <Ionicons name="checkmark" size={20} color="#3B82F6" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

export default function MatchmakingScreen({ route }) {
  const { currentUser: user } = useAuth();
  const { matchmaking, onUpdateMatchmaking, partnerRequests, onUpdatePartnerRequests } = useMatchmaking();
  const { players, sendUserNotification } = usePlayersStore();
  const { loadData: onManualSync, serverClockOffset } = useSync();
  const { tournaments } = useTournamentsStore();
  
  const lastSyncRef = React.useRef(0);
  const insets = useSafeAreaInsets();

  // REAL-TIME SYNC: Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      // Throttle sync to once every 2 seconds to break potential infinite refocus loops
      if (onManualSync && now - lastSyncRef.current > 2000) {
        if (__DEV__) console.log("🔄 Matchmaking Screen focused, triggering background sync...");
        lastSyncRef.current = now;
        onManualSync(true); // true = force background sync
      } else if (onManualSync) {
        if (__DEV__) console.log("⏳ Matchmaking sync throttled (last sync < 2s ago)");
      }
    }, [onManualSync])
  );
  const role = user?.role || 'user';
  const [activeTab, setActiveTab] = useState(route?.params?.initialTab || (role === 'coach' ? 'Bookings' : 'Challenge')); // Challenge, Requests, Accepted, History
  const handleTabChange = (newTab) => {
    if (newTab === activeTab) return;
    if (Platform.OS !== 'web') {
        LayoutAnimation.configureNext({
          duration: 200,
          update: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
          create: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
          delete: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setActiveTab(newTab);
  };

  
  // 🛡️ v2.6.87: Reactively update tab when params change (Fix for deep-linking when screen is already mounted)
  React.useEffect(() => {
    if (route?.params?.initialTab) {
      setActiveTab(route.params.initialTab);
    }
  }, [route?.params?.initialTab]);

  // Derived states from global matchmaking prop
  const sentRequests = React.useMemo(() => 
    (matchmaking || []).filter(m => 
      m.senderId === user?.id && m.status === 'Pending' &&
      !isTimeInPast(m.proposedDate || m.time?.split(',')[0]?.trim(), m.proposedTime || m.time?.split(',')[1]?.trim(), serverClockOffset)
    ),
    [matchmaking, user?.id, serverClockOffset]
  );
  
  const receivedRequests = React.useMemo(() => 
    (matchmaking || []).filter(m => 
      ((m.receiverId === user?.id && m.status === 'Pending') || 
      (m.senderId === user?.id && m.status === 'Countered')) &&
      !isTimeInPast(m.proposedDate || m.time?.split(',')[0]?.trim(), m.proposedTime || m.time?.split(',')[1]?.trim(), serverClockOffset)
    ),
    [matchmaking, user?.id, serverClockOffset]
  );

  const counteredRequests = React.useMemo(() => 
    (matchmaking || []).filter(m => 
      (m.senderId === user?.id || m.receiverId === user?.id) && m.status === 'Countered' &&
      !isTimeInPast(m.proposedDate || m.time?.split(',')[0]?.trim(), m.proposedTime || m.time?.split(',')[1]?.trim(), serverClockOffset)
    ),
    [matchmaking, user?.id, serverClockOffset]
  );
  
  const expiredRequests = React.useMemo(() => 
    (matchmaking || []).filter(m => 
      (m.senderId === user?.id || m.receiverId === user?.id) && 
      (m.status === 'Pending' || m.status === 'Countered') && 
      isTimeInPast(m.proposedDate || m.time?.split(',')[0]?.trim(), m.proposedTime || m.time?.split(',')[1]?.trim(), serverClockOffset)
    ),
    [matchmaking, user?.id, serverClockOffset]
  );
  
  const acceptedMatches = React.useMemo(() => 
    (matchmaking || []).filter(m => 
      (m.senderId === user?.id || m.receiverId === user?.id) && m.status === 'Accepted'
    ),
    [matchmaking, user?.id]
  );

  const upcomingMatches = React.useMemo(() => {
    return acceptedMatches.filter(m => {
      const date = m.proposedDate || m.time?.split(',')[0]?.trim();
      const time = m.proposedTime || m.time?.split(',')[1]?.trim();
      return !isTimeInPast(date, time, serverClockOffset);
    });
  }, [acceptedMatches, serverClockOffset]);

  const pastMatches = React.useMemo(() => {
    return acceptedMatches.filter(m => {
      const date = m.proposedDate || m.time?.split(',')[0]?.trim();
      const time = m.proposedTime || m.time?.split(',')[1]?.trim();
      return isTimeInPast(date, time, serverClockOffset);
    });
  }, [acceptedMatches, serverClockOffset]);

  const [history, setHistory] = useState([
    { id: 'h1', name: 'Sameer P.', sport: 'Badminton', date: 'Mar 20, 2024' }
  ]);

  const [isChallengeModalVisible, setIsChallengeModalVisible] = useState(false);
  const [isDetailsModalVisible, setIsDetailsModalVisible] = useState(false);
  const [isCounterModalVisible, setIsCounterModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedOpponent, setSelectedOpponent] = useState(null);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [challengeDate, setChallengeDate] = useState('');
  const [challengeTime, setChallengeTime] = useState('');
  const [selectedSport, setSelectedSport] = useState('');
  const [counterDate, setCounterDate] = useState('');
  const [counterTime, setCounterTime] = useState('');
  const [venueSearchQuery, setVenueSearchQuery] = useState('');
  const [selectedAcademyForVenue, setSelectedAcademyForVenue] = useState(null);
  const [negotiatedVenue, setNegotiatedVenue] = useState('opponent');
  const [expandedSlot, setExpandedSlot] = useState(null);
  const [counterComment, setCounterComment] = useState('');
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState(null);
  const [nearbyVenues, setNearbyVenues] = useState([]);
  const [isFetchingVenues, setIsFetchingVenues] = useState(false);
  const [venueDropdownSearchQuery, setVenueDropdownSearchQuery] = useState('');
  const [reportScoreMatch, setReportScoreMatch] = useState(null);
  const [reportSets, setReportSets] = useState([{ score1: 0, score2: 0 }]);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const scrollViewWidthRef = React.useRef(0);
  const [filterSport, setFilterSport] = useState('All');
  const [filterSkill, setFilterSkill] = useState('All');
  const [filterLocation, setFilterLocation] = useState('');

  // PERFORMANCE: Separate Static Marks from Dynamic Selection to prevent Calendar Lag
  const staticChallengeMarks = React.useMemo(() => {
    if (!isChallengeModalVisible) return {};
    const marks = {};
    MOCK_ACADEMY_TOURNAMENTS.forEach(t => {
      if (t.academyId === selectedOpponent?.id) marks[t.date] = { marked: true, dotColor: '#EF4444' };
    });
    matchmaking.forEach(m => {
       if ((m.senderId === user?.id && m.receiverId === selectedOpponent?.id) ||
           (m.senderId === selectedOpponent?.id && m.receiverId === user?.id)) {
         const mDate = m.proposedDate || m.time?.split(',')[0]?.trim();
         if (mDate) marks[mDate] = { marked: true, dotColor: colors.primary };
       }
    });
    return marks;
  }, [isChallengeModalVisible, selectedOpponent?.id, matchmaking, user?.id]);

  const challengeMarkedDates = React.useMemo(() => {
    if (!challengeDate) return staticChallengeMarks;
    return { ...staticChallengeMarks, [challengeDate]: { ...staticChallengeMarks[challengeDate], selected: true, selectedColor: '#6366F1' } };
  }, [staticChallengeMarks, challengeDate]);

  // MEMOIZED CALENDAR MARKING - COUNTER MODAL
  const staticCounterMarks = React.useMemo(() => {
    if (!isCounterModalVisible) return {};
    const marks = {};
    MOCK_ACADEMY_TOURNAMENTS.forEach(t => {
       if (t.academyId === selectedChallenge?.academyId) marks[t.date] = { marked: true, dotColor: '#EF4444' };
    });
    return marks;
  }, [isCounterModalVisible, selectedChallenge?.academyId]);

  const counterMarkedDates = React.useMemo(() => {
    if (!counterDate) return staticCounterMarks;
    return { ...staticCounterMarks, [counterDate]: { ...staticCounterMarks[counterDate], selected: true, selectedColor: '#6366F1' } };
  }, [staticCounterMarks, counterDate]);

  const getDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c).toFixed(1);
  };

  const getSportFromText = (text) => {
    const t = text.toLowerCase();
    const sports = [];
    if (t.includes("badminton")) sports.push("Badminton");
    if (t.includes("cricket")) sports.push("Cricket");
    if (t.includes("table tennis") || t.includes(" tt")) sports.push("Table Tennis");
    return sports.join(", ");
  };

  // LOCATION & VENUE DISCOVERY (LOCAL DATA + FALLBACK)
  const [hasFetchedFallback, setHasFetchedFallback] = React.useState(false);

  const fetchGeoapifyFallback = async (lat, lng) => {
    if (hasFetchedFallback) return;
    setHasFetchedFallback(true);
    setIsFetchingVenues(true);
    const apiKey = 'b2c6599a146c41febca8debdc46c55eb';
    const categories = 'sport.sports_centre,sport.stadium';
    const url = `https://api.playo.io/activity-public/list/location`; // Wait, user wants geoapify.
    // Actually the user said geoapify api request. 
    const geoapifyUrl = `https://api.geoapify.com/v2/places?categories=${categories}&filter=circle:${lng},${lat},20000&limit=20&apiKey=${apiKey}`;

    try {
      const response = await fetch(geoapifyUrl);
      if (!response.ok) throw new Error(`Geoapify error: ${response.status}`);
      const data = await response.json();
      if (data.features) {
        const newVenues = data.features.map(f => {
          const props = f.properties || {};
          const name = props.name || "";
          const address = props.formatted || "";
          
          let area = "";
          const parts = address.split(",");
          if (parts.length > 2) area = parts[parts.length - 3]?.trim();
          
          const sport = getSportFromText(name + " " + address);
          
          return {
            label: name + (area ? ` - ${area}` : ''),
            venueName: name,
            area: area,
            sport: sport,
            value: name,
            address: address,
            lat: props.lat,
            lon: props.lon,
            distance: getDistance(lat, lng, props.lat, props.lon)
          };
        }).filter(v => v.venueName && v.venueName.trim() !== "" && parseFloat(v.distance) <= 30);

        setNearbyVenues(prev => {
          const combined = [...prev, ...newVenues];
          const unique = [];
          const seen = new Set();
          for (const v of combined) {
            const key = (v.venueName + (v.area || "")).toLowerCase();
            if (!seen.has(key)) {
              if (parseFloat(v.distance) <= 30) {
                unique.push(v);
                seen.add(key);
              }
            }
          }
          return unique.sort((a, b) => (parseFloat(a.distance) || 999) - (parseFloat(b.distance) || 999));
        });
      }
    } catch (error) {
      console.error('Error fetching Geoapify fallback:', error);
    } finally {
      setIsFetchingVenues(false);
    }
  };

  const loadLocalVenues = (lat, lng) => {
    setIsFetchingVenues(true);
    
    const processedVenues = venuesData.map(v => {
      const detectedSport = getSportFromText(v.venueName + " " + (v.address || ""));
      return {
        label: v.venueName + (v.area ? ` - ${v.area}` : ''),
        venueName: v.venueName,
        area: v.area,
        sport: detectedSport || v.sport,
        value: v.venueName,
        address: v.address || "",
        lat: v.lat,
        lon: v.lon,
        phone: v.phone,
        email: v.email,
        distance: getDistance(lat, lng, v.lat, v.lon)
      };
    });

    // Filter strictly for ones within 30km as requested
    const within30km = processedVenues.filter(v => v.distance !== null && parseFloat(v.distance) <= 30);
    const sortedVenues = within30km.sort((a, b) => (parseFloat(a.distance) || 999) - (parseFloat(b.distance) || 999));
    
    setNearbyVenues(sortedVenues);
    setIsFetchingVenues(false);

    // TRIGGER FALLBACK IF LESS THAN 5 RESULTS WITHIN 30KM
    if (within30km.length < 5 && lat && lng) {
      fetchGeoapifyFallback(lat, lng);
    }
  };

  React.useEffect(() => {
    (async () => {
      try {
        if (__DEV__) {
          console.log("🧪 [TEST_DEBUG] Bypassing location request in Matchmaking for automated tests.");
          return;
        }
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        let location = await Location.getCurrentPositionAsync({});
        setUserLocation(location.coords);
      } catch (e) {
        console.warn("Location fetch suppressed in Matchmaking:", e.message);
      }
    })();
  }, []);

  React.useEffect(() => {
    if (isChallengeModalVisible || isCounterModalVisible) {
      if (userLocation) {
        // We have location - compute distances
        loadLocalVenues(userLocation.latitude, userLocation.longitude);
      } else if (nearbyVenues.length === 0) {
        // Location not ready, but we need to show something
        const processedVenues = venuesData.map(v => ({
          label: v.venueName + (v.area ? ` - ${v.area}` : ''),
          venueName: v.venueName,
          area: v.area,
          sport: v.sport,
          value: v.venueName,
          address: v.address,
          lat: v.lat,
          lon: v.lon,
          phone: v.phone,
          email: v.email,
          distance: null
        }));
        setNearbyVenues(processedVenues);
      }
    }
  }, [isChallengeModalVisible, isCounterModalVisible, userLocation]);

  const isTimeSlotBlocked = (date, timeSlot, academyId) => {
    if (!date || !academyId) return false;
    const slotMinutes = parseTime(timeSlot);

    // 🛡️ [GUARD 1] Academy Venue Conflict (Static/Mock)
    const isAcademyBusy = MOCK_ACADEMY_TOURNAMENTS.some(t => {
      if (t.date !== date || t.academyId !== academyId) return false;
      const startMinutes = parseTime(t.startTime);
      const endMinutes = startMinutes + t.duration * 60;
      return slotMinutes >= startMinutes && slotMinutes < endMinutes;
    });
    if (isAcademyBusy) return true;

    // 🛡️ [GUARD 2] User Schedule Conflict (Real Cloud Logic)
    if (!user?.id) return false;
    const isUserBusyAtTournament = (tournaments || []).some(t => {
      if (t.date !== date) return false;
      
      // Check if user is actually playing/registered
      const isRegistered = (t.registeredPlayerIds || []).includes(user.id);
      if (!isRegistered) return false;

      const startMinutes = parseTime(t.startTime);
      const endMinutes = startMinutes + (t.duration || 4) * 60;
      return slotMinutes >= startMinutes && slotMinutes < endMinutes;
    });

    return isUserBusyAtTournament;
  };


  const mySports = user?.managedSports || (user?.certifiedSports) || [Sport.BADMINTON];

  const getUserPreferredSport = () => {
    const counts = { [Sport.BADMINTON]: 0, [Sport.TABLE_TENNIS]: 0, [Sport.CRICKET]: 0 };
    
    // Weight declared primary sport heavily
    if (user?.sport && counts[user.sport] !== undefined) {
      counts[user.sport] += 5;
    }

    // Count accepted/completed matches
    matchmaking.forEach(m => {
      if ((m.senderId === user?.id || m.receiverId === user?.id) && (m.status === 'Accepted' || m.status === 'Completed')) {
        if (counts[m.sport] !== undefined) counts[m.sport] += 1;
      }
    });

    return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
  };

  const getCommonSports = (opponent) => {
    const preferred = getUserPreferredSport();
    const allSports = [Sport.BADMINTON, Sport.TABLE_TENNIS, Sport.CRICKET];
    
    // Sort so preferred is first
    return allSports.sort((a, b) => {
      if (a === preferred) return -1;
      if (b === preferred) return 1;
      return 0;
    });
  };

  const handleChallenge = (opponent) => {
    const common = getCommonSports(opponent);
    if (common.length === 0) {
      Alert.alert("No Matching Sports", "You and this opponent don't share any sports.");
      return;
    }
    setSelectedOpponent(opponent);
    setSelectedSport(common[0]); // Auto-select first available sport
    setChallengeDate('');
    setChallengeTime('');
    setSelectedAcademyForVenue(null);
    setVenueDropdownSearchQuery('');
    setIsChallengeModalVisible(true);
  };

  const confirmChallenge = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    if (!challengeDate || !challengeTime || !selectedSport || !selectedAcademyForVenue) {
      let missingFields = [];
      if (!challengeDate) missingFields.push("Date");
      if (!challengeTime) missingFields.push("Time");
      if (!selectedSport) missingFields.push("Sport");
      if (!selectedAcademyForVenue) missingFields.push("Venue");
      
      Alert.alert("Missing Details", `Please select the following: ${missingFields.join(", ")}`);
      setIsSubmitting(false);
      return;
    }

    const response = createChallenge(
      selectedOpponent, 
      challengeDate, 
      challengeTime, 
      selectedSport, 
      selectedAcademyForVenue,
      user?.id,
      user?.name
    );

    if (response.success) {
      setIsChallengeModalVisible(false);
      setChallengeDate('');
      setChallengeTime('');
      
      if (sendUserNotification && response.notification) {
        sendUserNotification(selectedOpponent.id, response.notification);
      }
      Alert.alert("Challenge Sent!", `Your request to ${selectedOpponent.name} has been sent.`);
    }

    setTimeout(() => setIsSubmitting(false), 500);
  };

  const getOpponentName = (item) => {
    if (!item) return 'Opponent';
    // If current user is the sender, show receiver's name
    if (item.senderId === user?.id) return item.receiverName || item.name;
    // If current user is the receiver, show sender's name
    if (item.receiverId === user?.id) return item.senderName || item.name;
    // Fallback for mock data without IDs
    return item.name || 'Opponent';
  };

  const getOpponentStats = (req) => {
    const oppId = req.senderId === user?.id ? req.receiverId : req.senderId;
    const opp = players.find(p => p.id === oppId);
    if (!opp) return null;
    return {
      rating: opp.trueSkillRating || opp.rating || 1200,
      wins: opp.wins || 0,
      losses: opp.losses || 0,
      level: opp.skillLevel || opp.level || 'Intermediate'
    };
  };

  const getTournamentDetails = (req) => {
    if (!req.tournamentId) return null;
    const t = tournaments.find(t => t.id === req.tournamentId);
    if (!t) return null;
    // Navigate to Explore screen with the tournament ID to open the detail modal
    return {
      id: t.id,
      title: t.title,
      onViewDetails: (id) => {
         navigation.navigate('Explore', { openTournamentId: id });
      }
    };
  };

  const handleCancelChallenge = (req) => {
    const oppName = getOpponentName(req);
    Alert.alert(
      "Cancel Request",
      `Are you sure you want to cancel your challenge to ${oppName}?`,
      [
        { text: "No", style: "cancel" },
        { 
          text: "Yes, Cancel", 
          style: "destructive",
          onPress: () => {
            respondToChallenge(req, 'cancel', user?.id, user?.name);
            Alert.alert("Request Cancelled", "Your challenge has been successfully removed.");
          }
        }
      ]
    );
  };

  const handleDeclineChallenge = (req) => {
    const oppName = getOpponentName(req);
    Alert.alert(
      "Decline Challenge",
      `Are you sure you want to decline the challenge from ${oppName}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Decline", 
          style: "destructive",
          onPress: () => {
            const response = respondToChallenge(req, 'decline', user.id, user.name);
            if (response.success && sendUserNotification && response.notification) {
              sendUserNotification(req.senderId, response.notification);
            }
            Alert.alert("Challenge Declined", "The request has been removed.");
          }
        }
      ]
    );
  };

  const handleAcceptChallenge = (req) => {
    const oppName = getOpponentName(req);
    const response = respondToChallenge(req, 'accept', user.id, user.name);
    
    if (response.success && sendUserNotification && response.notification) {
      sendUserNotification(req.senderId, response.notification);
    }

    Alert.alert("Match Accepted", `You have confirmed the match with ${oppName}.`);
  };

  const handleAcceptCountered = (req) => {
    const oppName = getOpponentName(req);
    // 🛡️ Phase 1.3: Check if the other party has responded to the counter
    if (!req.hasUserResponse) {
      const origDate = req.originalChallengerDate || req.proposedDate;
      const origTime = req.originalChallengerTime || req.proposedTime;
      const myDate = req.myCounterDate || req.proposedDate;
      const myTime = req.myCounterTime || req.proposedTime;
      Alert.alert(
        "Accept Original Challenge?",
        `The other player hasn't responded to your counter yet.\n\n` +
        `🗓️ Original Challenger's Slot:\n${origDate} at ${origTime}\n\n` +
        `🔄 Your Last Counter:\n${myDate} at ${myTime}\n\n` +
        `Are you sure you want to accept as per their preferred slot? Your counter will be invalid.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Yes, Accept",
            onPress: () => {
              const response = MatchService.respond(req, 'accept', user.id, user.name, {
                proposedDate: origDate,
                proposedTime: origTime,
                time: `${origDate}, ${origTime}`
              });
              syncOrchestrator.handleMatchUpdate(response);
              Alert.alert("Challenge Accepted!", `Match confirmed for ${origDate} at ${origTime} with ${oppName}.`);
            }
          }
        ]
      );
      return;
    }

    // Other user has responded — accept with latest proposed slot
    const finalDate = req.proposedDate;
    const finalTime = req.proposedTime;
    const response = MatchService.respond(req, 'accept', user.id, user.name, {
      time: `${finalDate}, ${finalTime}`
    });
    syncOrchestrator.handleMatchUpdate(response);
    Alert.alert("Challenge Accepted!", `Match confirmed for ${finalDate} at ${finalTime} with ${oppName}.`);
  };

  const openDetails = (challenge) => {
    setSelectedChallenge(challenge);
    setIsDetailsModalVisible(true);
    
    // 🛡️ v2.6.90: Automatically mark as read when clicking to view details
    if (challenge.isNew) {
      // Small intentional logic skip: isNew is UI-only usually, but we keep the authority for logic
      syncOrchestrator.handleMatchUpdate({ data: { updatedMatch: { ...challenge, isNew: false } } });
    }
  };

  const handleCounter = (req) => {
    setSelectedChallenge(req);
    setCounterDate(req.proposedDate || '');
    setCounterTime(req.proposedTime || '');
    setVenueSearchQuery('');
    setSelectedAcademyForVenue(null);
    setNegotiatedVenue('opponent');
    setCounterComment(req.counterComment || '');
    setVenueDropdownSearchQuery('');
    setIsCounterModalVisible(true);
    setIsDetailsModalVisible(false);
  };

  const getNextAvailableSlot = (date, currentSlot, academyId) => {
    const currentIndex = TIME_SLOTS.indexOf(currentSlot);
    if (currentIndex === -1) return "Check calendar";
    for (let i = currentIndex + 1; i < TIME_SLOTS.length; i++) {
        if (!isTimeSlotBlocked(date, TIME_SLOTS[i], academyId)) {
            return TIME_SLOTS[i];
        }
    }
    return "Next day";
  };

  const submitCounterProposal = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    if (!counterDate || !counterTime || (!selectedAcademyForVenue && negotiatedVenue === 'opponent')) {
      let missingFields = [];
      if (!counterDate) missingFields.push("Date");
      if (!counterTime) missingFields.push("Time");
      if (!selectedAcademyForVenue && negotiatedVenue === 'opponent') missingFields.push("Venue");
      
      Alert.alert("Missing Details", `Please select the following: ${missingFields.join(", ")}`);
      setIsSubmitting(false);
      return;
    }

    const response = proposeCounter(
      selectedChallenge, 
      user.id, 
      user.name, 
      counterDate, 
      counterTime, 
      selectedAcademyForVenue, 
      counterComment
    );

    if (response.success) {
      setIsCounterModalVisible(false);
      setSelectedChallenge(null);
      Alert.alert("Counter Proposal Sent", `You suggested ${counterDate} at ${counterTime}.`);
    }
    setTimeout(() => setIsSubmitting(false), 500);
  };

  const submitScoreReport = () => {
    if (!reportScoreMatch) return;
    
    // Validate sets (simplified: at least one set must have values)
    if (reportSets.every(s => s.score1 === 0 && s.score2 === 0)) {
      Alert.alert("Invalid Score", "Please enter scores for the match.");
      return;
    }

    const response = finalizeMatch(reportScoreMatch, reportSets, reportScoreMatch.sport);
    
    if (response.success) {
      if (sendUserNotification && response.notification) {
        // Send notification to both players
        const opponentId = reportScoreMatch.player1Id === user.id ? reportScoreMatch.player2Id : reportScoreMatch.player1Id;
        sendUserNotification(opponentId, response.notification);
      }
      setReportScoreMatch(null);
      setIsDetailsModalVisible(false);
      Alert.alert("Match Finalized", "The match has been updated with the final scores.");
    }
  };

  const handleRemoveExpired = (id) => {
    Alert.alert(
      "Remove Expired Challenge",
      "Are you sure you want to remove this expired request?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Remove", 
          style: "destructive",
          onPress: () => {
            const response = MatchService.removeExpired(id);
            syncOrchestrator.handleMatchUpdate(response);
          }
        }
      ]
    );
  };

  const handleRemoveAllExpired = () => {
    if (expiredRequests.length === 0) return;
    Alert.alert(
      "Remove All Expired",
      `Are you sure you want to remove all ${expiredRequests.length} expired requests?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Remove All", 
          style: "destructive",
          onPress: () => {
            const response = MatchService.removeAllExpired(expiredRequests.map(m => m.id));
            syncOrchestrator.handleMatchUpdate(response);
            Alert.alert("Success", "All expired requests have been removed.");
          }
        }
      ]
    );
  };

  const handleConfirmBooking = (req) => {
    const oppName = getOpponentName(req);
    const response = MatchService.confirmBooking(req, user.id, user.name);
    syncOrchestrator.handleMatchUpdate(response);
    Alert.alert("Booking Confirmed", `You have finalized the booking with ${oppName}.`);
  };

  const handleCancelBooking = (req) => {
    const oppName = getOpponentName(req);
    Alert.alert(
      "Cancel Booking",
      `Are you sure you want to cancel the booking with ${oppName}? This action cannot be undone.`,
      [
        { text: "No", style: "cancel" },
        { 
          text: "Yes, Cancel", 
          style: "destructive",
          onPress: () => {
            respondToChallenge(req, 'cancel', user?.id, user?.name);
            setIsDetailsModalVisible(false);
            Alert.alert("Booking Cancelled", "The booking has been successfully removed.");
          }
        }
      ]
    );
  };

  const renderOpponent = useCallback(({ item }) => {
    const isSent = sentRequests.some(r => r.id === item.id);
    return (
      <OpponentCard 
        item={item} 
        role={role} 
        isSent={isSent} 
        onChallenge={handleChallenge} 
        styles={styles} 
      />
    );
  }, [role, sentRequests, handleChallenge]);

  const renderRequested = () => {
    // counteredRequests is now a top-level memoized state
    const actualSentRequests = sentRequests;

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        {/* Sent Challenges Section - Hidden for Coaches */}
        {role !== 'coach' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Sent</Text>
            </View>
            {actualSentRequests.length === 0 && <Text style={styles.emptyText}>No Pending Requests Sent</Text>}
            {actualSentRequests.map((req, index) => (
              <SentRequestCard
                key={req.id || `sent-${index}`}
                req={req}
                getOpponentName={getOpponentName}
                getOpponentStats={getOpponentStats}
                getTournamentDetails={getTournamentDetails}
                onOpenDetails={openDetails}
                onCounter={handleCounter}
                onCancel={handleCancelChallenge}
                styles={styles}
              />
            ))}
          </View>
        )}

        {/* Received Challenges Section */}
        <View style={[styles.section, role !== 'coach' ? { marginTop: 25 } : null]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Received</Text>
          </View>
          {receivedRequests.length === 0 ? (
            <Text style={styles.emptyText}>No Requests Received</Text>
          ) : (
            receivedRequests.map((req, index) => (
              <ReceivedRequestCard
                key={req.id || `received-${index}`}
                req={req}
                role={role}
                getOpponentName={getOpponentName}
                getOpponentStats={getOpponentStats}
                getTournamentDetails={getTournamentDetails}
                onOpenDetails={openDetails}
                onDecline={handleDeclineChallenge}
                onCounter={handleCounter}
                onAccept={handleAcceptChallenge}
                styles={styles}
              />
            ))
          )}
        </View>

        {/* Countered Section */}
        <View style={[styles.section, { marginTop: 25 }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Countered</Text>
            {role === 'coach' && counteredRequests.some(r => r.hasUserResponse) && (
              <View style={[styles.badge, { backgroundColor: '#EF4444' }]}>
                <Text style={styles.badgeText}>{counteredRequests.filter(r => r.hasUserResponse).length} NEW RESPONSE</Text>
              </View>
            )}
          </View>
          {counteredRequests.length === 0 && (
            <Text style={styles.emptyText}>No Countered Challenges</Text>
          )}
          {counteredRequests.map((req, index) => (
            <CounteredRequestCard
              key={req.id || `countered-${index}`}
              req={req}
              role={role}
              getOpponentName={getOpponentName}
              getOpponentStats={getOpponentStats}
              getTournamentDetails={getTournamentDetails}
              onOpenDetails={openDetails}
              onCounter={handleCounter}
              onAccept={role === 'coach' ? handleConfirmBooking : handleAcceptCountered}
              styles={styles}
            />
          ))}
        </View>
      </ScrollView>
    );
  };

  const renderExpired = () => {
    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Expired Requests</Text>
            {expiredRequests.length > 0 && (
              <TouchableOpacity 
                testID="matchmaking.expired.remove_all"
                onPress={handleRemoveAllExpired} 
                style={[styles.smallBtn, { backgroundColor: '#FEE2E2' }]}
              >
                <Text style={[styles.smallBtnText, { color: '#E11D48' }]}>Remove All</Text>
              </TouchableOpacity>
            )}
          </View>
          {expiredRequests.length === 0 && <Text style={styles.emptyText}>No Expired Requests Found</Text>}
          {expiredRequests.map((req, index) => {
            const isUnread = !req.isExpiredRead;
            return (
              <ExpiredRequestCard
                key={req.id || `expired-${index}`}
                req={req}
                getOpponentName={getOpponentName}
                onOpenDetails={(req) => {
                  if (isUnread) {
                    syncOrchestrator.handleMatchUpdate({ 
                      data: { updatedMatch: { ...req, isExpiredRead: true } } 
                    });
                  }
                  openDetails(req);
                }}
                onRemove={handleRemoveExpired}
                isUnread={isUnread}
                styles={styles}
              />
            );
          })}
        </View>
      </ScrollView>
    );
  };

  const renderAccepted = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      {upcomingMatches.length === 0 && <Text style={styles.emptyText}>No Upcoming Matches Found</Text>}
      {upcomingMatches.map((match, index) => (
        <AcceptedMatchCard
          key={match.id || `accepted-${index}`}
          match={match}
          role={role}
          getOpponentName={getOpponentName}
          onOpenDetails={openDetails}
          styles={styles}
          colors={colors}
        />
      ))}
    </ScrollView>
  );

  const renderHistory = () => {
    // Combine explicit history with past accepted matches
    const allHistory = [
      ...history,
      ...pastMatches.map(m => ({
        ...m,
        date: m.proposedDate || m.time?.split(',')[0]?.trim() || 'Past Date'
      }))
    ];

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        {allHistory.length === 0 && <Text style={styles.emptyText}>No Match History Found</Text>}
        {allHistory.map((item, index) => (
          <HistoryMatchCard
            key={item.id || `history-${index}`}
            item={item}
            getOpponentName={getOpponentName}
            onOpenDetails={openDetails}
            styles={styles}
          />
        ))}
      </ScrollView>
    );
  };

  const allPlayers = React.useMemo(() => Array.isArray(players) ? players : [], [players]);
  
  const filteredOpponents = React.useMemo(() => {
    const base = (role === 'academy'
      ? MOCK_ACADEMIES.filter(a => a.id !== user?.id && a.managedSports.some(s => mySports.includes(s)))
      : allPlayers.filter(p => p.id !== user?.id && p.role === 'user')
    );
    
    let result = base;
    
    if (playerSearchQuery) {
      const query = playerSearchQuery.toLowerCase();
      result = result.filter(item => 
        item.name?.toLowerCase().includes(query) || 
        item.username?.toLowerCase().includes(query) ||
        item.email?.toLowerCase().includes(query)
      );
    }
    
    if (filterSport !== 'All') {
      result = result.filter(item => {
        const playerSport = item.sport || (item.certifiedSports && item.certifiedSports[0]) || 'Badminton';
        return playerSport === filterSport || (item.managedSports && item.managedSports.includes(filterSport));
      });
    }
    
    if (filterSkill !== 'All') {
      result = result.filter(item => {
        const playerSkill = item.skillLevel || item.level || 'Intermediate';
        return playerSkill === filterSkill;
      });
    }
    
    if (filterLocation) {
      const query = filterLocation.toLowerCase();
      result = result.filter(item => 
        item.city?.toLowerCase().includes(query) || 
        item.location?.toLowerCase().includes(query)
      );
    }
    
    return result;
  }, [role, user?.id, mySports, allPlayers, playerSearchQuery, filterSport, filterSkill, filterLocation]);

  // 🎯 [PHASE 1.2] Auto-suggest opponents based on city, skill, and sport
  const suggestedOpponents = React.useMemo(() => {
    if (role !== 'user' || playerSearchQuery) return []; // Only show for players, hide during search
    return getSuggestedOpponents(user, allPlayers, matchmaking, 3);
  }, [role, user, allPlayers, matchmaking, playerSearchQuery]);

  const renderSuggestedHeader = useCallback(() => {
    if (suggestedOpponents.length === 0) return null;
    return (
      <View style={styles.suggestedSection}>
        <View style={styles.suggestedHeader}>
          <View style={styles.suggestedBadge}>
            <Ionicons name="sparkles" size={14} color="#F59E0B" />
            <Text style={styles.suggestedTitle}>Suggested for You</Text>
          </View>
          <Text style={styles.suggestedSubtitle}>Based on your city, skill level & sport</Text>
        </View>
        {suggestedOpponents.map((item) => {
          const isSent = sentRequests.some(r => r.receiverId === item.id);
          const reason = getSuggestionReason(user, item);
          return (
            <View key={`suggest-${item.id}`}>
              <OpponentCard 
                item={item} 
                role={role} 
                isSent={isSent} 
                onChallenge={handleChallenge} 
                styles={styles} 
              />
              <View style={styles.suggestionReasonRow}>
                <Text style={styles.suggestionReasonText}>{reason}</Text>
              </View>
            </View>
          );
        })}
        <View style={styles.suggestedDivider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>All Players</Text>
          <View style={styles.dividerLine} />
        </View>
      </View>
    );
  }, [suggestedOpponents, sentRequests, role, user, handleChallenge]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <Text style={styles.title}>{role === 'coach' ? 'Coach Bookings' : (role === 'academy' ? 'Academy Matchmaking' : 'Matchmaking')}</Text>
        <View style={{ position: 'relative' }}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={styles.tabsContainer}
            scrollEventThrottle={16}
            onLayout={(e) => {
              scrollViewWidthRef.current = e.nativeEvent.layout.width;
            }}
            onContentSizeChange={(w, h) => {
              setShowRightArrow(w > scrollViewWidthRef.current + 5);
            }}
            onScroll={(e) => {
              const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
              setShowRightArrow(layoutMeasurement.width + contentOffset.x < contentSize.width - 5);
            }}
          >
            <View style={styles.tabs}>
             {(role === 'coach' ? ['Bookings', 'Accepted', 'Expired', 'History'] : ['Challenge', 'Partners', 'Requests', 'Accepted', 'Expired', 'History']).map((tab, index) => (
               <TouchableOpacity
                 testID={`matchmaking.tab.${tab}`}
                 key={`tab-${index}`}
                 style={[styles.tab, activeTab === tab && styles.activeTab]}
                 onPress={() => handleTabChange(tab)}
               >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
                    {tab === 'Requests' && receivedRequests.filter(r => r.isNew).length > 0 && (
                      <View testID="matchmaking.tab.requests.badge" style={styles.tabBadge}>
                        <Text style={styles.tabBadgeText}>{receivedRequests.filter(r => r.isNew).length}</Text>
                      </View>
                    )}
                    {tab === 'Bookings' && receivedRequests.filter(r => r.isNew).length > 0 && role === 'coach' && (
                      <View testID="matchmaking.tab.bookings.badge" style={styles.tabBadge}>
                        <Text style={styles.tabBadgeText}>{receivedRequests.filter(r => r.isNew).length}</Text>
                      </View>
                    )}
                    {tab === 'Expired' && expiredRequests.filter(r => !r.isExpiredRead).length > 0 && (
                      <View testID="matchmaking.tab.expired.badge" style={styles.tabBadge}>
                        <Text style={styles.tabBadgeText}>{expiredRequests.filter(r => !r.isExpiredRead).length}</Text>
                      </View>
                    )}
                  </View>
               </TouchableOpacity>
             ))}
            </View>
          </ScrollView>
          {showRightArrow && (
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)', '#FFFFFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.rightScrollIndicator}
              pointerEvents="none"
            >
              <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
            </LinearGradient>
          )}
        </View>
      </View>
      
      {activeTab === 'Challenge' && role !== 'coach' && (
        <View style={styles.filtersWrapper}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#94A3B8" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search players by name or username..."
              value={playerSearchQuery}
              onChangeText={setPlayerSearchQuery}
              placeholderTextColor="#94A3B8"
            />
            {playerSearchQuery !== '' && (
              <TouchableOpacity onPress={() => setPlayerSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.dropdownsRow}>
            <FilterDropdown 
              label="Sport" 
              options={['All', 'Badminton', 'Table Tennis', 'Cricket', 'Football']} 
              selectedValue={filterSport} 
              onSelect={setFilterSport} 
              styles={styles}
            />
            <FilterDropdown 
              label="Skill Level" 
              options={['All', ...Object.values(SkillLevel)]} 
              selectedValue={filterSkill} 
              onSelect={setFilterSkill} 
              styles={styles}
            />
          </View>

          <View style={[styles.searchContainer, { marginTop: 0, marginBottom: 10 }]}>
            <Ionicons name="location-outline" size={20} color="#94A3B8" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Filter by city or location..."
              value={filterLocation}
              onChangeText={setFilterLocation}
              placeholderTextColor="#94A3B8"
            />
            {filterLocation !== '' && (
              <TouchableOpacity onPress={() => setFilterLocation('')}>
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {(activeTab === 'Challenge' && role !== 'coach') && (
        <View style={{ flex: 1 }}>
          <FlashList
            data={filteredOpponents}
            renderItem={renderOpponent}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={renderSuggestedHeader}
            ListEmptyComponent={<Text style={styles.emptyText}>No Matching {role === 'academy' ? 'Academies' : 'Players'} Found Near You</Text>}
            estimatedItemSize={100}
          />
        </View>
      )}
      {activeTab === 'Partners' && (
        <View style={{ flex: 1 }}>
          <DoublesPartnerBoard
            requests={partnerRequests || []}
            user={user}
            onAddRequest={(req) => onUpdatePartnerRequests(req)}
            onRemoveRequest={(id) => onUpdatePartnerRequests({ id, status: 'deleted' })}
            routeParams={route?.params}
          />
        </View>
      )}
      {(activeTab === 'Requests' || (role === 'coach' && activeTab === 'Bookings')) && renderRequested()}
      {activeTab === 'Accepted' && renderAccepted()}
      {activeTab === 'Expired' && renderExpired()}
      {activeTab === 'History' && renderHistory()}

      {/* Challenge Propose Modal */}
      <Modal visible={isChallengeModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalLabel}>PROPOSE CHALLENGE</Text>
                <Text style={styles.modalTitle}>{selectedOpponent?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setIsChallengeModalVisible(false)} style={styles.modalClose}>
                <Ionicons name="close" size={28} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Pressable onPress={() => { if (expandedSlot) setExpandedSlot(null); }}>
                <Text style={styles.sectionLabel}>Select Sport</Text>
              <View style={styles.sportGrid}>
                {selectedOpponent && getCommonSports(selectedOpponent).map((s, index) => {
                  const isPreferred = s === getUserPreferredSport();
                  return (
                    <TouchableOpacity
                      key={`sport-${index}`}
                      style={[styles.sportTag, selectedSport === s && styles.sportTagActive]}
                      onPress={() => setSelectedSport(s)}
                    >
                      <Text style={[styles.sportTagText, selectedSport === s && styles.sportTagTextActive]}>
                        {s} {isPreferred ? '⭐' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>Select Date</Text>
              <View style={styles.calendarContainer}>
                 <Calendar
                   minDate={new Date().toISOString().split('T')[0]}
                   onDayPress={(day) => {
                      setChallengeDate(day.dateString);
                    }}
                   markedDates={challengeMarkedDates}
                   theme={{
                     todayTextColor: '#6366F1',
                     selectedDayBackgroundColor: '#6366F1',
                     arrowColor: '#6366F1',
                     textDayFontSize: 13,
                     textMonthFontSize: 14,
                     textDayHeaderFontSize: 12,
                   }}
                 />
              </View>

              <Text style={styles.sectionLabel}>Proposed Time</Text>
              <View style={styles.timeSlots}>
                  {TIME_SLOTS.map((slot, index) => {
                    const isBlocked = isTimeSlotBlocked(challengeDate, slot, selectedOpponent?.id);
                    const isInPast = isTimeInPast(challengeDate, slot);
                    const isExpanded = expandedSlot === slot;
                    const slotHour = slot.split(':')[0];
                    const slotAmPm = slot.slice(-2);
                    const isSelBase = challengeTime && challengeTime.split(':')[0] === slotHour && challengeTime.slice(-2) === slotAmPm;
                    
                    return (
                      <TimeSlotItem 
                        key={`slot-challenge-${index}`}
                        index={index}
                        slot={slot}
                        isBlocked={isBlocked}
                        isInPast={isInPast}
                        isSelBase={isSelBase}
                        isExpanded={isExpanded}
                        onExpand={setExpandedSlot}
                        onSelect={Object.assign((time) => {
                          setChallengeTime(time);
                          setExpandedSlot(null);
                        }, { targetTime: challengeTime })}
                        styles={styles}
                      />
                    );
                  })}
              </View>

              <Text style={styles.sectionLabel}>Proposed Venue</Text>
              <View style={styles.venueSection}>
                {isFetchingVenues ? (
                  <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>Fetching Nearby Venues...</Text>
                  </View>
                ) : nearbyVenues.length > 0 ? (
                  <View style={styles.venueDropdownContainer}>
                     <View style={styles.venueDropdownSearchBox}>
                       <Ionicons name="search" size={16} color="#94A3B8" />
                       <TextInput 
                         style={styles.venueDropdownSearchInput}
                         placeholder="Search fetched venues..."
                         value={venueDropdownSearchQuery}
                         onChangeText={setVenueDropdownSearchQuery}
                         placeholderTextColor="#94A3B8"
                       />
                       {venueDropdownSearchQuery !== '' && (
                         <TouchableOpacity onPress={() => setVenueDropdownSearchQuery('')}>
                           <Ionicons name="close-circle" size={16} color="#94A3B8" />
                         </TouchableOpacity>
                       )}
                     </View>
                     <ScrollView style={[styles.venueList, { height: 200 }]} nestedScrollEnabled={true}>
                        {nearbyVenues
                            .filter(v => {
                               const q = (venueDropdownSearchQuery || "").toLowerCase();
                               const matchesSearch = (v.venueName?.toLowerCase() || "").includes(q) || 
                                                    (v.area?.toLowerCase() || "").includes(q) || 
                                                    (v.sport?.toLowerCase() || "").includes(q);
                               
                               const targetSport = (selectedSport || 'All').toLowerCase();
                               const matchesSport = (v.sport?.toLowerCase() || "").includes(targetSport) || v.sport === "" || !v.sport;
                               
                               return matchesSearch && matchesSport;
                            })
                          .slice(0, 15) // Performance: Limit rendered venues
                          .map((venue, idx) => (
                            <VenueItem 
                              key={`venue-${idx}`}
                              venue={venue}
                              isSelected={selectedAcademyForVenue?.venueName === venue.venueName}
                              selectedSport={selectedSport}
                              onSelect={setSelectedAcademyForVenue}
                              styles={styles}
                            />
                        ))}
                     </ScrollView>
                  </View>
                ) : (
                  <View style={styles.emptyVenueContainer}>
                    <Text style={styles.emptyVenueText}>No Local Venues Found Matching Your Search</Text>
                  </View>
                )}
              </View>

              <View style={styles.upcomingChallengesSection}>
                <Text style={styles.sectionLabel}>Upcoming Challenges</Text>
                {matchmaking.filter(m => {
                  const mDate = m.proposedDate || m.time?.split(',')[0]?.trim();
                  const mTime = m.proposedTime || m.time?.split(',')[1]?.trim();
                  return ((m.senderId === user?.id && m.receiverId === selectedOpponent?.id) ||
                         (m.senderId === selectedOpponent?.id && m.receiverId === user?.id)) &&
                        (m.status === 'Pending' || m.status === 'Accepted') &&
                        (!challengeDate || mDate === challengeDate) &&
                        !isTimeInPast(mDate, mTime);
                }).length === 0 ? (
                  <Text style={styles.emptyUpcomingText}>
                    {challengeDate ? `No Challenges For ${challengeDate}` : 'No Upcoming Challenges With This Player'}
                  </Text>
                ) : (
                  matchmaking.filter(m => {
                    const mDate = m.proposedDate || m.time?.split(',')[0]?.trim();
                    const mTime = m.proposedTime || m.time?.split(',')[1]?.trim();
                    return ((m.senderId === user?.id && m.receiverId === selectedOpponent?.id) ||
                           (m.senderId === selectedOpponent?.id && m.receiverId === user?.id)) &&
                          (m.status === 'Pending' || m.status === 'Accepted') &&
                          (!challengeDate || mDate === challengeDate) &&
                          !isTimeInPast(mDate, mTime);
                  }).sort((a, b) => new Date(a.proposedDate || a.time?.split(',')[0]) - new Date(b.proposedDate || b.time?.split(',')[0]))
                   .map((m, idx) => (
                    <View key={`upcoming-${idx}`} style={styles.upcomingChallengeRow}>
                      <View style={styles.challengeMeta}>
                        <Text style={styles.challengeTimeText}>
                          {m.proposedTime || m.time?.split(',')[1]?.trim() || 'TBD'}
                        </Text>
                        <Text style={styles.challengeDateText}>
                          {m.proposedDate || m.time?.split(',')[0]?.trim()}
                        </Text>
                      </View>
                      <View style={styles.challengeInfoMain}>
                        <View>
                          <Text style={styles.challengeOpponentText}>{role === 'coach' ? 'Booked by ' : 'vs '}{getOpponentName(m)}</Text>
                          <Text style={styles.challengeSportText}>{m.sport}</Text>
                        </View>
                        <View style={[
                          styles.statusBadge, 
                          { backgroundColor: m.status === 'Accepted' ? '#DCFCE7' : '#FEF3C7' }
                        ]}>
                          <Text style={[
                            styles.statusBadgeText, 
                            { color: m.status === 'Accepted' ? '#16A34A' : '#D97706' }
                          ]}>{m.status}</Text>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>

              <TouchableOpacity 
                testID="matchmaking.challenge.submit"
                style={styles.confirmBtn} 
                onPress={confirmChallenge}
              >
                <Text style={styles.confirmBtnText}>Send Challenge Request</Text>
                <Ionicons name="paper-plane" size={18} color="#fff" style={{ marginLeft: 10 }} />
              </TouchableOpacity>
              <View style={{ height: 40 }} />
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Booking Details Modal */}
      <Modal visible={isDetailsModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: 'auto', paddingBottom: 40 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalLabel}>{role === 'coach' ? 'BOOKING DETAILS' : 'CHALLENGE DETAILS'}</Text>
                <Text style={styles.modalTitle}>{getOpponentName(selectedChallenge)}</Text>
              </View>
              <TouchableOpacity onPress={() => setIsDetailsModalVisible(false)} style={styles.modalClose}>
                <Ionicons name="close" size={28} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <View style={styles.detailsGrid}>
               <View style={styles.detailItem}>
                 <Ionicons name="trophy-outline" size={20} color="#6366F1" />
                 <View>
                   <Text style={styles.detailLabel}>Sport</Text>
                   <Text style={styles.detailValue}>{selectedChallenge?.sport}</Text>
                 </View>
               </View>
               <View style={styles.detailItem}>
                 <Ionicons name="calendar-outline" size={20} color="#6366F1" />
                 <View>
                   <Text style={styles.detailLabel}>Date</Text>
                   <Text style={styles.detailValue}>{selectedChallenge?.proposedDate || selectedChallenge?.time?.split(',')[0]}</Text>
                 </View>
               </View>
               <View style={styles.detailItem}>
                 <Ionicons name="time-outline" size={20} color="#6366F1" />
                 <View>
                   <Text style={styles.detailLabel}>Time</Text>
                   <Text style={styles.detailValue}>{selectedChallenge?.proposedTime || selectedChallenge?.time?.split(',')[1]}</Text>
                 </View>
               </View>
               <View style={styles.detailItem}>
                 <Ionicons name="location-outline" size={20} color="#6366F1" />
                 <View>
                   <Text style={styles.detailLabel}>Location</Text>
                   <Text style={styles.detailValue}>{selectedChallenge?.location || selectedChallenge?.dist || 'Local Arena'}</Text>
                 </View>
               </View>
                <View style={styles.detailItem}>
                 <Ionicons name="call-outline" size={20} color="#6366F1" />
                 <View>
                   <Text style={styles.detailLabel}>Contact</Text>
                   <Text style={styles.detailValue}>{selectedChallenge?.phone || '+91 1234567890'}</Text>
                 </View>
               </View>

                {/* Only show negotiation details if NOT yet accepted */}
                {selectedChallenge?.status !== 'Accepted' && (
                    <>
                        {selectedChallenge?.hasUserResponse && (
                            <View style={[styles.detailItem, { width: '100%', backgroundColor: '#EEF2FF', borderColor: '#6366F1', borderWidth: 1 }]}>
                                <Ionicons name="chatbubble-ellipses-outline" size={20} color="#6366F1" />
                                <View>
                                    <Text style={[styles.detailLabel, { color: '#6366F1' }]}>
                                        {selectedChallenge?.userResponseStatus === 'Accepted' ? 'Response Status' : "Opponent's Preferred Slot"}
                                    </Text>
                                    <Text style={styles.detailValue}>
                                        {selectedChallenge?.userResponseStatus === 'Accepted' 
                                            ? 'User accepted your proposal' 
                                            : `${selectedChallenge.userProposedDate} at ${selectedChallenge.userProposedTime}`}
                                    </Text>
                                </View>
                            </View>
                        )}
                        {selectedChallenge?.status === 'Countered' && (
                            <>
                                <View style={[styles.detailItem, { width: '100%', backgroundColor: '#FFFBEB', borderColor: '#F59E0B', borderWidth: 1, marginTop: 10 }]}>
                                    <Ionicons name="calendar-outline" size={20} color="#D97706" />
                                    <View>
                                        <Text style={[styles.detailLabel, { color: '#D97706' }]}>Original Challenger's Slot</Text>
                                        <Text style={styles.detailValue}>
                                            {selectedChallenge.originalChallengerDate || selectedChallenge.proposedDate} at {selectedChallenge.originalChallengerTime || selectedChallenge.proposedTime}
                                        </Text>
                                    </View>
                                </View>
                                <View style={[styles.detailItem, { width: '100%', backgroundColor: '#F0FDF4', borderColor: '#22C55E', borderWidth: 1, marginTop: 10 }]}>
                                    <Ionicons name="send-outline" size={20} color="#16A34A" />
                                    <View>
                                        <Text style={[styles.detailLabel, { color: '#16A34A' }]}>Your Last Counter</Text>
                                        <Text style={styles.detailValue}>
                                            {selectedChallenge.myCounterDate || selectedChallenge.proposedDate} at {selectedChallenge.myCounterTime || selectedChallenge.proposedTime} • {selectedChallenge.location}
                                        </Text>
                                    </View>
                                </View>
                                {selectedChallenge.counterComment && (
                                    <View style={[styles.detailItem, { width: '100%', backgroundColor: '#F8FAFC', borderColor: '#CBD5E1', borderWidth: 1, marginTop: 10 }]}>
                                        <Ionicons name="chatbox-outline" size={20} color="#64748B" />
                                        <View>
                                            <Text style={[styles.detailLabel, { color: '#64748B' }]}>Counter Note</Text>
                                            <Text style={styles.detailValue}>{selectedChallenge.counterComment}</Text>
                                        </View>
                                    </View>
                                )}
                            </>
                        )}
                    </>
                )}
            </View>

            <View style={styles.modalActionRow}>
              {receivedRequests.some(r => r.id === selectedChallenge?.id) && (
                <>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#F1F5F9' }]}
                    onPress={() => handleCounter(selectedChallenge)}
                  >
                    <Text style={[styles.actionBtnText, { color: '#0F172A' }]}>Counter Proposal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#22C55E' }]}
                    onPress={() => {
                      handleAcceptChallenge(selectedChallenge);
                      setIsDetailsModalVisible(false);
                    }}
                  >
                    <Text style={styles.actionBtnText}>{role === 'coach' ? 'Confirm' : 'Accept Match'}</Text>
                  </TouchableOpacity>
                </>
              )}
              {role !== 'coach' && sentRequests.some(r => r.id === selectedChallenge?.id && r.status === 'Countered') && (
                <>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#F1F5F9' }]}
                    onPress={() => handleCounter(selectedChallenge)}
                  >
                    <Text style={[styles.actionBtnText, { color: '#0F172A' }]}>Counter Again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#22C55E' }]}
                    onPress={() => {
                      handleAcceptCountered(selectedChallenge);
                      setIsDetailsModalVisible(false);
                    }}
                  >
                    <Text style={styles.actionBtnText}>Accept Match</Text>
                  </TouchableOpacity>
                </>
              )}
              {role === 'coach' && sentRequests.some(r => r.id === selectedChallenge?.id) && (
                <>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#F1F5F9' }]}
                    onPress={() => handleCounter(selectedChallenge)}
                  >
                    <Text style={[styles.actionBtnText, { color: '#0F172A' }]}>Counter Again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: selectedChallenge?.hasUserResponse ? '#22C55E' : '#F1F5F9' }]}
                    onPress={() => {
                        if (selectedChallenge?.hasUserResponse) {
                            handleConfirmBooking(selectedChallenge);
                            setIsDetailsModalVisible(false);
                        }
                    }}
                  >
                    <Text style={[styles.actionBtnText, { color: selectedChallenge?.hasUserResponse ? '#fff' : '#94A3B8' }]}>Confirm Booking</Text>
                  </TouchableOpacity>
                </>
              )}
              {selectedChallenge?.status === 'Accepted' && (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#22C55E' }]}
                    onPress={() => setReportScoreMatch(selectedChallenge)}
                  >
                    <Text style={styles.actionBtnText}>Report Score</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#EF4444' }]}
                    onPress={() => handleCancelBooking(selectedChallenge)}
                  >
                    <Text style={[styles.actionBtnText, { color: '#B91C1C' }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
              {selectedChallenge?.status === 'Completed' && (
                <View style={[styles.detailItem, { width: '100%', backgroundColor: '#F0FDF4' }]}>
                   <Ionicons name="checkmark-done-circle" size={24} color="#16A34A" />
                   <View>
                     <Text style={[styles.detailLabel, { color: '#16A34A' }]}>Final Result</Text>
                     <Text style={styles.detailValue}>{selectedChallenge.resultText}</Text>
                   </View>
                </View>
              )}
            </View>

            <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9', marginTop: 10 }]} onPress={() => setIsDetailsModalVisible(false)}>
              <Text style={[styles.confirmBtnText, { color: '#64748B' }]}>Close Details</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* Counter Proposal Modal */}
      <Modal visible={isCounterModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalLabel}>COUNTER PROPOSAL</Text>
                <Text style={styles.modalTitle}>{getOpponentName(selectedChallenge)}</Text>
              </View>
              <TouchableOpacity onPress={() => setIsCounterModalVisible(false)} style={styles.modalClose}>
                <Ionicons name="close" size={28} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Pressable onPress={() => { if (expandedSlot) setExpandedSlot(null); }}>
                <Text style={styles.sectionLabel}>Proposed Date</Text>
              <View style={styles.calendarContainer}>
                 <Calendar
                   minDate={new Date().toISOString().split('T')[0]}
                   onDayPress={(day) => {
                      setCounterDate(day.dateString);
                    }}
                   markedDates={counterMarkedDates}
                    theme={{ todayTextColor: '#6366F1', selectedDayBackgroundColor: '#6366F1', textDayFontSize: 13 }}
                 />
              </View>

              <Text style={styles.sectionLabel}>Proposed Time</Text>
              <View style={styles.timeSlots}>
                  {TIME_SLOTS.map((slot, index) => {
                    const isBlocked = isTimeSlotBlocked(counterDate, slot, selectedChallenge?.academyId);
                    const isInPast = isTimeInPast(counterDate, slot);
                    const isExpanded = expandedSlot === slot;
                    const slotHour = slot.split(':')[0];
                    const slotAmPm = slot.slice(-2);
                    const isSelBase = counterTime && counterTime.split(':')[0] === slotHour && counterTime.slice(-2) === slotAmPm;
                    
                    return (
                      <TimeSlotItem 
                        key={`slot-counter-${index}`}
                        index={index}
                        slot={slot}
                        isBlocked={isBlocked}
                        isInPast={isInPast}
                        isSelBase={isSelBase}
                        isExpanded={isExpanded}
                        onExpand={setExpandedSlot}
                        onSelect={Object.assign((time) => {
                          setCounterTime(time);
                          setExpandedSlot(null);
                        }, { targetTime: counterTime })}
                        styles={styles}
                      />
                    );
                  })}
              </View>

              <Text style={styles.sectionLabel}>Proposed Venue</Text>
              {role === 'coach' ? (
                <View style={styles.venueSearchContainer}>
                    <View style={styles.searchBox}>
                      <Ionicons name="search" size={20} color="#94A3B8" />
                      <TextInput 
                        style={styles.searchInput}
                        placeholder="Find an available academy..."
                        value={venueSearchQuery}
                        onChangeText={setVenueSearchQuery}
                      />
                    </View>
                    <ScrollView style={styles.venueResults} nestedScrollEnabled>
                        {MOCK_ACADEMIES.filter(a => {
                          const matchesSearch = a.name.toLowerCase().includes(venueSearchQuery.toLowerCase());
                          const supportsSport = a.managedSports?.includes(selectedChallenge?.sport);
                          return matchesSearch && supportsSport;
                        }).map((academy, index) => {
                            const isBusy = isTimeSlotBlocked(counterDate, counterTime, academy.id);
                            const isSelected = selectedAcademyForVenue?.id === academy.id;
                            const nextSlot = isBusy ? getNextAvailableSlot(counterDate, counterTime, academy.id) : null;

                            return (
                                <TouchableOpacity 
                                  key={academy.id}
                                  disabled={isBusy}
                                  style={[
                                      styles.venueResultItem, 
                                      isSelected && styles.venueResultSelected,
                                      isBusy && { opacity: 0.6 }
                                  ]}
                                  onPress={() => setSelectedAcademyForVenue(academy)}
                                >
                                    <View>
                                        <Text style={[styles.venueName, isBusy && { color: '#94A3B8' }]}>{academy.name}</Text>
                                        <Text style={styles.venueLoc}>{academy.level} • {academy.dist}</Text>
                                        {isBusy && (
                                            <Text style={styles.busyLabel}>Blocked • Next: {nextSlot}</Text>
                                        )}
                                    </View>
                                    {isSelected && <Ionicons name="checkmark-circle" size={20} color="#6366F1" />}
                                    {isBusy && <Ionicons name="time-outline" size={20} color="#94A3B8" />}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
              ) : (
                <View style={styles.venueSection}>
                  {isFetchingVenues ? (
                    <View style={styles.loadingContainer}>
                      <Text style={styles.loadingText}>Fetching Nearby Venues...</Text>
                    </View>
                  ) : nearbyVenues.length > 0 ? (
                    <View style={styles.venueDropdownContainer}>
                      <View style={styles.venueDropdownSearchBox}>
                        <Ionicons name="search" size={16} color="#94A3B8" />
                        <TextInput 
                          style={styles.venueDropdownSearchInput}
                          placeholder="Search Fetched Venues..."
                          value={venueDropdownSearchQuery}
                          onChangeText={setVenueDropdownSearchQuery}
                          placeholderTextColor="#94A3B8"
                        />
                        {venueDropdownSearchQuery !== '' && (
                          <TouchableOpacity onPress={() => setVenueDropdownSearchQuery('')}>
                            <Ionicons name="close-circle" size={16} color="#94A3B8" />
                          </TouchableOpacity>
                        )}
                      </View>
                      <ScrollView style={[styles.venueList, { height: 200 }]} nestedScrollEnabled={true}>
                          {nearbyVenues
                            .filter(v => {
                               const q = (venueDropdownSearchQuery || "").toLowerCase();
                               const matchesSearch = (v.venueName?.toLowerCase() || "").includes(q) || 
                                                    (v.area?.toLowerCase() || "").includes(q) || 
                                                    (v.sport?.toLowerCase() || "").includes(q);
                               const targetSport = (selectedChallenge?.sport || 'All').toLowerCase();
                               const matchesSport = (v.sport?.toLowerCase() || "").includes(targetSport) || v.sport === "" || !v.sport;
                               return matchesSearch && matchesSport;
                            })
                            .slice(0, 15) // Performance: Limit rendered venues
                            .map((venue, idx) => (
                             <VenueItem 
                                key={`venue-counter-${idx}`}
                                venue={venue}
                                isSelected={selectedAcademyForVenue?.venueName === venue.venueName}
                                selectedSport={selectedChallenge?.sport}
                                onSelect={setSelectedAcademyForVenue}
                                styles={styles}
                             />
                          ))}
                      </ScrollView>
                   </View>
                  ) : (
                    <View style={styles.emptyVenueContainer}>
                      <Text style={styles.emptyVenueText}>No Local Venues Found Matching Your Search</Text>
                    </View>
                  )}
                </View>
              )}

              <Text style={styles.sectionLabel}>Comment (Optional)</Text>
              <TextInput
                style={[styles.searchInput, { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 14, minHeight: 80, textAlignVertical: 'top', backgroundColor: '#F8FAFC', fontSize: 14, color: '#0F172A' }]}
                placeholder="Add any details or requests for your counter..."
                placeholderTextColor="#94A3B8"
                value={counterComment}
                onChangeText={setCounterComment}
                multiline
                numberOfLines={3}
              />

              <TouchableOpacity style={styles.confirmBtn} onPress={submitCounterProposal}>
                <Text style={styles.confirmBtnText}>Submit Counter proposal</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
      {/* Report Score Modal */}
      <Modal visible={!!reportScoreMatch} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalLabel}>REPORT MATCH SCORE</Text>
                <Text style={styles.modalTitle}>{reportScoreMatch?.sport}</Text>
              </View>
              <TouchableOpacity onPress={() => setReportScoreMatch(null)} style={styles.modalClose}>
                <Ionicons name="close" size={28} color="#0F172A" />
              </TouchableOpacity>
            </View>
            
            <View style={{ marginTop: 20 }}>
              <Text style={styles.sectionLabel}>Game Scores</Text>
              {reportSets.map((set, idx) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
                  <Text style={{ position: 'absolute', left: 0, top: 20, fontSize: 10, fontWeight: '700', color: '#94A3B8', transform: [{rotate: '-90deg'}, {translateX: -15}, {translateY: -15}] }}>SET {idx + 1}</Text>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={styles.detailLabel}>You</Text>
                    <TextInput 
                      style={styles.scoreInput}
                      keyboardType="number-pad"
                      value={String(set.score1)}
                      onChangeText={(val) => {
                        const newSets = [...reportSets];
                        newSets[idx].score1 = parseInt(val) || 0;
                        setReportSets(newSets);
                      }}
                    />
                  </View>
                  <Text style={{ fontSize: 24, fontWeight: '900', color: '#CBD5E1' }}>-</Text>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={styles.detailLabel}>{getOpponentName(reportScoreMatch)}</Text>
                    <TextInput 
                      style={styles.scoreInput}
                      keyboardType="number-pad"
                      value={String(set.score2)}
                      onChangeText={(val) => {
                        const newSets = [...reportSets];
                        newSets[idx].score2 = parseInt(val) || 0;
                        setReportSets(newSets);
                      }}
                    />
                  </View>
                </View>
              ))}
              
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 5, marginBottom: 15 }}>
                {reportSets.length < 5 && (
                  <TouchableOpacity 
                    style={[styles.smallBtn, { backgroundColor: '#EEF2FF' }]}
                    onPress={() => setReportSets([...reportSets, { score1: 0, score2: 0 }])}
                  >
                    <Text style={[styles.smallBtnText, { color: '#6366F1' }]}>+ Add Set</Text>
                  </TouchableOpacity>
                )}
                {reportSets.length > 1 && (
                  <TouchableOpacity 
                    style={[styles.smallBtn, { backgroundColor: '#FEF2F2' }]}
                    onPress={() => setReportSets(reportSets.slice(0, -1))}
                  >
                    <Text style={[styles.smallBtnText, { color: '#EF4444' }]}>- Remove Set</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <TouchableOpacity style={styles.confirmBtn} onPress={submitScoreReport}>
              <Text style={styles.confirmBtnText}>Finalize Match</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}


// Styles extracted to ./matchmaking/MatchmakingScreen.styles.js
