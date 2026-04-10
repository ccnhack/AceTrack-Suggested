import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Modal, TextInput, Alert, ScrollView
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import designSystem from '../theme/designSystem';
import { Sport } from '../types';
import { Calendar } from 'react-native-calendars';
import venuesData from '../data/venues.json';

// Performance: Memoized Sub-components for long list rendering
const TimeSlotItem = React.memo(({ index, slot, isBlocked, isInPast, isSelBase, isExpanded, onExpand, onSelect, expandedSlot }) => {
  const isRightSide = index % 4 >= 2;
  return (
    <View style={[styles.slotWrapper, { zIndex: isExpanded ? 100 : 1 }]}>
      <TouchableOpacity 
        disabled={isBlocked || isInPast}
        style={[
          styles.slotBtn, 
          isSelBase && styles.slotBtnActive,
          (isBlocked || isInPast) && { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0', opacity: 0.5 }
        ]}
        onPress={() => onExpand(isExpanded ? null : slot)}
      >
        <Text style={[
          styles.slotText, 
          isSelBase && styles.slotTextActive,
          isBlocked && { color: '#94A3B8' }
        ]}>{isSelBase ? (onSelect.targetTime || slot) : slot}</Text>
      </TouchableOpacity>

      {isExpanded && !isBlocked && (
        <View style={[styles.subIntervalsPopup, isRightSide ? { left: undefined, right: 0 } : { left: 0 }]}>
           {[':00', ':15', ':30', ':45'].map((mins, subIndex) => {
             const fullTime = slot.replace(':00', mins);
             const isSel = onSelect.targetTime === fullTime;
             return (
               <TouchableOpacity 
                 key={`mins-${subIndex}`}
                 style={[styles.subBtn, isSel && styles.subBtnActive]}
                 onPress={() => onSelect(fullTime)}
               >
                 <Text style={[styles.subBtnText, isSel && styles.subBtnTextActive]}>{fullTime}</Text>
               </TouchableOpacity>
             );
           })}
        </View>
      )}
    </View>
  );
});

const VenueItem = React.memo(({ venue, isSelected, onSelect, selectedSport }) => {
  return (
    <TouchableOpacity 
      style={[styles.venueItem, isSelected && styles.venueItemSelected]}
      onPress={() => onSelect(venue)}
    >
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[styles.venueName, isSelected && styles.venueNameSelected]}>
            {venue.venueName}{venue.area ? ` - ${venue.area}` : ''}
          </Text>
          <Text style={styles.venueDistance}>{venue.distance ? `${venue.distance} km` : ''}</Text>
        </View>
        {venue.sport && <Text style={styles.venueSportText}>({venue.sport})</Text>}
        <Text style={styles.venueAddress} numberOfLines={1}>{venue.address}</Text>
      </View>
      {isSelected && <Ionicons name="checkmark-circle" size={20} color="#6366F1" />}
    </TouchableOpacity>
  );
});


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

const isTimeInPast = (date, timeSlot) => {
  if (!date) return false;
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  if (date < todayStr) return true;
  if (date > todayStr) return false;

  // Same day, check time
  if (!timeSlot) return false;
  const slotMinutes = parseTime(timeSlot);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return slotMinutes <= nowMinutes;
};

