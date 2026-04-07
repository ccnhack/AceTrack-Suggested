import React, { useMemo, useCallback, memo } from 'react';
import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Sport, SkillLevel, TournamentStructure, TournamentFormat } from '../types';
import logger from '../utils/logger';

// Performance Optimization: Specialized Contexts
const AuthContext = React.createContext(null);
const DataContext = React.createContext(null);
const ActionContext = React.createContext(null);
const NavigationContext = React.createContext(null); // Legacy support

export const useAuth = () => React.useContext(AuthContext);
export const useAppData = () => React.useContext(DataContext);
export const useAppActions = () => React.useContext(ActionContext);

export const useNavigationParams = () => {
  const auth = React.useContext(AuthContext);
  const data = React.useContext(DataContext);
  const actions = React.useContext(ActionContext);
  const legacy = React.useContext(NavigationContext);
  
  return useMemo(() => ({
    ...auth,
    ...data,
    ...actions,
    ...legacy
  }), [auth, data, actions, legacy]);
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
  const { user, role } = useAuth();
  const actions = useAppActions();
  return (
    <ExploreScreen 
      {...props} 
      {...actions} 
      userId={user?.id}
      userRole={role}
      user={user}
      userSports={user?.certifiedSports}
      onSelect={(t) => {}} 
      Sport={Sport} SkillLevel={SkillLevel} TournamentStructure={TournamentStructure} TournamentFormat={TournamentFormat}
    />
  );
});

const MatchesWrapper = memo((props) => {
  const { user } = useAuth();
  const data = useAppData();
  const actions = useAppActions();
  return <MatchesScreen {...props} {...data} {...actions} user={user} Sport={Sport} SkillLevel={SkillLevel} TournamentStructure={TournamentStructure} TournamentFormat={TournamentFormat} />;
});

const RecordingsWrapper = memo((props) => {
  const { user, role } = useAuth();
  const data = useAppData();
  const actions = useAppActions();
  return <RecordingsScreen {...props} {...data} {...actions} user={user} role={role} Sport={Sport} SkillLevel={SkillLevel} TournamentStructure={TournamentStructure} TournamentFormat={TournamentFormat} />;
});

const RankingWrapper = memo((props) => {
  const { user, role } = useAuth();
  const data = useAppData();
  const actions = useAppActions();
  return <RankingScreen {...props} {...data} {...actions} user={user} role={role} Sport={Sport} SkillLevel={SkillLevel} TournamentStructure={TournamentStructure} TournamentFormat={TournamentFormat} />;
});

const AcademyWrapper = memo((props) => {
  const { user } = useAuth();
  const { matches, tournaments } = useAppData();
  const actions = useAppActions();
  return <AcademyScreen {...props} {...actions} academyId={user?.id} tournaments={tournaments} matches={matches} Sport={Sport} SkillLevel={SkillLevel} TournamentStructure={TournamentStructure} TournamentFormat={TournamentFormat} />;
});

const AdminHubWrapper = memo((props) => {
  const { user, onLogout } = useAuth();
  const { isCloudOnline, ...data } = useAppData();
  const actions = useAppActions();
  return <AdminHubScreen {...props} {...data} tickets={data.supportTickets} user={user} onLogout={onLogout} isCloudOnline={isCloudOnline} {...actions} Sport={Sport} SkillLevel={SkillLevel} TournamentStructure={TournamentStructure} TournamentFormat={TournamentFormat} />;
});

const InsightsWrapper = memo((props) => {
  const { user, role } = useAuth();
  const data = useAppData();
  return (
    <InsightsScreen 
      {...props} 
      {...data}
      role={role} 
      user={user} 
      academyId={user?.id}
    />
  );
});

const MatchmakingWrapper = memo((props) => {
  const { user } = useAuth();
  const data = useAppData();
  const actions = useAppActions();
  return <MatchmakingScreen {...props} {...data} {...actions} user={user} />;
});

