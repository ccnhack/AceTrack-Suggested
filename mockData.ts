import { Sport, SkillLevel, TournamentFormat, TournamentStructure, Player, Tournament, Match, MatchVideo, SupportTicket } from './types';

export const CURRENT_PLAYER: Player = {
  id: 'arjun',
  name: 'Arjun Mehta',
  email: 'arjun.m@example.com',
  phone: '9876543210',
  skillLevel: SkillLevel.INTERMEDIATE,
  rating: 1250,
  matchesPlayed: 12,
  wins: 8,
  losses: 4,
  noShows: 0,
  cancellations: 1,
  preferredFormat: 'Singles',
  mostPlayedVenue: 'Sarjapur Indoor Arena',
  city: 'Bangalore',
  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  credits: 0,
  cancelledTournamentIds: [],
  trueSkillRating: 1250,
  performanceAnalytics: {
    shotDistribution: {
      smashes: 25,
      drops: 30,
      clears: 35,
      netShots: 10
    },
    rallyStats: {
      longestRally: 24,
      averageRallyLength: 8,
      winningShots: 45,
      unforcedErrors: 12
    }
  },
  notifications: [
    {
      id: 'n1',
      title: 'New Video Available',
      message: 'A new recording from the Bangalore Open Smashers is ready to watch.',
      date: new Date().toISOString(),
      read: false,
      type: 'video'
    },
    {
      id: 'n2',
      title: 'Registration Confirmed',
      message: 'You have been successfully registered for the Electronic City TT Cup.',
      date: new Date(Date.now() - 86400000).toISOString(),
      read: true,
      type: 'general'
    }
  ]
};

export const TOURNAMENTS: Tournament[] = [
  {
    id: 't1',
    title: 'Bangalore Open Smashers',
    sport: Sport.BADMINTON,
    location: 'Sarjapur Indoor Arena',
    date: '2026-06-15',
    registrationDeadline: '2026-06-14',
    time: '09:00 AM',
    skillLevel: SkillLevel.INTERMEDIATE,
    structure: TournamentStructure.ROUND_ROBIN,
    format: TournamentFormat.MENS_SINGLES,
    entryFee: 550,
    prizePool: '₹10,000 + Trophies',
    minMatches: 3,
    maxPlayers: 16,
    registeredPlayerIds: ['rohan', 'sneha', 'kiran'],
    status: 'upcoming',
    description: 'A friendly yet competitive tournament for intermediate badminton players. Guaranteed 3 matches for everyone!',
    creatorId: 'system',
    city: 'Bangalore',
    state: 'Karnataka',
    lat: 12.9716,
    lng: 77.5946,
    assignedCoachIds: [],
    coachOtps: { 'c1': '123456' },
    notifiedCoachIds: ['coach_1', 'coach_2', 'rohan', 'sneha', 'kiran'],
    declinedCoachIds: ['coach_2'],
    optedOutCoachIds: ['rohan'],
    startOtp: '111111',
    endOtp: '222222'
  },
  {
    id: 't2',
    title: 'Electronic City TT Cup',
    sport: Sport.TABLE_TENNIS,
    location: 'Playo Arena, E-City',
    date: '2026-06-22',
    registrationDeadline: '2026-06-21',
    time: '10:30 AM',
    skillLevel: SkillLevel.BEGINNER,
    structure: TournamentStructure.LEAGUE,
    format: TournamentFormat.MENS_DOUBLES,
    entryFee: 450,
    prizePool: '₹5,000 + Vouchers',
    minMatches: 4,
    maxPlayers: 12,
    registeredPlayerIds: ['arjun', 'shashank', 'pranshu', 'rahul'],
    status: 'upcoming',
    description: 'The perfect place to start your competitive journey in Table Tennis. Focus on fair play and learning.',
    creatorId: 'system',
    city: 'Bangalore',
    state: 'Karnataka',
    lat: 12.9304,
    lng: 77.6784,
    assignedCoachIds: [],
    coachOtps: { 'c1': '654321' },
    notifiedCoachIds: ['coach_1', 'coach_2', 'arjun', 'shashank'],
    declinedCoachIds: ['arjun', 'shashank'],
    optedOutCoachIds: [],
    startOtp: '333333',
    endOtp: '444444'
  },
  {
    id: 't4',
    title: 'Mohali Cricket Weekend',
    sport: Sport.CRICKET,
    location: 'PCA Stadium Grounds',
    date: '2026-07-13',
    registrationDeadline: '2026-07-12',
    time: '07:00 AM',
    skillLevel: SkillLevel.INTERMEDIATE,
    structure: TournamentStructure.KNOCKOUT,
    format: TournamentFormat.MENS_SINGLES,
    entryFee: 800,
    prizePool: '₹25,000 + Gear',
    minMatches: 2,
    maxPlayers: 8,
    registeredPlayerIds: ['rohan', 'sneha'],
    status: 'upcoming',
    description: 'Experience the thrill of playing at a professional venue. T20 format, knockout rounds.',
    creatorId: 'system',
    city: 'Mohali',
    state: 'Punjab',
    lat: 30.6908,
    lng: 76.7371,
    assignedCoachIds: [],
    coachOtps: { 'c1': '987654' },
    startOtp: '555555',
    endOtp: '666666'
  }
];

