import { styles } from './explore/ExploreStyles';
import React, { useState, useEffect, useMemo, memo } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, Image, 
  StyleSheet, Dimensions, Modal, Alert, ActivityIndicator, TextInput, InteractionManager, Platform, LayoutAnimation
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import * as Location from 'expo-location';
import logger from '../utils/logger';
import TournamentDetailModal from '../components/TournamentDetailModal';
import TournamentCard from '../components/TournamentCard';
import { colors, shadows, typography, borderRadius, spacing } from '../theme/designSystem';
import { isTournamentPast, getVisibleTournaments, formatDateIST, parseTournamentDate } from '../utils/tournamentUtils';
import { PaymentModal } from '../components/ExploreSubComponents';
import { useIsFocused } from '@react-navigation/native';
import { Sport } from '../types';
import SocialFeed from '../components/SocialFeed';
import { generateFeed } from '../utils/feedUtils';
import { useMatchmaking } from '../context/MatchmakingContext';

const { width } = Dimensions.get('window');


const deg2rad = (deg) => deg * (Math.PI / 180);

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  const d = R * c; // Distance in km
  return d.toFixed(1);
};

const CITY_COORDS = {
  'Bangalore': { latitude: 12.9716, longitude: 77.5946 },
  'Mumbai': { latitude: 19.0760, longitude: 72.8777 },
  'Delhi': { latitude: 28.6139, longitude: 77.2090 },
  'Whitefield': { latitude: 12.9698, longitude: 77.7500 },
  'Chennai': { latitude: 13.0827, longitude: 80.2707 },
  'Hyderabad': { latitude: 17.3850, longitude: 78.4867 },
  'Pune': { latitude: 18.5204, longitude: 73.8567 },
};

const POPULAR_CITIES = ['All', ...Object.keys(CITY_COORDS)];

import { useAuth } from '../context/AuthContext';
import { useTournamentsStore } from '../stores';
import { usePlayersStore } from '../stores';
import { useApp } from '../context/AppContext';