const ProfileWrapper = memo((props) => {
  const { user, onLogout } = useAuth();
  const { isCloudOnline, isUsingCloud, lastSyncTime, appVersion, supportTickets, players } = useAppData();
  const { 
    onManualSync, onUploadLogs, isUploadingLogs, onSaveTicket, 
    onReplyTicket, onUpdateUser, onTopUp, setIsProfileEditActive, 
    onToggleCloud, onVerifyAccount, onUpdateTicketStatus,
    onRetryMessage, onMarkSeen
  } = useAppActions();

  return (
    <ProfileScreen 
      {...props} 
      user={user} 
      onLogout={onLogout}
      isCloudOnline={isCloudOnline}
      isUsingCloud={isUsingCloud}
      lastSyncTime={lastSyncTime}
      appVersion={appVersion}
      supportTickets={supportTickets}
      players={players}
      onManualSync={onManualSync}
      onUploadLogs={onUploadLogs}
      isUploadingLogs={isUploadingLogs}
      onSaveTicket={onSaveTicket}
      onReplyTicket={onReplyTicket}
      onUpdateUser={onUpdateUser}
      onTopUp={onTopUp}
      setIsProfileEditActive={setIsProfileEditActive}
      onToggleCloud={onToggleCloud}
      onVerifyAccount={onVerifyAccount}
      onUpdateTicketStatus={onUpdateTicketStatus}
      Sport={Sport} 
      SkillLevel={SkillLevel} 
      TournamentStructure={TournamentStructure} 
      TournamentFormat={TournamentFormat} 
    />
  );
});

