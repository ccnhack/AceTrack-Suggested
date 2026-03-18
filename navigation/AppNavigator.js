import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Sport, SkillLevel, TournamentStructure, TournamentFormat } from '../types';

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

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const MainTabs = ({ 
  user, role, players, tournaments, matchVideos, matches, supportTickets, evaluations, 
  seenAdminActionIds, reschedulingFrom, auditLogs, onLogout, 
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
  onManualSync, isCloudOnline, lastSyncTime
}) => {
  const params = { 
    user, role, players, tournaments, matchVideos, matches, supportTickets, evaluations, 
    seenAdminActionIds, reschedulingFrom, auditLogs, onLogout,
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
    onManualSync, isCloudOnline, lastSyncTime
  };
  
  const typeProps = { Sport, SkillLevel, TournamentStructure, TournamentFormat };

  const adminBadgeCount = role === 'admin' ? (
    players.filter(p => p.role === 'coach' && (p.coachStatus === 'pending' || !p.coachStatus) && !seenAdminActionIds.has(p.id)).length +
    matchVideos.filter(v => v.adminStatus === 'Deletion Requested' && !seenAdminActionIds.has(v.id)).length +
    supportTickets.filter(t => (t.status === 'Open' || t.status === 'Awaiting Response') && !seenAdminActionIds.has(t.id)).length +
    tournaments.filter(t => (t.coachAssignmentType === 'platform' || t.coachStatus === 'Pending Coach Registration') && !t.assignedCoachId && t.status !== 'completed' && !t.tournamentConcluded && !seenAdminActionIds.has(t.id)).length
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
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#EF4444',
        tabBarInactiveTintColor: '#CBD5E1',
        headerShown: false,
        tabBarStyle: {
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          height: 70,
          paddingBottom: 10,
        }
      })}
    >
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
      {(role === 'user' || role === 'coach') && (
        <Tab.Screen name="Matches">
          {(props) => <MatchesScreen {...props} {...params} user={params.user} {...typeProps} />}
        </Tab.Screen>
      )}
      {(role === 'user' || role === 'coach') && (
        <Tab.Screen name="Recordings">
          {(props) => <RecordingsScreen {...props} {...params} user={params.user} {...typeProps} />}
        </Tab.Screen>
      )}
      <Tab.Screen name="Ranking">
        {(props) => <RankingScreen {...props} {...params} user={params.user} {...typeProps} />}
      </Tab.Screen>
      {role === 'academy' && (
        <Tab.Screen name="Academy">
          {(props) => <AcademyScreen {...props} {...params} academyId={params.user.id} matches={matches} onCancelVideo={onCancelVideo} {...typeProps} />}
        </Tab.Screen>
      )}
      {role === 'admin' && (
        <Tab.Screen name="Admin">
          {(props) => <AdminHubScreen {...props} {...params} {...typeProps} />}
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
            lastSyncTime={lastSyncTime}
            onManualSync={onManualSync}
            {...typeProps} 
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
};

export default function AppNavigator({ user, role, players, tournaments, matchVideos, matches, tickets, evaluations, seenAdminActionIds, reschedulingFrom, auditLogs, onLogout, handlers }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
// ... (omitting Landing, Login, Signup screens for brevity in target search if needed, but I'll provide full block)
        <>
          <Stack.Screen name="Landing">
            {(props) => (
              <LandingScreen 
                {...props} 
                onLogin={() => props.navigation.navigate('Login')} 
                onSignup={() => props.navigation.navigate('Signup')} 
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Login">
            {(props) => (
              <LoginScreen 
                {...props} 
                players={players} 
                onLoginSuccess={handlers.onLogin} 
                onBack={() => props.navigation.goBack()} 
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Signup">
            {(props) => (
              <SignupScreen 
                {...props} 
                players={players} 
                onSignupSuccess={(newUser) => {
                  // handleLogin will handle both local storage for currentUser and cloud sync for players list
                  handlers.onLogin(newUser.role, newUser);
                }}
                onBack={() => props.navigation.goBack()}
                Sport={Sport}
              />
            )}
          </Stack.Screen>
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
              reschedulingFrom={reschedulingFrom}
              auditLogs={auditLogs} 
              onLogout={onLogout} 
              {...handlers} 
            />
          )}
        </Stack.Screen>
      )}
    </Stack.Navigator>
  );
}
