import React, { useMemo, useCallback, memo } from 'react';
import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Sport, SkillLevel, TournamentStructure, TournamentFormat } from '../types';
import logger from '../utils/logger';

import { useApp } from '../context/AppContext';
import { useSync } from '../context/SyncContext';
import { useAuth } from '../context/AuthContext';
import { usePlayers } from '../context/PlayerContext';
import { useTournaments } from '../context/TournamentContext';
import { useVideos } from '../context/VideoContext';
import { useSupport } from '../context/SupportContext';

export { useAuth };
import { useAdmin } from '../context/AdminContext';
import { useMatchmaking } from '../context/MatchmakingContext';

// Screens
import LandingScreen from '../screens/LandingScreen';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import ExploreScreen from '../screens/ExploreScreen';
import MatchesScreen from '../screens/MatchesScreen';
import AcademyScreen from '../screens/AcademyScreen';
import AdminHubScreen from '../screens/AdminHubScreen';
import ProfileScreen from '../screens/ProfileScreen';
import RankingScreen from '../screens/RankingScreen';
import RecordingsScreen from '../screens/RecordingsScreen';
import MatchmakingScreen from '../screens/MatchmakingScreen';
import InsightsScreen from '../screens/InsightsScreen';
import CoachDirectoryScreen from '../screens/CoachDirectoryScreen';
import SubscriptionScreen from '../screens/SubscriptionScreen';
import LiveScoringScreen from '../screens/LiveScoringScreen';
import TournamentCalendarScreen from '../screens/TournamentCalendarScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import SupportDashboardScreen from '../screens/SupportDashboardScreen';
import SupportSetupScreen from '../screens/SupportSetupScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Memoized Screen Wrappers are no longer needed for prop-passing, 
// but we'll keep them if we want to ensure stable components for React Navigation
// Actually, it's better to just use them directly if they are already memoized internally.