const MainTabs = memo(() => {
  const { user, role } = useAuth();
  const { 
    players, tournaments, matchVideos, supportTickets, seenAdminActionIds, 
    visitedAdminSubTabs, reschedulingFrom 
  } = useAppData();
  const { setVisitedAdminSubTabs } = useAppActions();
  
  const typeProps = useMemo(() => ({ Sport, SkillLevel, TournamentStructure, TournamentFormat }), []);

  const adminBadgeCount = useMemo(() => {
    if (role !== 'admin') return 0;
    
    // Safety check for Set methods
    const hasVisited = (tab) => visitedAdminSubTabs?.has && typeof visitedAdminSubTabs.has === 'function' && visitedAdminSubTabs.has(tab);
    const hasSeen = (id) => seenAdminActionIds?.has && typeof seenAdminActionIds.has === 'function' && seenAdminActionIds.has(String(id));

    const today = new Date().toISOString().split('T')[0];
    const pendingCoaches = hasVisited('coaches') ? [] : (players || []).filter(p => p.role === 'coach' && (p.coachStatus === 'pending' || !p.coachStatus) && !p.isApprovedCoach && !hasSeen(p.id));
    const pendingRecordings = hasVisited('recordings') ? [] : (matchVideos || []).filter(v => v.adminStatus === 'Deletion Requested' && !hasSeen(v.id));
    const pendingTickets = (supportTickets || []).filter(t => (t.status === 'Open' || t.status === 'Awaiting Response') && !hasSeen(t.id));
    const pendingAssignments = hasVisited('coach_assignments') ? [] : (tournaments || []).filter(t => (t.coachAssignmentType === 'platform' || t.coachStatus === 'Pending Coach Registration' || t.coachStatus === 'Awaiting Assignment') && !t.assignedCoachId && t.status !== 'completed' && !t.tournamentConcluded && (t.date >= today) && !hasSeen(t.id));
    
    const total = (pendingCoaches?.length || 0) + (pendingRecordings?.length || 0) + (pendingTickets?.length || 0) + (pendingAssignments?.length || 0);
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
      {Platform.OS !== 'web' && (role === 'user' || role === 'coach' || role === 'academy') && (
        <Tab.Screen name="Matchmaking" component={MatchmakingWrapper} />
      )}
      {(role === 'admin' || role === 'academy') && (
        <Tab.Screen name="Insights" component={InsightsWrapper} />
      )}
      <Tab.Screen name="Profile" component={ProfileWrapper} />
    </Tab.Navigator>
  );
});

// Stable Stack Wrappers
const LoginWrapper = memo((props) => {
  const { onLogin, onResetPassword, loadData, onBack, onToggleCloud } = useAppActions();
  const { players, isUsingCloud } = useAppData();
  return (
    <LoginScreen 
      {...props} 
      players={players} 
      onLoginSuccess={onLogin} 
      onSignup={() => props.navigation.navigate('Signup')}
      onResetPassword={onResetPassword}
      onRefreshData={async () => {
        const cloudData = await loadData(true, true);
        return cloudData || null;
      }}
      onBack={onBack} 
      isUsingCloud={isUsingCloud}
      onToggleCloud={onToggleCloud}
    />
  );
});

const SignupWrapper = memo((props) => {
  const { onRegisterUser } = useAppActions();
  const { players } = useAppData();
  const { setPlayers } = useNavigationParams(); // fallback for setters if not in actions yet
  return (
    <SignupScreen 
      {...props} 
      players={players} 
      setPlayers={setPlayers}
      onSignupSuccess={(newUser) => {
        onRegisterUser(newUser);
        props.navigation.navigate('Login');
      }}
      onBack={() => props.navigation.goBack()}
      Sport={Sport}
    />
  );
});

const CoachDirectoryWrapper = memo((props) => {
  const auth = useAuth();
  const data = useAppData();
  const actions = useAppActions();
  return <CoachDirectoryScreen {...props} user={auth.user} players={data.players} tournaments={data.tournaments} {...data} {...actions} />;
});

const SubscriptionWrapper = memo((props) => {
  const { user } = useAuth();
  return <SubscriptionScreen {...props} user={user} />;
});

const LiveScoringWrapper = memo((props) => {
  const { user } = useAuth();
  const data = useAppData();
  const actions = useAppActions();
  return <LiveScoringScreen {...props} user={user} players={data.players} evaluations={data.evaluations} {...data} {...actions} />;
});

export default function AppNavigator({ 
  user, role, players, tournaments, matchVideos, matches, supportTickets, evaluations, 
  seenAdminActionIds, setSeenAdminActionIds, visitedAdminSubTabs, setVisitedAdminSubTabs, 
  reschedulingFrom, auditLogs, onLogout, handlers, appVersion, socketRef,
  matchmaking, onUpdateMatchmaking, sendUserNotification,
  isCloudOnline, isUsingCloud, lastSyncTime
}) {
  const authParams = useMemo(() => ({
    user, role, onLogout
  }), [user?.id, user?.avatar, user?.isEmailVerified, user?.isPhoneVerified, role, onLogout]);

  const dataParams = useMemo(() => ({
    players, tournaments, matchVideos, matches, supportTickets, evaluations,
    seenAdminActionIds, visitedAdminSubTabs, reschedulingFrom, auditLogs,
    appVersion, matchmaking, isCloudOnline, isUsingCloud, lastSyncTime
  }), [
    players, tournaments, matchVideos, matches, supportTickets, evaluations,
    seenAdminActionIds, visitedAdminSubTabs, reschedulingFrom, auditLogs,
    appVersion, matchmaking, isCloudOnline, isUsingCloud, lastSyncTime
  ]);

  const actionParams = useMemo(() => ({
    ...handlers, 
    setSeenAdminActionIds,
    setVisitedAdminSubTabs, 
    socketRef, 
    onUpdateMatchmaking, 
    sendUserNotification
  }), [handlers, setSeenAdminActionIds, setVisitedAdminSubTabs, socketRef, onUpdateMatchmaking, sendUserNotification]);

  // Legacy support for any screen still using useNavigationParams
  const legacyParams = useMemo(() => ({
    ...authParams, ...dataParams, ...actionParams
  }), [authParams, dataParams, actionParams]);

  return (
    <AuthContext.Provider value={authParams}>
      <DataContext.Provider value={dataParams}>
        <ActionContext.Provider value={actionParams}>
          <NavigationContext.Provider value={legacyParams}>
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
        </ActionContext.Provider>
      </DataContext.Provider>
    </AuthContext.Provider>
  );
}
