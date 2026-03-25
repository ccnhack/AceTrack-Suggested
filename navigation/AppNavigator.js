import React from 'react';
import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Sport, SkillLevel, TournamentStructure, TournamentFormat } from '../types';
import logger from '../utils/logger';

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
const MainTabs = ({ 
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
  onVerifyAccount, isUsingCloud, onToggleCloud, setIsProfileEditActive, socketRef
}) => {
  const params = { 
    user, role, players, tournaments, matchVideos, matches, supportTickets, evaluations, 
    seenAdminActionIds, setSeenAdminActionIds, reschedulingFrom, auditLogs, onLogout,
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
    onVerifyAccount, isUsingCloud, onToggleCloud, setIsProfileEditActive,
    visitedAdminSubTabs, setVisitedAdminSubTabs, appVersion, socketRef
  };
  
  const typeProps = { Sport, SkillLevel, TournamentStructure, TournamentFormat };

  const adminBadgeCount = role === 'admin' ? (
    (() => {
      const pendingCoaches = visitedAdminSubTabs.has('coaches') ? [] : players.filter(p => p.role === 'coach' && (p.coachStatus === 'pending' || !p.coachStatus) && !seenAdminActionIds.has(String(p.id)));
      const pendingRecordings = visitedAdminSubTabs.has('recordings') ? [] : matchVideos.filter(v => v.adminStatus === 'Deletion Requested' && !seenAdminActionIds.has(String(v.id)));
      const pendingTickets = supportTickets.filter(t => (t.status === 'Open' || t.status === 'Awaiting Response') && !seenAdminActionIds.has(String(t.id)));
      const pendingAssignments = visitedAdminSubTabs.has('coach_assignments') ? [] : tournaments.filter(t => (t.coachAssignmentType === 'platform' || t.coachStatus === 'Pending Coach Registration') && !t.assignedCoachId && t.status !== 'completed' && !t.tournamentConcluded && !seenAdminActionIds.has(String(t.id)));
      
      const total = pendingCoaches.length + pendingRecordings.length + pendingTickets.length + pendingAssignments.length;
      if (total > 0) {
        logger.logAction('BADGE_RE-RENDER', { 
            total, 
            coaches: pendingCoaches.length, 
            recordings: pendingRecordings.length, 
            tickets: pendingTickets.length, 
            assignments: pendingAssignments.length,
            seenIdsCount: seenAdminActionIds.size
        });
      }
      return total;
    })()
  ) : 0;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarBadge: route.name === 'Admin' && adminBadgeCount > 0 ? adminBadgeCount : 
                     route.name === 'Profile' && (user.notifications?.filter(n => !n.read).length > 0) ? (user.notifications?.filter(n => !n.read).length) : 
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
        <Tab.Screen name="Explore">
          {(props) => (
            <ExploreScreen 
              {...props} 
              {...params} 
              userId={user?.id}
              userRole={role}
              user={user}
              userSports={user?.certifiedSports}
              reschedulingFrom={reschedulingFrom}
              onSelect={(t) => {}} // handled internally via TournamentDetailModal
              {...typeProps} 
            />
          )}
        </Tab.Screen>
      )}
      {Platform.OS !== 'web' && (role === 'user' || role === 'coach') && (
        <Tab.Screen name="Matches">
          {(props) => <MatchesScreen {...props} {...params} user={params.user} {...typeProps} />}
        </Tab.Screen>
      )}
      {Platform.OS !== 'web' && (role === 'user' || role === 'coach') && (
        <Tab.Screen name="Recordings">
          {(props) => <RecordingsScreen {...props} {...params} user={params.user} {...typeProps} />}
        </Tab.Screen>
      )}
      {Platform.OS !== 'web' && (
        <Tab.Screen name="Ranking">
          {(props) => <RankingScreen {...props} {...params} user={params.user} {...typeProps} />}
        </Tab.Screen>
      )}
      {Platform.OS !== 'web' && role === 'academy' && (
        <Tab.Screen name="Academy">
          {(props) => <AcademyScreen {...props} {...params} academyId={params.user.id} matches={matches} onCancelVideo={onCancelVideo} {...typeProps} />}
        </Tab.Screen>
      )}
      {role === 'admin' && (
        <Tab.Screen name="Admin">
          {(props) => <AdminHubScreen {...props} {...params} {...typeProps} />}
        </Tab.Screen>
      )}
      {role === 'admin' ? (
        <Tab.Screen name="Insights">
          {(props) => <InsightsScreen {...props} {...params} />}
        </Tab.Screen>
      ) : (
        <Tab.Screen name="Matchmaking">
          {(props) => <MatchmakingScreen {...props} {...params} />}
        </Tab.Screen>
      )}
      <Tab.Screen name="Profile">
        {(props) => (
          <ProfileScreen 
            {...props} 
            {...params} 
            user={params.user} 
            tournaments={tournaments} 
            isCloudOnline={isCloudOnline}
            isUsingCloud={isUsingCloud}
            lastSyncTime={lastSyncTime}
            onManualSync={onManualSync}
            onToggleCloud={onToggleCloud}
            setIsProfileEditActive={setIsProfileEditActive}
            appVersion={appVersion}
            {...typeProps} 
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
};

export default function AppNavigator({ 
  user, role, players, tournaments, matchVideos, matches, tickets, evaluations, 
  seenAdminActionIds, visitedAdminSubTabs, setVisitedAdminSubTabs, 
  reschedulingFrom, auditLogs, onLogout, handlers, appVersion, socketRef 
}) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
// ... (omitting Landing, Login, Signup screens for brevity in target search if needed, but I'll provide full block)
        <>
          {Platform.OS !== 'web' && (
            <Stack.Screen name="Landing">
              {(props) => (
                <LandingScreen 
                  {...props} 
                  onLogin={() => props.navigation.navigate('Login')} 
                  onSignup={() => props.navigation.navigate('Signup')} 
                />
              )}
            </Stack.Screen>
          )}
          <Stack.Screen name="Login">
            {(props) => (
              <LoginScreen 
                {...props} 
                players={players} 
                onLoginSuccess={handlers.onLogin} 
                onSignup={() => props.navigation.navigate('Signup')}
                onResetPassword={handlers.onResetPassword}
                onRefreshData={() => handlers.onToggleCloud && handlers.loadData(true, true)}
                onBack={() => props.navigation.goBack()} 
                isUsingCloud={handlers.isUsingCloud}
                onToggleCloud={handlers.onToggleCloud}
              />
            )}
          </Stack.Screen>
          {Platform.OS !== 'web' && (
            <Stack.Screen name="Signup">
              {(props) => (
                <SignupScreen 
                  {...props} 
                  players={players} 
                  onSignupSuccess={(newUser) => {
                    // handleRegisterUser handles cloud sync but NOT auto-login
                    handlers.onRegisterUser(newUser);
                    props.navigation.navigate('Login');
                  }}
                  onBack={() => props.navigation.goBack()}
                  Sport={Sport}
                  isUsingCloud={handlers.isUsingCloud}
                  onToggleCloud={handlers.onToggleCloud}
                />
              )}
            </Stack.Screen>
          )}
        </>
      ) : (
        <Stack.Screen name="Main">
          {(props) => (
            <MainTabs 
              {...props} 
              user={user} 
              role={role} 
              players={players} 
              tournaments={tournaments} 
              matchVideos={matchVideos} 
              matches={matches}
              supportTickets={tickets}
              evaluations={evaluations}
              seenAdminActionIds={seenAdminActionIds}
              visitedAdminSubTabs={visitedAdminSubTabs}
              setVisitedAdminSubTabs={setVisitedAdminSubTabs}
              reschedulingFrom={reschedulingFrom}
              auditLogs={auditLogs}
              onLogout={onLogout}
              appVersion={appVersion}
              socketRef={socketRef}
              {...handlers}
            />
          )}
        </Stack.Screen>
      )}
      <Stack.Screen name="CoachDirectory">
        {(props) => <CoachDirectoryScreen {...props} user={user} players={players} tournaments={tournaments} {...handlers} />}
      </Stack.Screen>
      <Stack.Screen name="Subscriptions">
        {(props) => <SubscriptionScreen {...props} user={user} />}
      </Stack.Screen>
      <Stack.Screen name="LiveScoring">
        {(props) => <LiveScoringScreen {...props} user={user} players={players} evaluations={evaluations} {...handlers} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
