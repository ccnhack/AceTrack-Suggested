import React, { useMemo, memo } from 'react';
import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Sport, SkillLevel, TournamentStructure, TournamentFormat } from '../types';
import logger from '../utils/logger';

// Performance Optimization: Navigation Context
const NavigationContext = React.createContext(null);

export const useNavigationParams = () => {
  const context = React.useContext(NavigationContext);
  if (!context) throw new Error('useNavigationParams must be used within NavigationProvider');
  return context;
};

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

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
// Stable Screen Wrappers to prevent unmounting
const ExploreWrapper = memo((props) => {
  const params = useNavigationParams();
  return (
    <ExploreScreen 
      {...props} 
      {...params} 
      userId={params.user?.id}
      userRole={params.role}
      user={params.user}
      userSports={params.user?.certifiedSports}
      onSelect={(t) => {}} 
      Sport={Sport} SkillLevel={SkillLevel} TournamentStructure={TournamentStructure} TournamentFormat={TournamentFormat}
    />
  );
});

const MatchesWrapper = memo((props) => {
  const params = useNavigationParams();
  return <MatchesScreen {...props} {...params} user={params.user} Sport={Sport} SkillLevel={SkillLevel} TournamentStructure={TournamentStructure} TournamentFormat={TournamentFormat} />;
});

const RecordingsWrapper = memo((props) => {
  const params = useNavigationParams();
  return <RecordingsScreen {...props} {...params} user={params.user} Sport={Sport} SkillLevel={SkillLevel} TournamentStructure={TournamentStructure} TournamentFormat={TournamentFormat} />;
});

const RankingWrapper = memo((props) => {
  const params = useNavigationParams();
  return <RankingScreen {...props} {...params} user={params.user} Sport={Sport} SkillLevel={SkillLevel} TournamentStructure={TournamentStructure} TournamentFormat={TournamentFormat} />;
});

const AcademyWrapper = memo((props) => {
  const params = useNavigationParams();
  return <AcademyScreen {...props} {...params} academyId={params.user?.id} matches={params.matches} onCancelVideo={params.onCancelVideo} Sport={Sport} SkillLevel={SkillLevel} TournamentStructure={TournamentStructure} TournamentFormat={TournamentFormat} />;
});

const AdminHubWrapper = memo((props) => {
  const params = useNavigationParams();
  return <AdminHubScreen {...props} {...params} Sport={Sport} SkillLevel={SkillLevel} TournamentStructure={TournamentStructure} TournamentFormat={TournamentFormat} />;
});

const InsightsWrapper = memo((props) => {
  const params = useNavigationParams();
  return <InsightsScreen {...props} {...params} />;
});

const MatchmakingWrapper = memo((props) => {
  const params = useNavigationParams();
  return <MatchmakingScreen {...props} {...params} />;
});

const ProfileWrapper = memo((props) => {
  const params = useNavigationParams();
  return <ProfileScreen {...props} {...params} Sport={Sport} SkillLevel={SkillLevel} TournamentStructure={TournamentStructure} TournamentFormat={TournamentFormat} />;
});