const MainTabs = memo(() => {
  const { currentUser: user, userRole } = useAuth();
  const role = user?.role || userRole;
  
  if (!role) {
    return null; // Prevent flash of wrong tabs during hydration
  }
  const { players } = usePlayers();
  const { tournaments } = useTournaments();
  const { matchVideos } = useVideos();
  const { supportTickets } = useSupport();
  const { matchmaking } = useMatchmaking();
  const { seenAdminActionIds, visitedAdminSubTabs } = useAdmin();
  
  const adminBadgeCount = useMemo(() => {
    if (role !== 'admin') return 0;
    
    const hasVisited = (tab) => visitedAdminSubTabs?.has && typeof visitedAdminSubTabs.has === 'function' && visitedAdminSubTabs.has(tab);
    const hasSeen = (id) => seenAdminActionIds?.has && typeof seenAdminActionIds.has === 'function' && seenAdminActionIds.has(String(id));

    const today = new Date().toISOString().split('T')[0];
    const pendingCoaches = hasVisited('coaches') ? [] : (players || []).filter(p => p.role === 'coach' && (p.coachStatus === 'pending' || !p.coachStatus) && !p.isApprovedCoach && !hasSeen(p.id));
    const pendingRecordings = hasVisited('recordings') ? [] : (matchVideos || []).filter(v => v.adminStatus === 'Deletion Requested' && !hasSeen(v.id));
    const pendingTickets = (supportTickets || []).filter(t => (t.status === 'Open' || t.status === 'Awaiting Response') && !hasSeen(t.id));
    const pendingAssignments = hasVisited('coach_assignments') ? [] : (tournaments || []).filter(t => (t.coachAssignmentType === 'platform' || t.coachStatus === 'Pending Coach Registration' || t.coachStatus === 'Awaiting Assignment') && !t.assignedCoachId && t.status !== 'completed' && !t.tournamentConcluded && (t.date >= today) && !hasSeen(t.id));
    const pendingMatches = hasVisited('matches') ? [] : (matchmaking || []).filter(m => m.status === 'pending' && !hasSeen(m.id));
    const pendingPayments = hasVisited('payments') ? [] : (tournaments || []).reduce((acc, t) => acc + (t.pendingPaymentPlayerIds || []).filter(pid => !hasSeen(`${t.id}-${pid}`)).length, 0);

    return (pendingCoaches?.length || 0) + (pendingRecordings?.length || 0) + (pendingTickets?.length || 0) + (pendingAssignments?.length || 0) + (pendingMatches?.length || 0) + (typeof pendingPayments === 'number' ? pendingPayments : 0);
  }, [role, visitedAdminSubTabs, players, seenAdminActionIds, matchVideos, supportTickets, tournaments, matchmaking]);

  const screenOptions = useCallback(({ route }) => ({
    tabBarBadge: route.name === 'Admin' && adminBadgeCount > 0 ? adminBadgeCount : 
                 route.name === 'Profile' && (user?.notifications?.filter(n => !n.read)?.length > 0) ? (user?.notifications?.filter(n => !n.read)?.length) : 
                 undefined,
    tabBarIcon: ({ focused, color, size }) => {
      let iconName;
      if (route.name === 'Explore') iconName = focused ? 'home' : 'home-outline';
      else if (route.name === 'Matches') iconName = focused ? 'document-text' : 'document-text-outline';
      else if (route.name === 'Academy') iconName = focused ? 'business' : 'business-outline';
      else if (route.name === 'Ranking') iconName = focused ? 'trophy' : 'trophy-outline';
      else if (route.name === 'Recordings') iconName = focused ? 'play-circle' : 'play-circle-outline';
      else if (route.name === 'Admin') iconName = focused ? 'settings' : 'settings-outline';
      else if (route.name === 'Support') iconName = focused ? 'headset' : 'headset-outline';
      else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
      else if (route.name === 'Matchmaking') iconName = focused ? 'people' : 'people-outline';
      else if (route.name === 'Insights') iconName = focused ? 'bar-chart' : 'bar-chart-outline';
      return <Ionicons name={iconName} size={size} color={color} />;
    },
    tabBarLabel: route.name === 'Matchmaking' && role === 'coach' ? 'Bookings' : route.name,
    tabBarActiveTintColor: '#EF4444',
    tabBarInactiveTintColor: '#CBD5E1',
    headerShown: false,
    tabBarStyle: Platform.OS === 'web' ? { display: 'none' } : {
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      height: 70,
      paddingBottom: 10,
    }
  }), [adminBadgeCount, user?.notifications, role]);

  return (
    <Tab.Navigator screenOptions={screenOptions}>
      {Platform.OS !== 'web' && <Tab.Screen name="Explore" component={ExploreScreen} options={{ tabBarTestID: 'nav.tab.Explore' }} /> }
      {Platform.OS !== 'web' && (role === 'user' || role === 'coach') && role !== 'academy' && (
        <>
          <Tab.Screen name="Matches" component={MatchesScreen} options={{ tabBarTestID: 'nav.tab.Matches' }} />
          <Tab.Screen name="Recordings" component={RecordingsScreen} options={{ tabBarTestID: 'nav.tab.Recordings' }} />
        </>
      )}
      {Platform.OS !== 'web' && <Tab.Screen name="Ranking" component={RankingScreen} options={{ tabBarTestID: 'nav.tab.Ranking' }} /> }
      {Platform.OS !== 'web' && role === 'academy' && (
        <Tab.Screen name="Academy" component={AcademyScreen} options={{ tabBarTestID: 'nav.tab.Academy' }} />
      )}
      {role === 'admin' && (
        <Tab.Screen name="Admin" component={AdminHubScreen} options={{ tabBarTestID: 'nav.tab.Admin' }} />
      )}
      {role === 'support' && (
        <Tab.Screen name="Support" component={SupportDashboardScreen} options={{ tabBarTestID: 'nav.tab.Support' }} />
      )}
      {Platform.OS !== 'web' && role !== 'admin' && (
        <Tab.Screen name="Matchmaking" component={MatchmakingScreen} options={{ tabBarTestID: 'nav.tab.Matchmaking' }} />
      )}
      {(role === 'admin' || role === 'academy') && (
        <Tab.Screen name="Insights" component={InsightsScreen} options={{ tabBarTestID: 'nav.tab.Insights' }} />
      )}
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarTestID: 'nav.tab.Profile' }} />
    </Tab.Navigator>
  );
});

export default function AppNavigator() {
  const { currentUser, viewingLanding, setViewingLanding } = useAuth();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!currentUser ? (
        <>
          <Stack.Screen name="Landing">
            {(props) => (
              <LandingScreen 
                {...props} 
                onLogin={() => {
                  setViewingLanding(false);
                  props.navigation.navigate('Login');
                }} 
                onJoinCircle={() => {
                  setViewingLanding(false);
                  props.navigation.navigate('Signup');
                }}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
        </>
      ) : (
        <Stack.Screen name="Main" component={MainTabs} />
      )}
      <Stack.Screen name="CoachDirectory" component={CoachDirectoryScreen} />
      <Stack.Screen name="Subscriptions" component={SubscriptionScreen} />
      <Stack.Screen name="LiveScoring" component={LiveScoringScreen} />
      <Stack.Screen name="TournamentCalendar" component={TournamentCalendarScreen} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="SupportSetup" component={SupportSetupScreen} />
    </Stack.Navigator>
  );
}
