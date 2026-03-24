export enum Sport {
  BADMINTON = 'Badminton',
  TABLE_TENNIS = 'Table Tennis',
  CRICKET = 'Cricket'
}

export enum SkillLevel {
  BEGINNER = 'Beginner',
  INTERMEDIATE = 'Intermediate',
  ADVANCED = 'Advanced'
}

export enum TournamentStructure {
  ROUND_ROBIN = 'Round Robin',
  LEAGUE = 'League',
  KNOCKOUT = 'Knockout'
}

export enum TournamentFormat {
  MENS_SINGLES = "Men's Singles",
  WOMENS_SINGLES = "Women's Singles",
  MIXED_SINGLES = "Mixed Singles",
  MENS_DOUBLES = "Men's Doubles",
  WOMENS_DOUBLES = "Women's Doubles",
  MIXED_DOUBLES = "Mixed Doubles"
}

export type UserRole = 'user' | 'academy' | 'admin' | 'coach';

export interface Evaluation {
  id: string;
  playerId: string;
  coachId: string;
  tournamentId: string;
  date: string;
  sport: Sport;
  scores: Record<string, number>;
  averageScore: number;
  round?: number;
}

export interface TrueSkillHistory {
  date: string;
  rating: number;
}

export interface PlayerPerformance {
  shotDistribution: {
    smashes: number;
    drops: number;
    clears: number;
    netShots: number;
  };
  rallyStats: {
    longestRally: number;
    averageRallyLength: number;
    winningShots: number;
    unforcedErrors: number;
  };
  heatmapUrl?: string;
}

export interface Player {
  id: string;
  name: string;
  email: string;
  phone: string; 
  gender?: 'Male' | 'Female';
  role?: UserRole;
  skillLevel: SkillLevel;
  rating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  noShows: number; 
  cancellations: number; 
  preferredFormat: 'Singles' | 'Doubles' | 'Both'; 
  mostPlayedVenue?: string; 
  city: string;
  avatar: string;
  credits: number; // For storing refunds and use in future bookings
  cancelledTournamentIds: string[]; // Track opted-out tournaments
  password?: string; // Optional password field for local session simulation
  rescheduleCounts?: Record<string, number>; // Maps tournamentId to number of times rescheduled
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  // Coach specific fields
  isApprovedCoach?: boolean;
  coachStatus?: 'pending' | 'approved' | 'rejected' | 'revoked' | 'addendum';
  certifiedSports?: Sport[];
  govIdUrl?: string;
  certificationUrl?: string;
  coachRejectReason?: string;
  coachOnboardingCompleted?: boolean;
  academyId?: string | null;
  pincode?: string;
  managedSports?: Sport[];
  
  // New features
  trueSkillRating?: number;
  trueSkillHistory?: TrueSkillHistory[];
  performanceAnalytics?: PlayerPerformance;
  isBeginnerProtected?: boolean;
  notifications?: { id: string; title: string; message: string; read: boolean; date: string; type: 'video' | 'general' | 'support'; tournamentId?: string }[];
  purchasedVideos?: string[];
  purchasedHighlights?: string[];
  favouritedVideos?: string[];
  walletHistory?: { id: string; amount: number; type: 'credit' | 'debit'; description: string; date: string }[];
}

export type TicketStatus = 'Open' | 'In Progress' | 'Awaiting Response' | 'Resolved' | 'Closed';
export type TicketType = 'Technical Issue' | 'Bug' | 'Refund' | 'Enhancement Request' | 'Fraud Report' | 'Match Recordings' | 'Payment Issue' | 'Tournament Issue' | 'Other';

export interface SupportTicket {
  id: string;
  userId: string;
  type: TicketType;
  title: string;
  description: string;
  status: TicketStatus;
  createdAt: string;
  messages: { senderId: string; text: string; timestamp: string }[];
}