export const OTHER_PLAYERS: Player[] = [
  { id: 'rohan', name: 'Rohan Sharma', phone: '9988776655', avatar: 'https://ui-avatars.com/api/?name=Rohan+Sharma&background=random', skillLevel: SkillLevel.INTERMEDIATE, rating: 1210, matchesPlayed: 5, wins: 3, losses: 2, noShows: 1, cancellations: 0, preferredFormat: 'Doubles', mostPlayedVenue: 'Sarjapur Indoor Arena', city: 'Bangalore', email: 'rohan@test.com', credits: 0, cancelledTournamentIds: [], trueSkillRating: 1210, trueSkillHistory: [{ date: '2025-01-01', rating: 1180 }, { date: '2025-02-01', rating: 1210 }], role: 'user' },
  { id: 'sneha', name: 'Sneha Rao', phone: '9123456789', avatar: 'https://ui-avatars.com/api/?name=Sneha+Rao&background=random', skillLevel: SkillLevel.INTERMEDIATE, rating: 1280, matchesPlayed: 20, wins: 15, losses: 5, noShows: 0, cancellations: 2, preferredFormat: 'Both', mostPlayedVenue: 'PCA Stadium Grounds', city: 'Bangalore', email: 'sneha@test.com', credits: 0, cancelledTournamentIds: [], trueSkillRating: 1280, trueSkillHistory: [{ date: '2025-01-01', rating: 1200 }, { date: '2025-02-01', rating: 1280 }], role: 'user' },
  { id: 'kiran', name: 'Kiran K', phone: '9334455667', avatar: 'https://ui-avatars.com/api/?name=Kiran+K&background=random', skillLevel: SkillLevel.INTERMEDIATE, rating: 1190, matchesPlayed: 8, wins: 4, losses: 4, noShows: 0, cancellations: 0, preferredFormat: 'Singles', mostPlayedVenue: 'E-City Arena', city: 'Bangalore', email: 'kiran@test.com', credits: 0, cancelledTournamentIds: [], trueSkillRating: 1190, trueSkillHistory: [{ date: '2025-01-01', rating: 1150 }, { date: '2025-02-01', rating: 1190 }], role: 'user' },
  { id: 'shashank', name: 'Shashank', phone: '9000000001', avatar: 'https://ui-avatars.com/api/?name=Shashank&background=random', skillLevel: SkillLevel.BEGINNER, rating: 1000, matchesPlayed: 0, wins: 0, losses: 0, noShows: 0, cancellations: 0, preferredFormat: 'Singles', city: 'Bangalore', email: 'shashank@test.com', credits: 100, cancelledTournamentIds: [], trueSkillRating: 1000, isBeginnerProtected: true, isEmailVerified: true, isPhoneVerified: true, role: 'user' },
  { id: 'pranshu', name: 'Pranshu', phone: '9000000002', avatar: 'https://ui-avatars.com/api/?name=Pranshu&background=random', skillLevel: SkillLevel.BEGINNER, rating: 1050, matchesPlayed: 0, wins: 0, losses: 0, noShows: 0, cancellations: 0, preferredFormat: 'Singles', city: 'Bangalore', email: 'pranshu@test.com', credits: 100, cancelledTournamentIds: [], trueSkillRating: 1050, isBeginnerProtected: true, role: 'user' },
  { id: 'rahul', name: 'Rahul', phone: '9000000005', avatar: 'https://ui-avatars.com/api/?name=Rahul&background=random', skillLevel: SkillLevel.BEGINNER, rating: 1020, matchesPlayed: 0, wins: 0, losses: 0, noShows: 0, cancellations: 0, preferredFormat: 'Singles', city: 'Bangalore', email: 'rahul@test.com', credits: 100, cancelledTournamentIds: [], trueSkillRating: 1020, isBeginnerProtected: true, role: 'user' },
  { id: 'coach_1', name: 'Coach Pullela', phone: '9000000003', avatar: 'https://ui-avatars.com/api/?name=Coach+Pullela&background=random', skillLevel: SkillLevel.ADVANCED, rating: 2500, matchesPlayed: 0, wins: 0, losses: 0, noShows: 0, cancellations: 0, preferredFormat: 'Singles', city: 'Bangalore', email: 'coach@test.com', credits: 0, cancelledTournamentIds: [], role: 'coach', isApprovedCoach: true, certifiedSports: [Sport.BADMINTON], password: 'password', trueSkillRating: 2500 },
  { id: 'coach_2', name: 'Pending Coach', phone: '9000000004', avatar: 'https://ui-avatars.com/api/?name=Pending+Coach&background=random', skillLevel: SkillLevel.ADVANCED, rating: 2500, matchesPlayed: 0, wins: 0, losses: 0, noShows: 0, cancellations: 0, preferredFormat: 'Singles', city: 'Bangalore', email: 'pending@test.com', credits: 0, cancelledTournamentIds: [], role: 'coach', isApprovedCoach: false, certifiedSports: [Sport.TABLE_TENNIS], password: 'password', trueSkillRating: 2500 },
];