const MainTabs = memo(() => {
  const { 
    user, role, players, tournaments, matchVideos, matches, supportTickets, evaluations, 
    seenAdminActionIds, setSeenAdminActionIds, visitedAdminSubTabs, setVisitedAdminSubTabs, 
    reschedulingFrom, auditLogs, onLogout, appVersion,
    onSaveTournament, onUpdateTournament, onSaveVideo, onUpdateUser, onTopUp,
    onReplyTicket, onUpdateTicketStatus, onSaveTicket, onSaveEvaluation,
    onConfirmCoachRequest, onDeclineCoachRequest, onStartTournament, 
    onEndTournament, onApproveCoach, onAssignCoach, onRemoveCoach,
    onUpdateVideoStatus, onBulkUpdateVideoStatus, onForceRefundVideo,
    onApproveDeleteVideo, onRejectDeleteVideo, onPermanentDeleteVideo,
    onCancelVideo,
    onRequestDeletion, onUnlockVideo, onPurchaseAiHighlights, onVideoPlay,
    onSaveCoachComment, onRegister, onReschedule, onCancelReschedule,
    onOptOut, onLogFailedOtp, onLogTrace, setPlayers, onToggleFavourite,
    onManualSync, isCloudOnline, lastSyncTime, onBatchUpdate, onUploadLogs, isUploadingLogs,
    onVerifyAccount, isUsingCloud, onToggleCloud, setIsProfileEditActive, socketRef,
    matchmaking, onUpdateMatchmaking, sendUserNotification
  } = useNavigationParams();
  
  const typeProps = useMemo(() => ({ Sport, SkillLevel, TournamentStructure, TournamentFormat }), []);

  const adminBadgeCount = useMemo(() => {
    if (role !== 'admin') return 0;
    
    const pendingCoaches = visitedAdminSubTabs.has('coaches') ? [] : (players || []).filter(p => p.role === 'coach' && (p.coachStatus === 'pending' || !p.coachStatus) && !seenAdminActionIds.has(String(p.id)));
    const pendingRecordings = visitedAdminSubTabs.has('recordings') ? [] : (matchVideos || []).filter(v => v.adminStatus === 'Deletion Requested' && !seenAdminActionIds.has(String(v.id)));
    const pendingTickets = (supportTickets || []).filter(t => (t.status === 'Open' || t.status === 'Awaiting Response') && !seenAdminActionIds.has(String(t.id)));
    const pendingAssignments = visitedAdminSubTabs.has('coach_assignments') ? [] : (tournaments || []).filter(t => (t.coachAssignmentType === 'platform' || t.coachStatus === 'Pending Coach Registration') && !t.assignedCoachId && t.status !== 'completed' && !t.tournamentConcluded && !seenAdminActionIds.has(String(t.id)));
    
    const total = pendingCoaches.length + pendingRecordings.length + pendingTickets.length + pendingAssignments.length;
    if (total > 0) {
      logger.logAction('BADGE_COUNT_UPDATED', { 
          total, 
          coaches: pendingCoaches.length, 
          recordings: pendingRecordings.length, 
          tickets: pendingTickets.length, 
          assignments: pendingAssignments.length
      });
    }
    return total;
  }, [role, visitedAdminSubTabs, players, seenAdminActionIds, matchVideos, supportTickets, tournaments]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarBadge: route.name === 'Admin' && adminBadgeCount > 0 ? adminBadgeCount : 
                     route.name === 'Profile' && (user?.notifications?.filter(n => !n.read).length > 0) ? (user?.notifications?.filter(n => !n.read).length) : 
                     undefined,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'Explore') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Matches') iconName = focused ? 'document-text' : 'document-text-outline';
          else if (route.name === 'Academy') iconName = focused ? 'business' : 'business-outline';
          else if (route.name === 'Ranking') iconName = focused ? 'trophy' : 'trophy-outline';
          else if (route.name === 'Recordings') iconName = focused ? 'play-circle' : 'play-circle-outline';
          else if (route.name === 'Admin') iconName = focused ? 'settings' : 'settings-outline';
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
      })}
    >
      {Platform.OS !== 'web' && (
        <Tab.Screen name="Explore" component={ExploreWrapper} />
      )}
      {Platform.OS !== 'web' && (role === 'user' || role === 'coach') && (
        <Tab.Screen name="Matches" component={MatchesWrapper} />
      )}
      {Platform.OS !== 'web' && (role === 'user' || role === 'coach') && (
        <Tab.Screen name="Recordings" component={RecordingsWrapper} />
      )}
      {Platform.OS !== 'web' && (
        <Tab.Screen name="Ranking" component={RankingWrapper} />
      )}
      {Platform.OS !== 'web' && role === 'academy' && (
        <Tab.Screen name="Academy" component={AcademyWrapper} />
      )}
      {role === 'admin' && (
        <Tab.Screen name="Admin" component={AdminHubWrapper} />
      )}
      {role === 'admin' ? (
        <Tab.Screen name="Insights" component={InsightsWrapper} />
      ) : (
        <Tab.Screen name="Matchmaking" component={MatchmakingWrapper} />
      )}
      <Tab.Screen name="Profile" component={ProfileWrapper} />
    </Tab.Navigator>
  );
});

