import React, { useState, useEffect, useMemo, memo } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, Image, 
  StyleSheet, Dimensions, FlatList, Modal, Alert, ActivityIndicator, TextInput, InteractionManager 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import logger from '../utils/logger';
import TournamentDetailModal from '../components/TournamentDetailModal';
import TournamentCard from '../components/TournamentCard';
import designSystem from '../theme/designSystem';
import { isTournamentPast, getVisibleTournaments } from '../utils/tournamentUtils';
import { useIsFocused } from '@react-navigation/native';

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

const ExploreScreen = (props) => {
  const { 
    tournaments, onSelect, reschedulingFrom, onCancelReschedule, userId, 
    userRole, userSports, players = [], Sport, SkillLevel, user,
    onRegister, onAssignCoach, isSyncing, onUpdateTournament
  } = props;
  const [sportFilter, setSportFilter] = useState('All');
  const [cityFilter, setCityFilter] = useState('All');
  const [isCityDropdownVisible, setIsCityDropdownVisible] = useState(false);
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
    if (props.route?.params?.selectedTournamentId) {
      const tid = props.route.params.selectedTournamentId;
      const t = tournaments.find(it => String(it.id) === String(tid));
      if (t) {
        setSelectedTournament(t);
        // Clear param to avoid re-opening on every render
        props.navigation.setParams({ selectedTournamentId: null });
      }
    }
  }, [props.route?.params?.selectedTournamentId, tournaments]);
  
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
    setIsCityDropdownVisible(false);
    setIsFetchingLoc(true);
    try {
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

  const parseDate = (d) => {
    if (!d) return null;
    const date = new Date(d);
    if (isNaN(date.getTime())) {
      // Handle DD-MM-YYYY format
      const parts = d.split('-');
      if (parts.length === 3) {
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      }
    }
    return date;
  };

  const availableSports = userRole === 'coach' && userSports ? userSports : Object.values(Sport);
  const currentUser = userId ? (players || []).find(p => p.id === userId) : null;

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
      const dateA = parseDate(a.date)?.getTime() || 0;
      const dateB = parseDate(b.date)?.getTime() || 0;
      return dateA - dateB;
    });
  }, [displayTournaments, userLocation]);

  const recommendedTournaments = useMemo(() => {
    return (sortedTournaments || [])
      .filter(t => {
          if (userRole === 'user' && currentUser?.trueSkillRating) {
             if (t.skillRange) return currentUser.trueSkillRating >= t.skillRange.min && currentUser.trueSkillRating <= t.skillRange.max;
          }
          return false;
      }).slice(0, 2);
  }, [sortedTournaments, userRole, currentUser]);

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

    const finalize = (method) => {
        onRegister(regPaymentTarget, method, totalAdjustedCost, isRescheduling, reschedulingFrom);
        setRegPaymentTarget(null);
        setSelectedTournament(null);
        Alert.alert("Success", isRescheduling ? "Arena swapped successfully!" : "Registration successful!");
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
                        <View style={styles.summaryRow}>
                            <View>
                                <Text style={styles.summaryLabel}>Total Adjustment</Text>
                                <Text style={[styles.summaryValue, { color: totalAdjustedCost < 0 ? '#16A34A' : '#EF4444' }]}>
                                    ₹{Math.abs(totalAdjustedCost)}
                                </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={styles.summaryLabel}>Wallet Balance</Text>
                                <Text style={[styles.summaryValueSmall, !canPayWithCredits && totalAdjustedCost > 0 && { color: '#EF4444' }]}>
                                    ₹{user?.credits || 0}
                                </Text>
                            </View>
                        </View>
                        {!canPayWithCredits && totalAdjustedCost > 0 && (
                            <Text style={styles.insufficientText}>Insufficient AceTrack credits</Text>
                        )}
                    </View>

                    <View style={styles.paymentActions}>
                        <TouchableOpacity 
                            disabled={!canPayWithCredits}
                            onPress={() => finalize('credits')}
                            style={[styles.payBtn, !canPayWithCredits && styles.payBtnDisabled]}
                        >
                            <Text style={[styles.payBtnText, !canPayWithCredits && styles.payBtnTextDisabled]}>Pay with Wallet</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
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
      <View style={[styles.hero, { paddingTop: Math.max(insets.top, 16) }]}>
        <View style={styles.heroContent}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.heroTitle}>AceTrack</Text>
              <Text style={styles.heroSubtitle}>
                {selectedHub.includes('Current Location') ? 'Nearby Arenas' : `${cityFilter} Circuit`}
              </Text>
            </View>
            <TouchableOpacity 
              style={[styles.compactCityPicker, isCityDropdownVisible && styles.compactCityPickerActive]} 
              onPress={() => setIsCityDropdownVisible(!isCityDropdownVisible)}
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
                  onPress={() => { 
                    setCityFilter(item); 
                    setSelectedHub(item);
                    setIsCityDropdownVisible(false); 
                    setCitySearch(''); 
                  }}
                >
                  <Text style={[styles.dropdownItemText, cityFilter === item && styles.dropdownItemTextActive]}>
                    {item === 'All' ? 'All Locations' : item}
                  </Text>
                  {cityFilter === item && <Ionicons name="checkmark" size={14} color="#EF4444" />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={styles.sportFilterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sportFilterRow}>
            {['All', ...availableSports].map(sport => (
              <TouchableOpacity 
                key={sport}
                onPress={() => setSportFilter(sport)}
                style={[styles.sportChip, sportFilter === sport && styles.sportChipActive]}
              >
                <Text style={[styles.sportChipText, sportFilter === sport && styles.sportChipTextActive]}>{sport}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      <FlatList
        data={sortedTournaments}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
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
        }
        ListEmptyComponent={
          <View style={styles.main}>
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
        contentContainerStyle={{ paddingBottom: 100 }}
      />



      <TournamentDetailModal
        tournament={selectedTournament}
        visible={!!selectedTournament}
        onClose={() => setSelectedTournament(null)}
        user={user}
        role={userRole}
        players={players}
        onRegister={(t) => setRegPaymentTarget(t)}
        onCoachOptIn={(t) => onAssignCoach(t.id, userId)}
        onUpdateTournament={onUpdateTournament}
      />

      {renderPaymentModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  hero: {
    backgroundColor: '#0F172A',
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    paddingBottom: 20,
  },
  heroContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: -1,
  },
  heroSubtitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 4,
  },
  filterContainer: {
    paddingHorizontal: 24,
    gap: 12,
  },
  filterButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  filterButtonActive: {
    backgroundColor: '#EF4444',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#CBD5E1',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  compactCityPicker: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', maxWidth: '40%' },
  compactCityPickerActive: { backgroundColor: 'rgba(255,255,255,0.2)', borderColor: '#EF4444' },
  compactCityText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', marginHorizontal: 4 },
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
  main: {
    padding: 24,
    paddingBottom: 100,
  },
  distanceIndicator: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#64748B',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: -0.5,
  },
  liveBadge: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#EF4444',
    textTransform: 'uppercase',
    letterSpacing: 1,
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
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1,
  },
  summaryValueSmall: {
    fontSize: 18,
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