export const MATCHES: Match[] = [
  {
    id: 'm1',
    tournamentId: 't3',
    player1Id: 'rohan',
    player2Id: 'sneha',
    score1: 21,
    score2: 19,
    winnerId: 'rohan',
    status: 'completed',
    round: 1,
    consentRecorded: true
  },
  {
    id: 'm2',
    tournamentId: 't3',
    player1Id: 'arjun',
    player2Id: 'sneha',
    score1: 21,
    score2: 15,
    winnerId: 'arjun',
    status: 'completed',
    round: 1,
    consentRecorded: true
  },
  {
    id: 'm3',
    tournamentId: 't1',
    player1Id: 'arjun',
    player2Id: 'rohan',
    score1: 21,
    score2: 18,
    winnerId: 'arjun',
    status: 'completed',
    round: 2,
    consentRecorded: true
  }
];

export const MATCH_VIDEOS: MatchVideo[] = [
  {
    id: 'v1',
    tournamentId: 't1',
    matchId: 'm3',
    sport: Sport.BADMINTON,
    date: '2025-06-15',
    playerIds: ['arjun', 'rohan', 'shashank'],
    cameraType: 'Dual',
    videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    previewUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    price: 79,
    isPurchasable: true,
    highlightsUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    adminStatus: 'Active',
    views: 45,
    purchases: 8,
    revenue: 632,
    uploadDate: '2025-06-15T18:30:00Z',
    hasAiHighlights: true,
    refundsIssued: 0,
    refundAmount: 0
  }
];

export const SUPPORT_TICKETS: SupportTicket[] = [
  {
    id: 'tkt_1',
    userId: 'rohan',
    type: 'Refund',
    title: 'Refund for cancelled tournament',
    description: 'I opted out of the Bangalore Open Smashers. Where is my refund?',
    status: 'Open',
    createdAt: '2026-03-10T10:00:00Z',
    messages: [
      { senderId: 'rohan', text: 'I opted out of the Bangalore Open Smashers. Where is my refund?', timestamp: '2026-03-10T10:00:00Z' }
    ]
  }
];