export default function MatchmakingScreen({ route, user, matchmaking = [], onUpdateMatchmaking, players = [], sendUserNotification, onManualSync }) {
  
  const lastSyncRef = React.useRef(0);
  const insets = useSafeAreaInsets();

  // REAL-TIME SYNC: Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      // Throttle sync to once every 2 seconds to break potential infinite refocus loops
      if (onManualSync && now - lastSyncRef.current > 2000) {
        console.log("🔄 Matchmaking Screen focused, triggering background sync...");
        lastSyncRef.current = now;
        onManualSync(true); // true = force background sync
      } else if (onManualSync) {
        console.log("⏳ Matchmaking sync throttled (last sync < 2s ago)");
      }
    }, [onManualSync])
  );
  const role = user?.role || 'user';
  const [activeTab, setActiveTab] = useState(route?.params?.initialTab || (role === 'coach' ? 'New Bookings' : 'Challenge')); // Challenge, Requests, Accepted, History
  
  // 🛡️ v2.6.87: Reactively update tab when params change (Fix for deep-linking when screen is already mounted)
  React.useEffect(() => {
    if (route?.params?.initialTab) {
      setActiveTab(route.params.initialTab);
    }
  }, [route?.params?.initialTab]);

  // Derived states from global matchmaking prop
  const sentRequests = React.useMemo(() => 
    (matchmaking || []).filter(m => m.senderId === user?.id && m.status !== 'Accepted' && m.status !== 'Cancelled' && m.status !== 'Declined' && m.status !== 'Countered'),
    [matchmaking, user?.id]
  );
  
  const receivedRequests = React.useMemo(() => 
    (matchmaking || []).filter(m => m.receiverId === user?.id && m.status === 'Pending'),
    [matchmaking, user?.id]
  );

  const counteredRequests = React.useMemo(() => 
    (matchmaking || []).filter(m => (m.senderId === user?.id || m.receiverId === user?.id) && m.status === 'Countered'),
    [matchmaking, user?.id]
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
      return !isTimeInPast(date, time);
    });
  }, [acceptedMatches]);

  const pastMatches = React.useMemo(() => {
    return acceptedMatches.filter(m => {
      const date = m.proposedDate || m.time?.split(',')[0]?.trim();
      const time = m.proposedTime || m.time?.split(',')[1]?.trim();
      return isTimeInPast(date, time);
    });
  }, [acceptedMatches]);

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
         if (mDate) marks[mDate] = { marked: true, dotColor: designSystem.colors.primary };
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
    if (!date || !academyId) return false; // Cannot check without date or academyId
    const slotMinutes = parseTime(timeSlot);
    return MOCK_ACADEMY_TOURNAMENTS.some(t => {
      if (t.date !== date || t.academyId !== academyId) return false;
      const startMinutes = parseTime(t.startTime);
      const endMinutes = startMinutes + t.duration * 60;
      return slotMinutes >= startMinutes && slotMinutes < endMinutes;
    });
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
    const newChallenge = {
      id: `match_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
      senderId: user.id,
      senderName: user.name,
      receiverId: selectedOpponent.id,
      receiverName: selectedOpponent.name,
      name: selectedOpponent.name, // for display compatibility
      image: selectedOpponent.image,
      proposedDate: challengeDate,
      proposedTime: challengeTime,
      sport: selectedSport,
      location: selectedAcademyForVenue ? selectedAcademyForVenue.label : 'Local Arena',
      status: 'Pending',
      timestamp: new Date().toISOString()
    };
    onUpdateMatchmaking([...matchmaking, newChallenge]);
    setIsChallengeModalVisible(false);
    setChallengeDate('');
    setChallengeTime('');
    setTimeout(() => setIsSubmitting(false), 500);
    
    // Send Notification to recipient
    if (sendUserNotification) {
      sendUserNotification(selectedOpponent.id, {
        type: 'challenge',
        title: 'New Match Challenge',
        message: `${user.name} has challenged you to a game of ${selectedSport} on ${challengeDate} at ${challengeTime}.`,
      });
    }

    Alert.alert("Challenge Sent!", `Your request to ${selectedOpponent.name} has been sent.`);
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
            const updated = matchmaking.map(m => m.id === req.id ? { ...m, status: 'Cancelled', lastUpdatedBy: user?.id } : m);
            onUpdateMatchmaking(updated);
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
            const updated = matchmaking.map(m => m.id === req.id ? { ...m, status: 'Declined', lastUpdatedBy: user?.id } : m);
            onUpdateMatchmaking(updated);
            
            // Send Notification to sender
            if (sendUserNotification) {
              sendUserNotification(req.senderId, {
                type: 'challenge',
                title: 'Challenge Declined',
                message: `${user.name} has declined your match challenge for ${req.sport}.`,
              });
            }
            Alert.alert("Challenge Declined", "The request has been removed.");
          }
        }
      ]
    );
  };

  const handleAcceptChallenge = (req) => {
    const oppName = getOpponentName(req);
    const updated = matchmaking.map(m => m.id === req.id ? {
      ...m,
      status: 'Accepted',
      lastUpdatedBy: user.id,
      lastUpdatedByName: user.name,
      time: m.time || `${m.proposedDate}, ${m.proposedTime}`,
      location: m.location || 'Academy Grounds'
    } : m);
    onUpdateMatchmaking(updated);
    
    // Send Notification to sender
    if (sendUserNotification) {
      sendUserNotification(req.senderId, {
        type: 'challenge',
        title: 'Challenge Accepted',
        message: `${user.name} has accepted your match challenge for ${req.sport}!`,
      });
    }

    Alert.alert("Match Accepted", `You have confirmed the match with ${oppName}.`);
  };

  const handleAcceptCountered = (req) => {
    const oppName = getOpponentName(req);
    // Check if the other party has responded to the counter
    if (!req.hasUserResponse) {
      // Other user hasn't responded — confirm with original challenger's slot
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
              const updated = matchmaking.map(m => m.id === req.id ? {
                ...m,
                status: 'Accepted',
                lastUpdatedBy: user.id,
                lastUpdatedByName: user.name,
                proposedDate: origDate,
                proposedTime: origTime,
                time: `${origDate}, ${origTime}`,
                location: req.location || 'Local Arena'
              } : m);
              onUpdateMatchmaking(updated);
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
    const updated = matchmaking.map(m => m.id === req.id ? {
      ...m,
      status: 'Accepted',
      lastUpdatedBy: user.id,
      lastUpdatedByName: user.name,
      proposedDate: finalDate,
      proposedTime: finalTime,
      time: `${finalDate}, ${finalTime}`,
      location: req.location || 'Local Arena'
    } : m);
    onUpdateMatchmaking(updated);
    Alert.alert("Challenge Accepted!", `Match confirmed for ${finalDate} at ${finalTime} with ${oppName}.`);
  };

  const openDetails = (challenge) => {
    setSelectedChallenge(challenge);
    setIsDetailsModalVisible(true);
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
    const selectedVenueName = selectedAcademyForVenue?.label || selectedAcademyForVenue?.name;
    const venueLabel = selectedVenueName 
        ? selectedVenueName 
        : (role === 'coach' ? 'Coach-suggested Venue' : (negotiatedVenue === 'own' ? 'Our Academy Grounds' : (oppName + ' Grounds')));
    
    const counteredItem = {
      ...selectedChallenge,
      originalChallengerDate: selectedChallenge.originalChallengerDate || selectedChallenge.proposedDate || selectedChallenge.time?.split(',')[0]?.trim(),
      originalChallengerTime: selectedChallenge.originalChallengerTime || selectedChallenge.proposedTime || selectedChallenge.time?.split(',')[1]?.trim(),
      proposedDate: counterDate,
      proposedTime: counterTime,
      location: venueLabel,
      myCounterDate: counterDate,
      myCounterTime: counterTime,
      counterComment: counterComment.trim() || null,
      status: 'Countered',
      lastUpdatedBy: user.id,
      lastUpdatedByName: user.name,
      hasUserResponse: false
    };

    const updated = matchmaking.map(m => m.id === counteredItem.id ? counteredItem : m);
    onUpdateMatchmaking(updated);

    setIsCounterModalVisible(false);
    setSelectedChallenge(null);
    setTimeout(() => setIsSubmitting(false), 500);
    Alert.alert("Counter Proposal Sent", `You suggested ${counterDate} at ${counterTime} at ${venueLabel}.`);
  };

  const handleConfirmBooking = (req) => {
    const oppName = getOpponentName(req);
    const updated = matchmaking.map(m => m.id === req.id ? {
      ...m,
      status: 'Accepted',
      lastUpdatedBy: user.id,
      lastUpdatedByName: user.name,
      proposedDate: req.userProposedDate || req.proposedDate,
      proposedTime: req.userProposedTime || req.proposedTime,
      location: req.location || 'Academy Grounds',
      time: `${req.userProposedDate || req.proposedDate}, ${req.userProposedTime || req.proposedTime}`
    } : m);
    onUpdateMatchmaking(updated);
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
            const updated = matchmaking.map(m => m.id === req.id ? { ...m, status: 'Cancelled', lastUpdatedBy: user?.id } : m);
            onUpdateMatchmaking(updated);
            setIsDetailsModalVisible(false);
            Alert.alert("Booking Cancelled", "The booking has been successfully removed.");
          }
        }
      ]
    );
  };

  const renderOpponent = useCallback(({ item }) => {
    const isAcademy = role === 'academy';
    const isSent = sentRequests.some(r => r.id === item.id);

    const imageUri = item.image || item.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name || 'User')}&background=007AFF&color=ffffff`;

    return (
      <View style={styles.card}>
        <Image source={{ uri: imageUri }} style={styles.avatar} />
        <View style={styles.info}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.details}>
            {isAcademy ? (item.managedSports?.join(', ')) : (item.sport || item.certifiedSports?.[0] || 'Badminton')} • {item.skillLevel || item.level || 'Intermediate'}
          </Text>
          <Text style={styles.dist}><Ionicons name="location" size={12} /> {item.city || 'Near You'}</Text>
        </View>
        <TouchableOpacity
          style={[styles.btn, isSent && styles.btnSent]}
          onPress={() => isSent ? null : handleChallenge(item)}
        >
          <Text style={styles.btnText}>{isSent ? 'Requests' : 'Challenge'}</Text>
        </TouchableOpacity>
      </View>
    );
  }, [role, sentRequests, handleChallenge]);

  const renderRequested = () => {
    // counteredRequests is now a top-level memoized state
    const actualSentRequests = sentRequests;

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Sent</Text>
          </View>
          {actualSentRequests.length === 0 && <Text style={styles.emptyText}>No Pending Requests Sent</Text>}
          {actualSentRequests.map((req, index) => (
            <TouchableOpacity key={req.id || `sent-${index}`} style={styles.requestCard} onPress={() => openDetails(req)}>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>{getOpponentName(req)}</Text>
                <Text style={styles.details}>{req.sport} • {req.proposedDate} at {req.proposedTime} • {req.status || 'Pending'}</Text>
              </View>
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.smallBtn} onPress={() => handleCounter(req)}>
                  <Text style={styles.smallBtnText}>Counter</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#FFEEF2' }]} onPress={() => handleCancelChallenge(req)}>
                  <Text style={[styles.smallBtnText, { color: '#E11D48' }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Received Challenges Section */}
        <View style={[styles.section, { marginTop: 25 }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Received</Text>
          </View>
          {receivedRequests.length === 0 ? (
            <Text style={styles.emptyText}>No Requests Received</Text>
          ) : (
            receivedRequests.map((req, index) => (
              <TouchableOpacity key={req.id || `received-${index}`} style={styles.requestCard} onPress={() => openDetails(req)}>
                <View style={styles.info}>
                  <Text style={styles.name}>{getOpponentName(req)}</Text>
                  <Text style={[styles.details, req.status === 'Counter Proposed' && { color: '#D97706' }]}>
                    {req.sport} • {req.time || (req.proposedDate + ' @ ' + req.proposedTime)}
                    {req.status === 'Counter Proposed' ? ' (Negotiating)' : ''}
                  </Text>
                </View>
                <View style={styles.actionRow}>
                  <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#F1F5F9' }]} onPress={() => handleDeclineChallenge(req)}>
                    <Text style={[styles.smallBtnText, { color: '#64748B' }]}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => handleCounter(req)}>
                    <Text style={styles.smallBtnText}>Counter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#22C55E' }]} onPress={() => handleAcceptChallenge(req)}>
                    <Text style={styles.smallBtnText}>{role === 'coach' ? 'Confirm' : 'Accept'}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
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
            <TouchableOpacity key={req.id || `countered-${index}`} style={[styles.requestCard, { borderLeftColor: '#F59E0B' }]} onPress={() => openDetails(req)}>
              <View style={styles.info}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>{getOpponentName(req)}</Text>
                  {req.hasUserResponse && (
                    <View style={styles.responseTag}>
                      <Text style={styles.responseTagText}>USER RESPONDED</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.details}>{req.sport} • {req.proposedDate} at {req.proposedTime} • {req.status}</Text>
              </View>
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.smallBtn} onPress={() => handleCounter(req)}>
                  <Text style={styles.smallBtnText}>Counter</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.smallBtn, { backgroundColor: (role === 'coach' ? (req.hasUserResponse ? '#22C55E' : '#E2E8F0') : '#22C55E') }]} 
                  onPress={() => role === 'coach' ? (req.hasUserResponse ? handleConfirmBooking(req) : null) : handleAcceptCountered(req)}
                >
                  <Text style={[styles.smallBtnText, { color: (role === 'coach' ? (req.hasUserResponse ? '#fff' : '#94A3B8') : '#fff') }]}>
                    {role === 'coach' ? 'Confirm' : 'Accept'}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    );
  };

  const renderAccepted = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      {upcomingMatches.length === 0 && <Text style={styles.emptyText}>No Upcoming Matches Found</Text>}
      {upcomingMatches.map((match, index) => (
        <TouchableOpacity key={match.id || `accepted-${index}`} style={styles.acceptedCard} onPress={() => openDetails(match)}>
          <View style={styles.acceptedHeader}>
             <Ionicons name="calendar" size={20} color={designSystem.colors.primary} />
             <Text style={styles.acceptedTime}>{match.time}</Text>
          </View>
          <Text style={styles.acceptedTitle}>{role === 'coach' ? 'Booked by ' : 'vs '}{getOpponentName(match)}</Text>
          <Text style={styles.acceptedDetail}>{match.sport} • {match.location}</Text>
        </TouchableOpacity>
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
          <TouchableOpacity key={item.id || `history-${index}`} style={styles.historyCard} onPress={() => openDetails(item)}>
            <View>
              <Text style={styles.historyName}>{getOpponentName(item)}</Text>
              <Text style={styles.historyDetail}>{item.sport} • {item.date || item.proposedDate}</Text>
              {item.location && <Text style={styles.historySubDetail}>{item.location}</Text>}
            </View>
          </TouchableOpacity>
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
    
    if (!playerSearchQuery) return base;
    const query = playerSearchQuery.toLowerCase();
    return base.filter(item => 
      item.name?.toLowerCase().includes(query) || 
      item.username?.toLowerCase().includes(query) ||
      item.email?.toLowerCase().includes(query)
    );
  }, [role, user?.id, mySports, allPlayers, playerSearchQuery]);

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 16) }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{role === 'coach' ? 'Coach Bookings' : (role === 'academy' ? 'Academy Matchmaking' : 'Matchmaking')}</Text>
        <View style={styles.tabs}>
           {(role === 'coach' ? ['New Bookings', 'Accepted', 'History'] : ['Challenge', 'Requests', 'Accepted', 'History']).map((tab, index) => (
             <TouchableOpacity
               key={`tab-${index}`}
               style={[styles.tab, activeTab === tab && styles.activeTab]}
               onPress={() => {
                 setActiveTab(tab);
               }}
             >
               <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
             </TouchableOpacity>
           ))}
        </View>
      </View>
      
      {activeTab === 'Challenge' && role !== 'coach' && (
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
      )}

      {(activeTab === 'Challenge' && role !== 'coach') && (
        <FlatList
          data={filteredOpponents}
          renderItem={renderOpponent}
          keyExtractor={item => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No Matching {role === 'academy' ? 'Academies' : 'Players'} Found Near You</Text>}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
        />
      )}
      {(activeTab === 'Requests' || (role === 'coach' && activeTab === 'New Bookings')) && renderRequested()}
      {activeTab === 'Accepted' && renderAccepted()}
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

              <TouchableOpacity style={styles.confirmBtn} onPress={confirmChallenge}>
                <Text style={styles.confirmBtnText}>Send Challenge Request</Text>
                <Ionicons name="paper-plane" size={18} color="#fff" style={{ marginLeft: 10 }} />
              </TouchableOpacity>
              <View style={{ height: 40 }} />
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
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#EF4444' }]}
                    onPress={() => handleCancelBooking(selectedChallenge)}
                  >
                    <Text style={[styles.actionBtnText, { color: '#B91C1C' }]}>Cancel Booking</Text>
                  </TouchableOpacity>
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
                <Text style={styles.modalTitle}>{selectedChallenge?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setIsCounterModalVisible(false)} style={styles.modalClose}>
                <Ionicons name="close" size={28} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
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
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  title: { fontSize: 24, fontWeight: '900', color: designSystem.colors.primary, marginBottom: 15 },
  tabs: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 10, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  activeTab: { backgroundColor: '#fff', elevation: 2 },
  tabText: { fontSize: 12, fontWeight: '600', color: '#666' },
  activeTabText: { color: designSystem.colors.primary },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 15, marginTop: 20 },
  detailItem: { width: '45%', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: '#F8FAFC', borderRadius: 12 },
  detailLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },
  detailValue: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  modalActionRow: { flexDirection: 'row', gap: 12, marginTop: 25 },
  venueSearchContainer: { marginTop: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A', padding: 0 },
  venueResults: { maxHeight: 200, marginTop: 12 },
  venueResultItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 8 },
  venueResultSelected: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  venueName: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  venueLoc: { fontSize: 12, color: '#64748B', marginTop: 2 },
  busyLabel: { fontSize: 11, fontWeight: '700', color: '#EF4444', marginTop: 4 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 12,
    height: 50,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 14, color: '#1E293B', fontWeight: '500' },
  list: { padding: 15 },
  card: { 
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', 
    padding: 15, borderRadius: 12, marginBottom: 12, elevation: 2 
  },
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15 },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: '#333' },
  details: { fontSize: 12, color: '#666', marginTop: 2 },
  dist: { fontSize: 11, color: designSystem.colors.primary, marginTop: 4, fontWeight: '600' },
  btn: { backgroundColor: designSystem.colors.primary, paddingVertical: 8, paddingHorizontal: 15, borderRadius: 8 },
  btnSent: { backgroundColor: '#ccc' },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  tabContent: { flex: 1, padding: 15 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#EF4444' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  responseTag: { backgroundColor: '#F0F9FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#BAE6FD' },
  responseTagText: { fontSize: 9, fontWeight: '900', color: '#0369A1' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1a1a1a' },
  requestCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: designSystem.colors.primary },
  actionRow: { flexDirection: 'row', gap: 10 },
  smallBtn: { backgroundColor: '#f0f0f0', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
  smallBtnText: { fontSize: 12, fontWeight: '700', color: '#333' },
  subTabContainer: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderRadius: 8, padding: 3, marginHorizontal: 15, marginTop: 15, marginBottom: 5 },
  subTab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  activeSubTab: { backgroundColor: '#fff', elevation: 1 },
  subTabText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  activeSubTabText: { color: designSystem.colors.primary },
  acceptedCard: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 12, elevation: 3 },
  acceptedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  acceptedTime: { fontSize: 12, color: '#666', fontWeight: '600' },
  acceptedTitle: { fontSize: 16, fontWeight: '700', color: '#334155', marginBottom: 4 },
  acceptedDetail: { fontSize: 13, color: '#64748B' },
  historyCard: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10, elevation: 2 },
  historyName: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 4 },
  historyDetail: { fontSize: 13, color: '#666' },
  historySubDetail: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  historyResult: { fontSize: 14, fontWeight: '800', color: '#16A34A' },
  emptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 0, fontSize: 13, paddingVertical: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '900' },
  inputLabel: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 8, marginTop: 15 },
  input: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, fontSize: 15 },
  sportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sportTag: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20, backgroundColor: '#f0f0f0' },
  sportTagActive: { backgroundColor: designSystem.colors.primary },
  sportTagText: { fontSize: 13, fontWeight: '600', color: '#666' },
  sportTagTextActive: { color: '#fff' },
  confirmBtn: { backgroundColor: designSystem.colors.primary, padding: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 30 },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  modalLabel: { fontSize: 10, fontWeight: '900', color: '#6366F1', letterSpacing: 2, marginBottom: 4 },
  modalClose: { padding: 4 },
  sectionLabel: { fontSize: 12, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginTop: 25 },
  calendarContainer: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9' },
  timeSlots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  slotWrapper: { width: '23%', position: 'relative' },
  slotBtn: { backgroundColor: '#F1F5F9', paddingVertical: 10, paddingHorizontal: 2, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' },
  slotBtnActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  slotText: { fontSize: 11, fontWeight: '900', color: '#64748B', textAlign: 'center' },
  slotTextActive: { color: '#6366F1' },
  subIntervalsPopup: {
    position: 'absolute',
    top: 55,
    left: 0,
    width: 140,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 10,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    zIndex: 1000,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  subBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  subBtnActive: {
    backgroundColor: '#6366F1',
  },
  subBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  subBtnTextActive: {
    color: '#FFF',
  },
  actionBtn: { flex: 1, paddingVertical: 15, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  venueRow: { flexDirection: 'column', gap: 10 },
  venueBtn: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9', gap: 12 },
  venueBtnActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  venueText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  venueTextActive: { color: '#0F172A' },
  upcomingChallengesSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyUpcomingText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 8,
  },
  upcomingChallengeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  challengeMeta: {
    width: 80,
  },
  challengeTimeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  challengeDateText: {
    fontSize: 10,
    color: '#64748B',
  },
  challengeInfoMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 12,
  },
  challengeOpponentText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  challengeSportText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  // Geoapify Venue Dropdown Styles
  venueSection: {
    marginTop: 10,
    marginBottom: 5,
  },
  venueDropdownContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    maxHeight: 250,
  },
  venueList: {
    padding: 8,
  },
  venueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  venueItemSelected: {
    borderColor: '#6366F1',
    backgroundColor: '#EEF2FF',
  },
  venueName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  venueNameSelected: {
    color: '#6366F1',
  },
  venueAddress: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    maxWidth: 220,
  },
  venueDistance: {
    fontSize: 11,
    fontWeight: '700',
    color: designSystem.colors.primary,
  },
  venueContactText: {
    fontSize: 10,
    color: '#64748B',
  },
  venueSportText: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
    marginTop: 1,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    fontStyle: 'italic',
  },
  emptyVenueContainer: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#FFF1F2',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  emptyVenueText: {
    fontSize: 13,
    color: '#E11D48',
    textAlign: 'center',
    marginBottom: 8,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E11D48',
    textDecorationLine: 'underline',
  },
  venueDropdownSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 10,
  },
  venueDropdownSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    padding: 0,
    fontWeight: '500',
  },
});