export interface Tournament {
  id: string;
  title: string;
  sport: Sport;
  location: string;
  date: string;
  time: string;
  registrationDeadline: string;
  skillLevel: SkillLevel;
  structure: TournamentStructure;
  format: TournamentFormat;
  entryFee: number;
  prizePool: string;
  minMatches: number;
  maxPlayers: number;
  registeredPlayerIds: string[];
  pendingPaymentPlayerIds?: string[];
  status: 'upcoming' | 'ongoing' | 'completed';
  description: string;
  city?: string;
  state?: string;
  lat?: number;
  lng?: number;
  creatorId?: string; // ID of the academy or admin who created it
  assignedCoachIds?: string[]; // Coaches opted-in for this tournament
  coachOtps?: Record<string, string>; // Maps coachId to their specific OTP
  startOtp?: string;
  endOtp?: string;
  tournamentStarted?: boolean;
  ratingsModified?: boolean;
  failedOtpAttempts?: { coachId: string; otp: string; timestamp: string }[];
  
  // Coach Assignment Fields
  coachAssignmentType?: 'academy' | 'platform';
  coachStatus?: 'Awaiting Coach Confirmation' | 'Coach Confirmed - Awaiting Assignment' | 'Coach Assigned' | 'Confirmation Reopened' | 'Pending Coach Registration' | 'Coach Assigned - Academy';
  assignedCoachId?: string;
  confirmedCoachId?: string;
  declinedCoachIds?: string[];
  invitedCoachDetails?: { name: string; email: string; phone?: string };
  
  // Multi-round & Teams
  currentRound?: number;
  teams?: string[][]; // Array of teams, each team is an array of playerIds
  qualifiedPlayerIds?: string[]; // Players/teams qualified for the next round
  playerStatuses?: Record<string, 'Qualified' | 'Eliminated'>;
  roundDecisions?: Record<number, Record<string, 'Qualified' | 'Eliminated'>>;
  skillRange?: { min: number; max: number };
}

export interface Match {
  id: string;
  tournamentId: string;
  player1Id: string;
  player2Id: string;
  score1: number;
  score2: number;
  winnerId: string | null;
  status: 'scheduled' | 'live' | 'completed';
  round: number;
  videoUrl?: string;
  consentRecorded: boolean;
}

export interface Season {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  sport: Sport;
  active: boolean;
}

export interface SeasonLeaderboard {
  playerId: string;
  playerName: string;
  points: number;
  rank: number;
}

export interface MatchVideo {
  id: string;
  tournamentId: string;
  matchId: string;
  sport: Sport;
  date: string;
  playerIds: string[];
  cameraType: 'Single' | 'Dual';
  videoUrl: string;
  previewUrl: string;
  price: number;
  isPurchasable: boolean;
  highlightsUrl?: string;
  aiHighlightsPurchasedBy?: string[];
  watermarkTemplate?: string;
  adminStatus?: 'Active' | 'Locked' | 'Removed' | 'Trash' | 'Deletion Requested' | 'Under Review';
  viewedPlayerIds?: string[];
  uploadDate?: string;
  hasAiHighlights?: boolean;
  refundsIssued?: number;
  refundAmount?: number;
  refundedPlayerIds?: string[];
  watermarkedUrl?: string;
  filename?: string;
  videoFile?: Blob;
  deletionReason?: string;
  deletionComment?: string;
  views?: number;
  purchases?: number;
  revenue?: number;
  status?: 'processing' | 'ready' | 'deletion_requested';
}

export interface VideoPurchase {
  videoId: string;
  playerId: string;
  purchasedAt: string;
}

export interface CoachComment {
  id: string;
  videoId: string;
  coachId: string;
  timestamp: string;
  text: string;
}

export interface AdminAuditLog {
  id: string;
  adminId: string;
  action: string;
  targetId: string;
  targetType: 'video' | 'user' | 'tournament' | 'coach' | 'support';
  details: string;
  timestamp: string;
}

export interface AdminAuditLog extends AuditLog {}
export interface RefundRecord {
  id: string;
  videoId: string;
  userId: string;
  amount: number;
  date: string;
  reason: string;
}

export interface AuditLog {
  id: string;
  adminId: string;
  action: string;
  details: string;
  timestamp: string;
}
