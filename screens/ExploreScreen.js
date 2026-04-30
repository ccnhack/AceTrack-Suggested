import React, { useState, useEffect, useMemo, memo } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, Image, 
  StyleSheet, Dimensions, FlatList, Modal, Alert, ActivityIndicator, TextInput, InteractionManager, Platform, LayoutAnimation
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import logger from '../utils/logger';
import TournamentDetailModal from '../components/TournamentDetailModal';
import TournamentCard from '../components/TournamentCard';
import GlobalHeader from '../components/GlobalHeader';
import { colors, shadows, typography, borderRadius, spacing } from '../theme/designSystem';
import { isTournamentPast, getVisibleTournaments, formatDateIST } from '../utils/tournamentUtils';
import { useIsFocused } from '@react-navigation/native';
import { Sport } from '../types';

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
import { useTournaments } from '../context/TournamentContext';
import { usePlayers } from '../context/PlayerContext';
import { useApp } from '../context/AppContext';

const ExploreScreen = ({ navigation, route }) => {
  const { currentUser, userRole, userId } = useAuth();
  const { tournaments, onRegister, onJoinWaitlist, onAssignCoach, onUpdateTournament, reschedulingFrom, onCancelReschedule } = useTournaments();
  const { players } = usePlayers();
  const { serverClockOffset } = useApp();
  
  const user = currentUser;
  const userSports = userRole === 'coach' ? (user?.certifiedSports || []) : (user?.preferredSports || []);
  const [sportFilter, setSportFilter] = useState('All');
  const [cityFilter, setCityFilter] = useState('All');
  const [isCityDropdownVisible, setIsCityDropdownVisible] = useState(false);
  
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


  // Handle Deep Linking from ChatBot
  useEffect(() => {
    if (route?.params?.selectedTournamentId) {
      const tid = route.params.selectedTournamentId;
      const t = tournaments.find(it => String(it.id) === String(tid));
      if (t) {
        setSelectedTournament(t);
        // Clear param to avoid re-opening on every render
        navigation.setParams({ selectedTournamentId: null });
      }
    }
  }, [route?.params?.selectedTournamentId, tournaments]);
  
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

  const availableSports = userRole === 'coach' && userSports?.length > 0 ? userSports : Object.values(Sport);
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

  const upcomingUserMatches = useMemo(() => {
    if (!userId) return [];
    return tournaments.filter(t => {
      const isRegistered = (t.registeredPlayerIds || []).some(id => String(id).toLowerCase() === String(userId).toLowerCase());
      const isPending = (t.pendingPaymentPlayerIds || []).some(id => String(id).toLowerCase() === String(userId).toLowerCase());
      return (isRegistered || isPending) && !isTournamentPast(t.date, serverClockOffset);
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [tournaments, userId, serverClockOffset]);

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

  const renderPaymentModal = () => {
    if (!regPaymentTarget) return null;

    const isRescheduling = !!reschedulingFrom;
    const oldT = isRescheduling ? tournaments.find(i => i.id === reschedulingFrom) : null;
    const rescheduleCount = isRescheduling ? (user?.rescheduleCounts?.[reschedulingFrom] || 0) : 0;
    const rescheduleFee = (isRescheduling && rescheduleCount > 0) ? 20 : 0;
    const priceDiff = (isRescheduling && oldT) ? (regPaymentTarget.entryFee - oldT.entryFee) : 0;
    const totalAdjustedCost = isRescheduling ? (priceDiff + rescheduleFee) : regPaymentTarget.entryFee;
    const canPayWithCredits = (user?.credits || 0) >= totalAdjustedCost;

    const finalize = async (method) => {
        try {
            const result = await onRegister(regPaymentTarget, method, totalAdjustedCost, isRescheduling, reschedulingFrom);
            
            if (result && result.success) {
                setRegPaymentTarget(null);
                setSelectedTournament(null);
                
                if (result.type === 'UPI_PENDING') {
                    Alert.alert(
                        "Verification Pending", 
                        "Your registration is being processed. Please share the payment screenshot with the organizer or wait for admin confirmation."
                    );
                } else {
                    Alert.alert("Success", isRescheduling ? "Arena swapped successfully!" : "Registration successful!");
                }
            }
        } catch (e) {
            console.error('[ExploreScreen] Finalize Error:', e);
            // 🛡️ [DIAGNOSTICS] (v2.6.311)
            // Log the error details to the persistent logger for remote debugging
            logger.addLog('error', 'registration_failure', { error: e.message, stack: e.stack, tid: regPaymentTarget?.id });
            Alert.alert("Error", `Could not complete registration: ${e.message || 'Please try again.'}`);
        }
    };

    return (
        <Modal transparent animationType="fade" visible={!!regPaymentTarget}>
            <View style={styles.modalOverlay}>
                <View style={styles.paymentSheet}>
                    <View style={styles.paymentHeader}>
                        <Text style={styles.paymentTitle}>{isRescheduling ? 'Confirm Swap' : 'Select Payment'}</Text>
                        <TouchableOpacity onPress={() => setRegPaymentTarget(null)}>
                            <Ionicons name="close" size={24} color="#0F172A" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.paymentSummary}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text style={[styles.summaryLabel, { flex: 1 }]}>Total Adjustment</Text>
                            <Text style={[styles.summaryLabel, { flex: 1, textAlign: 'right' }]}>Wallet Balance</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <Text 
                                style={[styles.summaryValue, { flex: 1, color: totalAdjustedCost < 0 ? '#16A34A' : '#EF4444' }]}
                                adjustsFontSizeToFit
                                numberOfLines={1}
                            >
                                ₹{Math.abs(totalAdjustedCost)}
                            </Text>
                            <Text 
                                style={[styles.summaryValue, { flex: 1, textAlign: 'right', color: '#334155' }, !canPayWithCredits && totalAdjustedCost > 0 && { color: '#EF4444' }]}
                                adjustsFontSizeToFit
                                numberOfLines={1}
                            >
                                ₹{user?.credits || 0}
                            </Text>
                        </View>
                        {!canPayWithCredits && totalAdjustedCost > 0 && (
                            <Text style={styles.insufficientText}>Insufficient AceTrack credits</Text>
                        )}
                    </View>

                    <View style={styles.paymentActions}>
                        <TouchableOpacity 
                            testID="explore.payment.payBtn"
                            disabled={!canPayWithCredits}
                            onPress={() => finalize('credits')}
                            style={[styles.payBtn, !canPayWithCredits && styles.payBtnDisabled]}
                        >
                            <Text style={[styles.payBtnText, !canPayWithCredits && styles.payBtnTextDisabled]}>Pay with Wallet</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            testID="explore.payment.upiBtn"
                            onPress={() => finalize('upi')}
                            style={[styles.payBtn, { backgroundColor: '#EF4444', marginTop: 12 }]}
                        >
                            <Text style={styles.payBtnText}>Pay with UPI</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => setRegPaymentTarget(null)} style={styles.cancelLink}>
                            <Text style={styles.cancelLinkText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <GlobalHeader title="DASHBOARD" />
      
      <View style={styles.filterSection}>
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

        <Text style={styles.filterSubtitle}>
          {selectedHub.includes('Current Location') ? 'NEARBY ARENAS' : `${cityFilter.toUpperCase()} CIRCUIT`}
        </Text>
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

      <FlatList
        data={sortedTournaments}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.main}>
            {/* Quick Stats Section */}
            {!reschedulingFrom && userRole !== 'coach' && (
              <View style={styles.statsSection}>
                <View style={styles.statCard}>
                  <Text style={styles.statTitle}>WALLET</Text>
                  <Text style={styles.statValue}>₹{currentUser?.credits || 0}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statTitle}>WIN RATE</Text>
                  <Text style={styles.statValue}>{currentUser?.winRate || '0%'}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statTitle}>MATCHES</Text>
                  <Text style={styles.statValue}>{currentUser?.totalMatches || 0}</Text>
                </View>
              </View>
            )}

            {/* Upcoming Matches Slider */}
            {upcomingUserMatches.length > 0 && !reschedulingFrom && (
              <View style={styles.dashboardSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Your Next Arena</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('Matches')}>
                    <Text style={styles.viewAllText}>View All</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false} 
                  contentContainerStyle={styles.upcomingSlider}
                >
                  {upcomingUserMatches.map(match => (
                    <TouchableOpacity 
                      key={`next-${match.id}`} 
                      style={styles.upcomingMatchCard}
                      onPress={() => setSelectedTournament(match)}
                    >
                      <View style={styles.matchCardTop}>
                        <View style={styles.matchSportBadge}>
                          <Text style={styles.matchSportText}>{match.sport}</Text>
                        </View>
                        <Text style={styles.matchDateText}>{formatDateIST(match.date)}</Text>
                      </View>
                      <Text style={styles.matchTitleText} numberOfLines={1}>{match.title}</Text>
                      <View style={styles.matchCardBottom}>
                        <Ionicons name="location" size={12} color={colors.primary.base} />
                        <Text style={styles.matchLocationText} numberOfLines={1}>{match.location}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

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
        contentContainerStyle={[
          { paddingBottom: 40 },
          sortedTournaments.length === 0 && { flexGrow: 1 }
        ]}
      />



      <TournamentDetailModal
        tournament={selectedTournament}
        visible={!!selectedTournament}
        onClose={() => setSelectedTournament(null)}
        user={user}
        role={userRole}
        players={players}
        onRegister={(t) => setRegPaymentTarget(t)}
        onJoinWaitlist={onJoinWaitlist}
        onCoachOptIn={(t) => onAssignCoach(t.id, userId)}
        onUpdateTournament={onUpdateTournament}
      />

      {renderPaymentModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navy[900] },
  filterSection: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: colors.navy[900],
  },
  filterSubtitle: {
    ...typography.micro,
    color: colors.primary.base,
    letterSpacing: 2,
  },
  compactCityPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.glass.medium,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.glass.border,
    gap: 6,
  },
  compactCityPickerActive: { borderColor: colors.primary.base },
  compactCityText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  cityDropdown: { backgroundColor: '#1E293B', borderRadius: 20, marginTop: 8, padding: 12, marginHorizontal: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 15, elevation: 20 },
  dropdownHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.6)', borderRadius: 12, paddingHorizontal: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  dropdownSearchInput: { flex: 1, height: 40, color: '#FFFFFF', fontSize: 13, marginLeft: 8 },
  dropdownList: { gap: 2 },
  currentLocationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.1)',
  },
  currentLocationIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  currentLocationText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#EF4444',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8 },
  dropdownItemText: { fontSize: 14, fontWeight: '700', color: '#94A3B8' },
  dropdownItemTextActive: { color: '#FFFFFF' },
  sportFilterContainer: { paddingLeft: 24, marginTop: 10 },
  sportFilterRow: { flexDirection: 'row' },
  sportChip: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', marginRight: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  sportChipActive: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  sportChipText: { fontSize: 12, color: '#94A3B8', fontWeight: '900', textTransform: 'uppercase' },
  sportChipTextActive: { color: '#fff' },
  main: { paddingBottom: 40 },
  section: { paddingHorizontal: 24, marginTop: 32 },
  sectionHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 24, 
    marginTop: 32,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: -0.5,
  },
  liveBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#22C55E',
    textTransform: 'uppercase',
  },
  
  // New Dashboard Styles
  statsSection: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    marginTop: 8,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.glass.medium,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.glass.border,
    alignItems: 'center',
    gap: 4,
  },
  statTitle: {
    ...typography.micro,
    color: colors.navy[400],
    letterSpacing: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  dashboardSection: {
    marginTop: 8,
    marginBottom: 16,
  },
  viewAllText: {
    ...typography.micro,
    color: colors.primary.base,
    fontWeight: '900',
  },
  upcomingSlider: {
    paddingHorizontal: 24,
    gap: 16,
    paddingBottom: 8,
  },
  upcomingMatchCard: {
    width: width * 0.75,
    backgroundColor: colors.navy[800],
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  matchCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  matchSportBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  matchSportText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#3B82F6',
    textTransform: 'uppercase',
  },
  matchDateText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.navy[400],
  },
  matchTitleText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  matchCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  matchLocationText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.navy[400],
    flex: 1,
  },
  recCard: {
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  recCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  bestMatchBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  bestMatchText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#F87171',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  recCardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    maxWidth: width * 0.6,
  },
  recIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recCardFooter: {
    flexDirection: 'row',
    gap: 16,
  },
  recInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recInfoText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#94A3B8',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    marginBottom: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardCover: {
    height: 192,
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  cardHeaderArea: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardBadges: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingRight: 8,
  },
  levelBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backdropFilter: 'blur(10px)',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
  },
  levelBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    maxWidth: 140,
  },
  locationText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 4,
  },
  cardTitle: {
    position: 'absolute',
    bottom: 16,
    left: 24,
    right: 24,
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 4,
  },
  cardContent: {
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoCol: {
    gap: 2,
  },
  infoLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: '#F1F5F9',
  },
  cardFooter: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  regMessage: {
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: -0.2,
  },
  arrowButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  alertText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2563EB',
    flex: 1,
  },
  rescheduleAlert: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  rescheduleAlertText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#DC2626',
    flex: 1,
  },
  cancelBox: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
  },
  cancelText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#B91C1C',
    textTransform: 'uppercase',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  emptyFilterFeedback: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 32,
  },
  filterFeedbackChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  filterFeedbackText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  resetButton: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  resetButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  paymentSheet: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    borderTopLeftRadius: 48,
    borderTopRightRadius: 48,
    padding: 32,
    paddingBottom: 48,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  paymentTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: -0.5,
  },
  paymentSummary: {
    backgroundColor: '#F8FAFC',
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 32,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -1,
  },
  summaryValueSmall: {
    fontSize: 24,
    fontWeight: '900',
    color: '#334155',
  },
  insufficientText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#EF4444',
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 12,
  },
  paymentActions: {
    gap: 12,
  },
  payBtn: {
    backgroundColor: '#0F172A',
    paddingVertical: 20,
    borderRadius: 24,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  payBtnDisabled: {
    backgroundColor: '#E2E8F0',
    shadowOpacity: 0,
    elevation: 0,
  },
  payBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  payBtnTextDisabled: {
    color: '#94A3B8',
  },
  cancelLink: {
    alignItems: 'center',
    marginTop: 16,
  },
  cancelLinkText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

export default ExploreScreen;