const ExploreScreen = ({ navigation, route }) => {
  const { currentUser, userRole, userId } = useAuth();
  const { tournaments, onRegister, onJoinWaitlist, onAssignCoach, onUpdateTournament, reschedulingFrom, onCancelReschedule } = useTournamentsStore();
  const { players } = usePlayersStore();
  const { serverClockOffset } = useApp();
  
  const user = currentUser;
  const userSports = userRole === 'coach' ? (user?.certifiedSports || []) : (user?.preferredSports || []);
  const [sportFilter, setSportFilter] = useState('All');
  const [cityFilter, setCityFilter] = useState('All');
  const [isCityDropdownVisible, setIsCityDropdownVisible] = useState(false);
  const [isCommunityTab, setIsCommunityTab] = useState(false);
  const { matchmaking } = useMatchmaking();
  
  const toggleCityDropdown = () => {
    if (Platform.OS !== 'web') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setIsCityDropdownVisible(!isCityDropdownVisible);
  };

  const handleCitySelect = (item) => {
    if (Platform.OS !== 'web') {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setCityFilter(item); 
    setSelectedHub(item);
    setIsCityDropdownVisible(false); 
    setCitySearch(''); 
  };
  const [citySearch, setCitySearch] = useState('');
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [regPaymentTarget, setRegPaymentTarget] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [isFetchingLoc, setIsFetchingLoc] = useState(false);
  const [selectedHub, setSelectedHub] = useState('All');
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();


  const [initialTournamentId] = useState(() => {
    if (Platform.OS === 'web') {
      const tid = new URLSearchParams(window.location.search).get('tournamentId');
      if (tid) console.log(`[Explore] [INIT] Found tournamentId in URL: ${tid}`);
      return tid;
    }
    return null;
  });

  const [prefillTeamCode, setPrefillTeamCode] = useState('');
  const [removePartnerRequestId, setRemovePartnerRequestId] = useState(null);

  // Handle Deep Linking & Hydration (v2.6.460)
  useEffect(() => {
    const routeTid = route?.params?.selectedTournamentId || route?.params?.openTournamentId;
    const tid = routeTid || initialTournamentId;
    
    if (tid && !selectedTournament) {
      const t = (tournaments || []).find(it => String(it.id) === String(tid));
      if (t) {
        console.log(`[Explore] Restoring tournament ${tid} from URL/Params`);
        
        if (route?.params?.teamCode) {
           setRegPaymentTarget(t);
           setPrefillTeamCode(route.params.teamCode);
           if (route?.params?.removePartnerRequestId) {
             setRemovePartnerRequestId(route.params.removePartnerRequestId);
           }
        } else {
           setSelectedTournament(t);
        }
        
        if (routeTid) navigation.setParams({ selectedTournamentId: null, openTournamentId: null, teamCode: null });
      }
    }
  }, [route?.params?.selectedTournamentId, route?.params?.openTournamentId, route?.params?.teamCode, tournaments?.length, initialTournamentId]);

  // Sync URL when tournament selection changes
  useEffect(() => {
    if (Platform.OS === 'web') {
      const currentUrl = new URL(window.location.href);
      if (selectedTournament) {
        currentUrl.searchParams.set('tournamentId', selectedTournament.id);
      } else {
        currentUrl.searchParams.delete('tournamentId');
      }
      window.history.pushState({}, '', currentUrl.toString());
    }
  }, [selectedTournament?.id]);
  
  // Keep selectedTournament in sync with incoming prop updates (real-time reactivity)
  useEffect(() => {
    if (!selectedTournament) return;
    
    const updated = tournaments.find(t => t.id === selectedTournament.id);
    if (updated) {
      // Optimization: Only update if a meaningful property has changed to prevent unnecessary re-renders
      if (updated.registeredPlayerIds?.length !== selectedTournament.registeredPlayerIds?.length || 
          updated.status !== selectedTournament.status) {
        setSelectedTournament(updated);
      }
    }
  }, [tournaments, selectedTournament?.id]); // Use .id to stabilize dependency

  const handleDetectLocation = async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsCityDropdownVisible(false);
    setIsFetchingLoc(true);
    try {
      // 🧪 DEV GUARD: Skip location requests in development mode to prevent
      // system permission dialogs from blocking automated Detox tests.
      if (__DEV__) {
        console.log('🧪 [TEST_DEBUG] Bypassing location request in ExploreScreen (handleDetectLocation) for automated tests.');
        setIsFetchingLoc(false);
        return;
      }
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (logger?.addLog) {
          logger.addLog('Location permission denied', 'warn', 'console');
        }
        Alert.alert('Permission Denied', 'Please enable location services in your settings to find nearby tournaments.');
        setIsFetchingLoc(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      setUserLocation(location.coords);
      setSelectedHub('Current Location');
      setCityFilter('All'); // Priority: proximity mode
      if (logger?.addLog) {
        logger.addLog(`Location fetched: ${location.coords.latitude}, ${location.coords.longitude}`, 'info', 'console');
      }

      // Find identifying name for the header
      let closestCity = 'All';
      let minDistance = 50; 

      Object.entries(CITY_COORDS).forEach(([cityName, coords]) => {
        const dist = calculateDistance(
          location.coords.latitude,
          location.coords.longitude,
          coords.latitude,
          coords.longitude
        );
        if (dist && parseFloat(dist) < minDistance) {
          minDistance = parseFloat(dist);
          closestCity = cityName;
        }
      });

      // Special handling: if we are in 'Current Location' mode, we might want to show the closest city in header
      if (closestCity !== 'All') {
        setSelectedHub(`Current Location (${closestCity})`);
      }

      if (logger?.logAction) {
        logger.logAction('LOCATION_DETECT_SUCCESS', { 
          coords: location.coords,
          selectedHub: closestCity !== 'All' ? `Current Location (${closestCity})` : 'Current Location'
        });
      }
      setIsFetchingLoc(false);
    } catch (e) {
      Alert.alert('Error', 'Could not detect location.');
    }
  };

  useEffect(() => {
    const fetchLocation = async () => {
      try {
        // 🧪 DEV GUARD: Skip auto-location in development mode to prevent
        // system permission dialogs from blocking automated Detox tests.
        if (__DEV__) {
          console.log('🧪 [TEST_DEBUG] Bypassing auto-location fetch in ExploreScreen for automated tests.');
          return;
        }
        if (!Location || typeof Location.requestForegroundPermissionsAsync !== 'function') {
          console.warn('Location module or required functions not found.');
          return;
        }

        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('Permission to access location was denied');
          return;
        }

        if (typeof Location.getCurrentPositionAsync === 'function') {
          let location = await Location.getCurrentPositionAsync({});
          setUserLocation(location.coords);

          // Auto-select city hub based on proximity for regular users/coaches only
          if (cityFilter === 'All' && userRole !== 'admin') {
            let closestCity = 'All';
            let minDistance = 50; // Threshold of 50km

            Object.entries(CITY_COORDS).forEach(([cityName, coords]) => {
              const dist = calculateDistance(
                location.coords.latitude,
                location.coords.longitude,
                coords.latitude,
                coords.longitude
              );
              if (dist && parseFloat(dist) < minDistance) {
                minDistance = parseFloat(dist);
                closestCity = cityName;
              }
            });

            if (closestCity !== 'All') {
              setCityFilter(closestCity);
              setSelectedHub(closestCity);
              if (logger?.logAction) {
                logger.logAction('LOCATION_AUTO_SELECT', { closestCity, minDistance });
              }
              console.log(`📍 Auto-selected hub: ${closestCity} (${minDistance}km away)`);
            }
          }
        }
      } catch (err) {
        console.warn('Location module error:', err.message);
      }
    };

    const interactionTask = InteractionManager.runAfterInteractions(() => {
       if (isFocused) {
         fetchLocation();
       }
    });

    return () => interactionTask.cancel();
  }, [isFocused]);

  const INITIAL_CITIES = ['All', 'Bangalore', 'Mumbai']; // Only show 3 options initially
  const filteredCities = (citySearch ? POPULAR_CITIES : INITIAL_CITIES).filter(c => c.toLowerCase().includes(citySearch.toLowerCase()));

  const getSportImage = (sport) => {
    switch (sport) {
      case 'Badminton': return "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=1000&auto=format&fit=crop";
      case 'Table Tennis': return "https://images.unsplash.com/photo-1534158914592-062992fbe900?q=80&w=1000&auto=format&fit=crop";
      case 'Cricket': return "https://images.unsplash.com/photo-1531415074968-036ba1b575da?q=80&w=1000&auto=format&fit=crop";
      default: return "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=1000&auto=format&fit=crop";
    }
  };

  const availableSports = userRole === 'coach' && userSports?.length > 0 ? userSports : ['Badminton', 'Table Tennis', 'Cricket', 'Football'];
  const currentPlayer = userId ? (players || []).find(p => p.id === userId) : null;

  const processedTournaments = useMemo(() => {
    const visible = getVisibleTournaments({
      tournaments: tournaments || [],
      userRole,
      userGender: user?.gender,
      userStatus: user?.status,
      userSports,
      cityFilter,
      sportFilter,
      reschedulingFrom,
      now: new Date(Date.now() + (serverClockOffset || 0))
    });

    return (visible || []).map(t => {
      const distance = userLocation && t.lat && t.lng ? calculateDistance(userLocation.latitude, userLocation.longitude, t.lat, t.lng) : null;
      return { ...t, distance: distance ? parseFloat(distance) : 99999 };
    });
  }, [tournaments, userRole, userSports, reschedulingFrom, cityFilter, user?.gender, user?.id, sportFilter, userLocation]);
  const filteredTournaments = processedTournaments;

  const displayTournaments = filteredTournaments;

  // Admin Trace: Log filter results for troubleshooting - STRICTLY THROTTLED & MINIMIZED
  const lastLoggedRef = React.useRef(null);
  const lastLogTimeRef = React.useRef(0);
  React.useEffect(() => {
    if (userRole?.toLowerCase() === 'admin' && tournaments?.length > 0) {
      const now = Date.now();
      const currentConfig = `${cityFilter}-${sportFilter}-${displayTournaments.length}`;
      
      // Throttle: Max one log per 10 seconds AND only if config changed
      if (lastLoggedRef.current !== currentConfig && now - lastLogTimeRef.current > 10000) {
        lastLoggedRef.current = currentConfig;
        lastLogTimeRef.current = now;
        if (logger?.addLog) {
          logger.addLog(`🔍 [Explore] Filter: ${cityFilter}/${sportFilter} (${displayTournaments.length} results)`, 'info', 'console');
        }
      }
    }
  }, [userRole, cityFilter, sportFilter, displayTournaments.length]);

  const sortedTournaments = useMemo(() => {
    const list = [...(displayTournaments || [])];
    return list.sort((a, b) => {
      // Priority sort by distance if user location is available
      if (userLocation && a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      // Fallback: stay consistent with distance but add secondary sorting (e.g. date)
      const dateA = parseTournamentDate(a.date)?.getTime() || 0;
      const dateB = parseTournamentDate(b.date)?.getTime() || 0;
      return dateA - dateB;
    });
  }, [displayTournaments, userLocation]);

  const recommendedTournaments = useMemo(() => {
    return (sortedTournaments || [])
      .filter(t => {
          if (userRole === 'user' && currentPlayer?.trueSkillRating) {
             if (t.skillRange) return currentPlayer.trueSkillRating >= t.skillRange.min && currentPlayer.trueSkillRating <= t.skillRange.max;
          }
          return false;
      }).slice(0, 2);
  }, [sortedTournaments, userRole, currentPlayer]);

  const renderItem = React.useCallback(({ item }) => (
    <TournamentCard 
      tournament={item} 
      onPress={() => setSelectedTournament(item)}
      userId={userId}
      userRole={userRole}
    />
  ), [userId, userRole]);



  const feedData = useMemo(() => {
    return generateFeed(tournaments || [], players || [], matchmaking || [], 20);
  }, [tournaments, players, matchmaking]);

  return (
    <View style={styles.container}>
      <LinearGradient 
        colors={[colors.navy[900], colors.navy[900]]} 
        style={[styles.hero, { paddingTop: Math.max(insets.top, 16) }]}
      >
        <View style={styles.heroContent}>
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.heroTitle, { color: '#FFFFFF', textTransform: 'uppercase' }]}>ACETRACK</Text>
              <Text style={[styles.heroSubtitle, { color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }]}>
                {selectedHub.includes('Current Location') ? 'Nearby Arenas' : `${cityFilter} Circuit`}
              </Text>
            </View>
            <TouchableOpacity 
              testID="explore.city.picker"
              style={[styles.compactCityPicker, isCityDropdownVisible && styles.compactCityPickerActive]} 
              onPress={toggleCityDropdown}
            >
              <Ionicons name="location" size={14} color="#FFFFFF" />
              <Text style={styles.compactCityText} numberOfLines={1}>
                {selectedHub.includes('Current Location') 
                   ? (selectedHub.includes('(') ? selectedHub.split('(')[1].replace(')', '') : 'Current Location') 
                   : (cityFilter === 'All' ? 'India' : cityFilter)
                }
              </Text>
              <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>
        </View>

        {isCityDropdownVisible && (
          <View style={styles.cityDropdown}>
            <View style={styles.dropdownHeader}>
              <Ionicons name="search" size={14} color="#94A3B8" />
              <TextInput 
                testID="explore.city.search.input"
                placeholder="Search city..." 
                placeholderTextColor="#64748B"
                value={citySearch}
                onChangeText={setCitySearch}
                style={styles.dropdownSearchInput}
                autoFocus
              />
            </View>
            <View style={styles.dropdownList}>
              <TouchableOpacity 
                testID="explore.location.detect.button"
                style={styles.currentLocationItem}
                onPress={handleDetectLocation}
              >
                <View style={styles.currentLocationIcon}>
                   <Ionicons name="navigate" size={12} color="#EF4444" />
                </View>
                <Text style={styles.currentLocationText}>Current Location</Text>
              </TouchableOpacity>

              {filteredCities.map((item) => (
                <TouchableOpacity 
                  key={item}
                  style={styles.dropdownItem} 
                  onPress={() => handleCitySelect(item)}
                >
                  <Text style={[styles.dropdownItemText, cityFilter === item && styles.dropdownItemTextActive]}>
                    {item === 'All' ? 'All Locations' : item}
                  </Text>
                  {cityFilter === item && <Ionicons name="checkmark" size={14} color={colors.primary.base} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.sportFilterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sportFilterRow}>
            {['All', ...availableSports].map(sport => (
              <TouchableOpacity 
                testID={`explore.sport.chip.${sport}`}
                key={sport}
                onPress={() => setSportFilter(sport)}
                style={[styles.sportChip, sportFilter === sport && styles.sportChipActive]}
              >
                <Text style={[styles.sportChipText, sportFilter === sport && styles.sportChipTextActive]}>{sport}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={{ flexDirection: 'row', paddingHorizontal: 24, marginTop: 16, gap: 12 }}>
          <TouchableOpacity 
            onPress={() => setIsCommunityTab(false)}
            style={[styles.tabToggleBtn, !isCommunityTab && styles.tabToggleBtnActive]}
          >
            <Text style={[styles.tabToggleText, !isCommunityTab && styles.tabToggleTextActive]}>Tournaments</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setIsCommunityTab(true)}
            style={[styles.tabToggleBtn, isCommunityTab && styles.tabToggleBtnActive]}
          >
            <Text style={[styles.tabToggleText, isCommunityTab && styles.tabToggleTextActive]}>Community</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {isCommunityTab ? (
        <SocialFeed 
          feed={feedData} 
          onTournamentPress={(t) => setSelectedTournament(t)}
        />
      ) : (
        <FlashList
          data={sortedTournaments}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        estimatedItemSize={180}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          sortedTournaments.length > 0 ? (
            <View style={styles.main}>
              {recommendedTournaments.length > 0 && !reschedulingFrom && userRole !== 'coach' && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Recommended for you</Text>
                  {recommendedTournaments.map(t => (
                    <TournamentCard 
                      key={`rec-${t.id}`}
                      tournament={t}
                      isRec={true}
                      onPress={() => setSelectedTournament(t)}
                      userId={userId}
                      userRole={userRole}
                    />
                  ))}
                </View>
              )}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {reschedulingFrom ? 'Pick a new arena' : userRole === 'coach' ? 'Coaching Opportunities' : 'Upcoming Arenas'}
                </Text>
                <View style={styles.liveBadge}>
                  <Text style={styles.liveBadgeText}>Live Slots</Text>
                </View>
              </View>

              {reschedulingFrom && (
                <View style={styles.rescheduleAlert}>
                  <Text style={styles.rescheduleAlertText}>Rescheduling in progress. Please select your new arena below.</Text>
                  <TouchableOpacity onPress={onCancelReschedule} style={styles.cancelBox}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={[styles.main, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="search" size={40} color="#EF4444" />
              </View>
              <Text style={styles.emptySubtext}>
                We couldn't find any active tournaments matching your current filters.
              </Text>
              <View style={styles.emptyFilterFeedback}>
                {cityFilter !== 'All' && (
                  <View style={styles.filterFeedbackChip}>
                    <Ionicons name="location-outline" size={12} color="#64748B" />
                    <Text style={styles.filterFeedbackText}>City: {cityFilter}</Text>
                  </View>
                )}
                {sportFilter !== 'All' && (
                  <View style={styles.filterFeedbackChip}>
                    <Ionicons name="trophy-outline" size={12} color="#64748B" />
                    <Text style={styles.filterFeedbackText}>Sport: {sportFilter}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity 
                style={styles.resetButton}
                onPress={() => {
                  setCityFilter('All');
                  setSportFilter('All');
                  setSelectedHub('All');
                }}
              >
                <Text style={styles.resetButtonText}>Clear All Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />
      )}

      <TournamentDetailModal
        tournament={selectedTournament}
        visible={!!selectedTournament}
        onClose={() => setSelectedTournament(null)}
        user={user}
        role={userRole}
        players={players}
        onRegister={(t) => {
          setSelectedTournament(null);
          setTimeout(() => {
            setRegPaymentTarget(t);
          }, 350); // Delay allows the native Modal to fully dismiss before presenting the next one
        }}
        onJoinWaitlist={onJoinWaitlist}
        onCoachOptIn={(t) => onAssignCoach(t.id, userId)}
        onUpdateTournament={onUpdateTournament}
      />

      <PaymentModal
        regPaymentTarget={regPaymentTarget}
        reschedulingFrom={reschedulingFrom}
        tournaments={tournaments}
        user={user}
        onRegister={onRegister}
        setRegPaymentTarget={setRegPaymentTarget}
        setSelectedTournament={setSelectedTournament}
        styles={styles}
        prefillTeamCode={prefillTeamCode}
        removePartnerRequestId={removePartnerRequestId}
      />
    </View>
  );
};


export default ExploreScreen;