// Stable Stack Wrappers
const LoginWrapper = memo((props) => {
  const params = useNavigationParams();
  return (
    <LoginScreen 
      {...props} 
      players={params.players} 
      onLoginSuccess={params.onLogin} 
      onSignup={() => props.navigation.navigate('Signup')}
      onResetPassword={params.onResetPassword}
      onRefreshData={() => params.onToggleCloud && params.loadData(true, true)}
      onBack={params.onBack} 
      isUsingCloud={params.isUsingCloud}
      onToggleCloud={params.onToggleCloud}
    />
  );
});

const SignupWrapper = memo((props) => {
  const params = useNavigationParams();
  return (
    <SignupScreen 
      {...props} 
      players={params.players} 
      onSignupSuccess={(newUser) => {
        params.onRegisterUser(newUser);
        props.navigation.navigate('Login');
      }}
      onBack={() => props.navigation.goBack()}
      Sport={Sport}
      isUsingCloud={params.isUsingCloud}
      onToggleCloud={params.onToggleCloud}
    />
  );
});

const CoachDirectoryWrapper = memo((props) => {
  const params = useNavigationParams();
  return <CoachDirectoryScreen {...props} user={params.user} players={params.players} tournaments={params.tournaments} {...params} />;
});

const SubscriptionWrapper = memo((props) => {
  const params = useNavigationParams();
  return <SubscriptionScreen {...props} user={params.user} />;
});

const LiveScoringWrapper = memo((props) => {
  const params = useNavigationParams();
  return <LiveScoringScreen {...props} user={params.user} players={params.players} evaluations={params.evaluations} {...params} />;
});

export default function AppNavigator({ 
  user, role, players, playerMap, tournaments, matchVideos, matches, tickets, evaluations, 
  seenAdminActionIds, visitedAdminSubTabs, setVisitedAdminSubTabs, 
  reschedulingFrom, auditLogs, onLogout, handlers, appVersion, socketRef,
  matchmaking, onUpdateMatchmaking, sendUserNotification
}) {
  const params = useMemo(() => ({
    user, role, players, playerMap, tournaments, matchVideos, matches, tickets, evaluations, 
    seenAdminActionIds, visitedAdminSubTabs, setVisitedAdminSubTabs, 
    reschedulingFrom, auditLogs, onLogout, ...handlers, appVersion, socketRef,
    matchmaking, onUpdateMatchmaking, sendUserNotification
  }), [
    user, role, players, playerMap, tournaments, matchVideos, matches, tickets, evaluations, 
    seenAdminActionIds, visitedAdminSubTabs, reschedulingFrom, auditLogs, onLogout, handlers, appVersion, socketRef,
    matchmaking, onUpdateMatchmaking, sendUserNotification
  ]);

  return (
    <NavigationContext.Provider value={params}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginWrapper} />
            {Platform.OS !== 'web' && (
              <Stack.Screen name="Signup" component={SignupWrapper} />
            )}
          </>
        ) : (
          <Stack.Screen name="Main" component={MainTabs} />
        )}
        <Stack.Screen name="CoachDirectory" component={CoachDirectoryWrapper} />
        <Stack.Screen name="Subscriptions" component={SubscriptionWrapper} />
        <Stack.Screen name="LiveScoring" component={LiveScoringWrapper} />
      </Stack.Navigator>
    </NavigationContext.Provider>
  );
}
