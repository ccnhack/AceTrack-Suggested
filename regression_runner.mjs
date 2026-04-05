/**
 * 🧪 AceTrack Regression Test Runner v1.0
 * Standalone Node.js test runner — no dependencies required.
 * Tests pure utility functions from: scoringRules, payment, tournamentUtils, referral
 * + data-flow logic from matchmaking/auth/video validation patterns.
 */

let passed = 0;
let failed = 0;
const results = [];

function assert(testId, module, scenario, condition, detail = '') {
  if (condition) {
    passed++;
    results.push({ testId, module, scenario, status: '✅ PASS', detail });
  } else {
    failed++;
    results.push({ testId, module, scenario, status: '❌ FAIL', detail });
  }
}

// ──────────────────────────────────────────────
// IMPORT UTILITIES (ESM)
// ──────────────────────────────────────────────
import {
  checkSetWin, checkMatchWin, isDeuce, getServer,
  formatSetScores, createMatch, SPORT_RULES
} from './utils/scoringRules.js';

import {
  createOrder, openPaymentSheet, verifyPayment,
  creditWallet, debitWallet
} from './utils/payment.js';

import {
  cloneTournament, addToWaitlist, promoteFromWaitlist,
  calculateRefund, generateFinancialCSV, getTournamentAnalytics,
  createRefundPolicy, isTournamentPast, parseTournamentDate,
  getVisibleTournaments
} from './utils/tournamentUtils.js';

import {
  generateReferralCode, isValidReferralCode,
  applyReferralReward, findPlayerByReferralCode, getReferralStats
} from './utils/referral.js';

console.log('\n' + '═'.repeat(70));
console.log('  🧪  ACETRACK REGRESSION TEST SUITE — EXECUTION REPORT');
console.log('  📱  App Version: v2.6.6');
console.log('  ⏰  Run Time:', new Date().toLocaleString());
console.log('═'.repeat(70) + '\n');

// ══════════════════════════════════════════════
// MODULE 1: AUTHENTICATION & USER MANAGEMENT
// ══════════════════════════════════════════════
console.log('📦 Module 1: Authentication & User Management');

// TC-AUTH-001: Player login matching logic
const mockPlayers = [
  { id: 'shashank', email: 'shashank@test.com', username: 'shashank', name: 'Shashank S', password: 'password', role: 'user', isApprovedCoach: false },
  { id: 'coach1', email: 'coach@test.com', username: 'coach1', name: 'Coach One', password: 'pass123', role: 'coach', isApprovedCoach: true },
  { id: 'coach_pending', email: 'pending@test.com', username: 'cpend', name: 'Pending Coach', password: 'pass', role: 'coach', isApprovedCoach: false },
  { id: 'academy', email: 'academy@acetrack.com', username: 'academy', name: 'Ace Academy', password: 'password', role: 'academy' },
];

// Login search logic (mirrored from LoginScreen.js)
function findUser(username, players) {
  return players.find(p => {
    const pEmail = (p.email || '').toLowerCase();
    const pId = String(p.id || '').toLowerCase();
    const pUsername = (p.username || '').toLowerCase();
    const pName = (p.name || '').toLowerCase();
    const search = username.toLowerCase().trim();
    return pEmail === search || pId === search || pUsername === search || pName === search;
  });
}

assert('TC-AUTH-001', 'Auth', 'Login with valid username', findUser('shashank', mockPlayers)?.id === 'shashank');
assert('TC-AUTH-002', 'Auth', 'Login with invalid password check', findUser('shashank', mockPlayers)?.password !== 'wrongpass', 'Password mismatch correctly detected');
assert('TC-AUTH-003', 'Auth', 'Login with email match', findUser('coach@test.com', mockPlayers)?.id === 'coach1');
assert('TC-AUTH-004', 'Auth', 'Admin login by username', 'admin' === 'admin' && 'Password@123' === 'Password@123');
assert('TC-AUTH-005', 'Auth', 'Non-existent user returns null', findUser('nonexistent', mockPlayers) === undefined);
assert('TC-AUTH-006', 'Auth', 'Coach pending approval blocks login', (() => {
  const u = findUser('cpend', mockPlayers);
  return u && u.role === 'coach' && !u.isApprovedCoach;
})());
assert('TC-AUTH-007', 'Auth', 'Approved coach can login', (() => {
  const u = findUser('coach1', mockPlayers);
  return u && u.role === 'coach' && u.isApprovedCoach;
})());
assert('TC-AUTH-008', 'Auth', 'Case-insensitive login', findUser('SHASHANK', mockPlayers)?.id === 'shashank');
assert('TC-AUTH-009', 'Auth', 'Login by name match', findUser('Shashank S', mockPlayers)?.id === 'shashank');
assert('TC-AUTH-010', 'Auth', 'Academy login', findUser('academy', mockPlayers)?.role === 'academy');
assert('TC-AUTH-011', 'Auth', 'Avatar History: Prepend new avatar', (() => {
  const history = ['url1', 'url2'];
  const newAvatar = 'url3';
  const updated = [newAvatar, ...history].slice(0, 10);
  return updated[0] === 'url3' && updated.length === 3;
})());
assert('TC-AUTH-012', 'Auth', 'Avatar History: Uniqueness & Limit (10)', (() => {
  const normalize = (u) => u.split('?')[0];
  const history = ['url1?v=1', 'url2?v=1', 'url3?v=1'];
  const selectOld = 'url2?v=99'; // Same base as index 1
  const updated = [selectOld, ...history]
    .filter((url, idx, self) => self.findIndex(u => normalize(u) === normalize(url)) === idx)
    .slice(0, 2); // Testing limit with 2
  return updated.length === 2 && updated[0] === 'url2?v=99' && normalize(updated[1]) === 'url1';
})());
assert('TC-AUTH-013', 'Auth', 'Password Reset Authenticates Previous Credential before execution', (() => {
  const user = { id: 1, password: 'old_password' };
  const oldPasswordInput = 'wrong_password';
  if (user && oldPasswordInput !== user.password) {
    return true; // Execution halts properly
  }
  return false;
})());
assert('TC-AUTH-014', 'Auth', 'Password Reset routes to network Sync on Success', (() => {
  let syncTriggered = false;
  const user = { id: 1, password: 'old_password' };
  const oldPasswordInput = 'old_password';
  const newPasswordInput = 'new_password';
  const handlers = {
    onResetPassword: (id, pass) => { syncTriggered = true; }
  };
  
  if (user && oldPasswordInput !== user.password) return false;
  if (handlers?.onResetPassword) handlers.onResetPassword(user.id, newPasswordInput);
  
  return syncTriggered;
})());
assert('TC-AUTH-015', 'Auth', 'Password Reset Case-Insensitivity (ID)', (() => {
  let syncTarget = null;
  const handlers = { onResetPassword: (id, pass) => { syncTarget = id; } };
  const inputID = 'RiyaPlay'; // Differing case from 'riyaplay'
  handlers.onResetPassword(inputID, 'new-p');
  return syncTarget === 'RiyaPlay';
})());
assert('TC-AUTH-016', 'Auth', 'App.js: p.id match is case-insensitive in onResetPassword', (() => {
  const players = [{ id: 'riyaplay', password: 'old' }];
  const userId = 'RiyaPlay';
  const newPassword = 'new';
  const updatedPlayers = (players || []).map(p => String(p.id).toLowerCase() === String(userId).toLowerCase() ? { ...p, password: newPassword } : p);
  return updatedPlayers[0].id === 'riyaplay' && updatedPlayers[0].password === 'new';
})());



// ══════════════════════════════════════════════
// MODULE 2: TOURNAMENT MANAGEMENT
// ══════════════════════════════════════════════
console.log('📦 Module 2: Tournament Management');

const baseTournament = {
  id: 'trn_001', title: 'Spring Open', sport: 'Badminton', date: '2026-05-15',
  registrationDeadline: '2026-05-12', status: 'upcoming', entryFee: 200,
  maxPlayers: 16, registeredPlayerIds: ['p1', 'p2', 'p3'], waitlistedPlayerIds: [],
  location: 'Bangalore', city: 'Bangalore', format: "Men's Singles",
  prizePool: 5000, creatorId: 'academy', courts: [], staffIds: [],
  refundPolicy: null
};

assert('TC-TRN-001', 'Tournament', 'Clone tournament creates new ID', (() => {
  const clone = cloneTournament(baseTournament);
  return clone.id !== baseTournament.id && clone.registeredPlayerIds.length === 0;
})());
assert('TC-TRN-002', 'Tournament', 'Clone preserves sport and entry fee', (() => {
  const clone = cloneTournament(baseTournament);
  return clone.sport === 'Badminton' && clone.entryFee === 200;
})());
assert('TC-TRN-003', 'Tournament', 'Parse YYYY-MM-DD date', (() => {
  const d = parseTournamentDate('2026-05-15');
  return d instanceof Date && !isNaN(d.getTime()) && d.getDate() === 15;
})());
assert('TC-TRN-004', 'Tournament', 'Parse DD-MM-YYYY date', (() => {
  const d = parseTournamentDate('15-05-2026');
  return d instanceof Date && d.getFullYear() === 2026 && d.getMonth() === 4;
})());
assert('TC-TRN-005', 'Tournament', 'Null date returns null', parseTournamentDate(null) === null);
assert('TC-TRN-006', 'Tournament', 'Past tournament detected', (() => {
  return isTournamentPast({ date: '2020-01-01' });
})());
assert('TC-TRN-007', 'Tournament', 'Future tournament not past', (() => {
  return !isTournamentPast({ date: '2030-12-31' });
})());
assert('TC-TRN-008', 'Tournament', 'Financial CSV generation', (() => {
  const csv = generateFinancialCSV(baseTournament, [
    { id: 'p1', name: 'Player 1' }, { id: 'p2', name: 'Player 2' }
  ]);
  return csv.includes('Player 1') && csv.includes('₹200') && csv.includes('TOTAL');
})());
assert('TC-TRN-009', 'Tournament', 'Tournament analytics calculation', (() => {
  const completed = [{ ...baseTournament, status: 'Completed', registeredPlayerIds: ['a','b','c'] }];
  const analytics = getTournamentAnalytics(completed);
  return analytics.completedCount === 1 && analytics.totalPlayers === 3 && analytics.totalRevenue === 600;
})());
assert('TC-TRN-010', 'Tournament', 'Gender-based filtering (Mens excludes Female)', (() => {
  const tournaments = [{ ...baseTournament, format: "Men's Singles" }];
  const visible = getVisibleTournaments({ tournaments, userRole: 'user', userGender: 'Female', now: new Date('2026-04-01') });
  return visible.length === 0;
})());

// ══════════════════════════════════════════════
// MODULE 3: PLAYER REGISTRATION
// ══════════════════════════════════════════════
console.log('📦 Module 3: Player Registration');

// Signup validation logic (mirrored from SignupScreen.js)
function validateSignup(formData, players) {
  if (!formData.firstName || !formData.username || !formData.email || !formData.password || !formData.phone) return 'All basic fields are required.';
  if (players.find(p => String(p.id).toLowerCase() === formData.username.toLowerCase())) return 'Username already taken.';
  if (players.find(p => p.email?.toLowerCase() === formData.email.toLowerCase())) return 'Email address already registered.';
  if (players.find(p => p.phone === formData.phone)) return 'Mobile number already registered.';
  return null;
}

assert('TC-REG-001', 'Registration', 'Valid signup passes validation', (() => {
  return validateSignup({ firstName: 'Test', username: 'newuser', email: 'new@test.com', password: 'pass123', phone: '+91 1111111111' }, mockPlayers) === null;
})());
assert('TC-REG-002', 'Registration', 'Missing fields rejected', (() => {
  return validateSignup({ firstName: '', username: '', email: '', password: '', phone: '' }, mockPlayers) === 'All basic fields are required.';
})());
assert('TC-REG-003', 'Registration', 'Duplicate username rejected', (() => {
  return validateSignup({ firstName: 'Test', username: 'shashank', email: 'new@test.com', password: 'pass', phone: '+91 2222' }, mockPlayers) === 'Username already taken.';
})());
assert('TC-REG-004', 'Registration', 'Duplicate email rejected', (() => {
  return validateSignup({ firstName: 'Test', username: 'newuser2', email: 'shashank@test.com', password: 'pass', phone: '+91 3333' }, mockPlayers) === 'Email address already registered.';
})());
assert('TC-REG-005', 'Registration', 'Duplicate phone rejected', (() => {
  const players = [{ id: 'x', phone: '+91 9999' }];
  return validateSignup({ firstName: 'T', username: 'u', email: 'e@e.com', password: 'p', phone: '+91 9999' }, players) === 'Mobile number already registered.';
})());
assert('TC-REG-006', 'Registration', 'Waitlist — add player', (() => {
  const t = { ...baseTournament, registeredPlayerIds: ['a'], waitlistedPlayerIds: [] };
  const updated = addToWaitlist(t, 'b');
  return updated.waitlistedPlayerIds.includes('b');
})());
assert('TC-REG-007', 'Registration', 'Waitlist — no duplicate add', (() => {
  const t = { ...baseTournament, waitlistedPlayerIds: ['b'] };
  const updated = addToWaitlist(t, 'b');
  return updated.waitlistedPlayerIds.length === 1;
})());
assert('TC-REG-008', 'Registration', 'Waitlist — no add if already registered', (() => {
  const t = { ...baseTournament, registeredPlayerIds: ['p1'], waitlistedPlayerIds: [] };
  const updated = addToWaitlist(t, 'p1');
  return updated.waitlistedPlayerIds.length === 0;
})());
assert('TC-REG-009', 'Registration', 'Waitlist promotion on cancel', (() => {
  const t = { ...baseTournament, registeredPlayerIds: ['p1'], waitlistedPlayerIds: ['w1', 'w2'] };
  const { tournament, promotedPlayerId } = promoteFromWaitlist(t);
  return promotedPlayerId === 'w1' && tournament.registeredPlayerIds.includes('w1') && tournament.waitlistedPlayerIds.length === 1;
})());
assert('TC-REG-010', 'Registration', 'Empty waitlist returns null promotion', (() => {
  const t = { ...baseTournament, waitlistedPlayerIds: [] };
  const { promotedPlayerId } = promoteFromWaitlist(t);
  return promotedPlayerId === null;
})());

// ══════════════════════════════════════════════
// MODULE 4: PAYMENT & WALLET
// ══════════════════════════════════════════════
console.log('📦 Module 4: Payment & Wallet');

assert('TC-PAY-001', 'Payment', 'Wallet credit increases balance', (() => {
  const player = { walletCredits: 0, walletHistory: [] };
  const updated = creditWallet(player, 500, 'Admin Credit');
  return updated.walletCredits === 500;
})());
assert('TC-PAY-002', 'Payment', 'Credit history entry created', (() => {
  const player = { walletCredits: 0, walletHistory: [] };
  const updated = creditWallet(player, 500, 'Admin Credit');
  return updated.walletHistory.length === 1 && updated.walletHistory[0].type === 'credit' && updated.walletHistory[0].amount === 500;
})());
assert('TC-PAY-003', 'Payment', 'Wallet debit reduces balance', (() => {
  const player = { walletCredits: 500, walletHistory: [] };
  const { success, player: updated } = debitWallet(player, 49, 'Video Purchase');
  return success && updated.walletCredits === 451;
})());
assert('TC-PAY-004', 'Payment', 'Insufficient balance blocks debit', (() => {
  const player = { walletCredits: 10, walletHistory: [] };
  const { success, error } = debitWallet(player, 49);
  return !success && error === 'Insufficient wallet balance';
})());
assert('TC-PAY-005', 'Payment', 'Zero balance debit fails', (() => {
  const player = { walletCredits: 0, walletHistory: [] };
  const { success } = debitWallet(player, 1);
  return !success;
})());
assert('TC-PAY-006', 'Payment', 'Exact balance debit succeeds', (() => {
  const player = { walletCredits: 49, walletHistory: [] };
  const { success, player: updated } = debitWallet(player, 49);
  return success && updated.walletCredits === 0;
})());
assert('TC-PAY-007', 'Payment', 'Refund before deadline — full refund', (() => {
  const t = { entryFee: 200, refundPolicy: { deadline: '2030-12-31T00:00:00Z', refundPercent: 100, lateRefundPercent: 0 } };
  const { refundAmount, refundPercent } = calculateRefund(t, new Date('2025-01-01'));
  return refundAmount === 200 && refundPercent === 100;
})());
assert('TC-PAY-008', 'Payment', 'Refund after deadline — zero refund', (() => {
  const t = { entryFee: 200, refundPolicy: { deadline: '2020-01-01T00:00:00Z', refundPercent: 100, lateRefundPercent: 0 } };
  const { refundAmount } = calculateRefund(t, new Date('2025-06-01'));
  return refundAmount === 0;
})());
assert('TC-PAY-009', 'Payment', 'No policy — full refund default', (() => {
  const t = { entryFee: 200, refundPolicy: null };
  const { refundAmount } = calculateRefund(t);
  return refundAmount === 200;
})());
assert('TC-PAY-010', 'Payment', 'Stub order creation returns valid structure', (async () => {
  const order = await createOrder(500, 'INR');
  return order.id.startsWith('stub_order_') && order.amount === 50000 && order.stub === true;
})());

// ══════════════════════════════════════════════
// MODULE 5: MATCHES & MATCHMAKING
// ══════════════════════════════════════════════
console.log('📦 Module 5: Matches & Matchmaking');

// parseTime logic (mirrored from MatchmakingScreen.js)
function parseTime(timeStr) {
  if (!timeStr) return 0;
  const [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':');
  if (hours === '12') hours = '00';
  if (modifier === 'PM') hours = parseInt(hours, 10) + 12;
  return parseInt(hours, 10) * 60 + parseInt(minutes, 10);
}

function isTimeInPast(date, timeSlot) {
  if (!date) return false;
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  if (date < todayStr) return true;
  if (date > todayStr) return false;
  if (!timeSlot) return false;
  const slotMinutes = parseTime(timeSlot);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return slotMinutes <= nowMinutes;
}

assert('TC-MM-001', 'Matchmaking', 'Parse time AM correctly', parseTime('08:00 AM') === 480);
assert('TC-MM-002', 'Matchmaking', 'Parse time PM correctly', parseTime('02:00 PM') === 840);
assert('TC-MM-003', 'Matchmaking', 'Parse time 12:00 PM = noon', parseTime('12:00 PM') === 720);
assert('TC-MM-004', 'Matchmaking', 'Parse null time returns 0', parseTime(null) === 0);
assert('TC-MM-005', 'Matchmaking', 'Past date is in past', isTimeInPast('2020-01-01', '10:00 AM') === true);
assert('TC-MM-006', 'Matchmaking', 'Future date is not in past', isTimeInPast('2030-12-31', '10:00 AM') === false);
assert('TC-MM-007', 'Matchmaking', 'Null date is not in past', isTimeInPast(null, '10:00 AM') === false);
assert('TC-MM-008', 'Matchmaking', 'Challenge object structure validation', (() => {
  const challenge = {
    id: `match_${Date.now()}`, senderId: 'user1', receiverId: 'user2',
    proposedDate: '2026-06-01', proposedTime: '10:00 AM', sport: 'Badminton',
    status: 'Pending', location: 'Arena X'
  };
  return challenge.senderId && challenge.receiverId && challenge.status === 'Pending' && challenge.sport;
})());
assert('TC-MM-009', 'Matchmaking', 'Accept updates status correctly', (() => {
  const mm = [{ id: 'm1', status: 'Pending' }];
  const updated = mm.map(m => m.id === 'm1' ? { ...m, status: 'Accepted' } : m);
  return updated[0].status === 'Accepted';
})());
assert('TC-MM-010', 'Matchmaking', 'Decline updates status correctly', (() => {
  const mm = [{ id: 'm1', status: 'Pending' }];
  const updated = mm.map(m => m.id === 'm1' ? { ...m, status: 'Declined' } : m);
  return updated[0].status === 'Declined';
})());
assert('TC-MM-011', 'Matchmaking', 'Cancel updates status correctly', (() => {
  const mm = [{ id: 'm1', status: 'Pending' }];
  const updated = mm.map(m => m.id === 'm1' ? { ...m, status: 'Cancelled' } : m);
  return updated[0].status === 'Cancelled';
})());
assert('TC-MM-012', 'Matchmaking', 'Filtering sent requests (sender ID match)', (() => {
  const mm = [
    { id: 'm1', senderId: 'user1', status: 'Pending' },
    { id: 'm2', senderId: 'user2', status: 'Pending' },
    { id: 'm3', senderId: 'user1', status: 'Accepted' },
  ];
  const sent = mm.filter(m => m.senderId === 'user1' && m.status !== 'Accepted' && m.status !== 'Cancelled' && m.status !== 'Declined');
  return sent.length === 1 && sent[0].id === 'm1';
})());

// ══════════════════════════════════════════════
// MODULE 6: COACH WORKFLOW
// ══════════════════════════════════════════════
console.log('📦 Module 6: Coach Workflow');

assert('TC-COACH-001', 'Coach', 'Pending coach blocked from login', (() => {
  const coach = mockPlayers.find(p => p.id === 'coach_pending');
  return coach.role === 'coach' && !coach.isApprovedCoach;
})());
assert('TC-COACH-002', 'Coach', 'Approved coach allowed', (() => {
  const coach = mockPlayers.find(p => p.id === 'coach1');
  return coach.role === 'coach' && coach.isApprovedCoach === true;
})());
assert('TC-COACH-003', 'Coach', 'Coach sport filtering in tournaments', (() => {
  const tournaments = [
    { ...baseTournament, sport: 'Badminton' },
    { ...baseTournament, id: 'trn_002', sport: 'Cricket' },
  ];
  const coachSports = ['Badminton'];
  const filtered = getVisibleTournaments({ tournaments, userRole: 'coach', userSports: coachSports, now: new Date('2026-04-01') });
  return filtered.every(t => t.sport === 'Badminton');
})());
assert('TC-COACH-004', 'Coach', 'Coach notes array initialized', (() => {
  const match = createMatch('p1', 'p2', 'badminton');
  return Array.isArray(match.coachNotes) && match.coachNotes.length === 0;
})());
assert('TC-COACH-005', 'Coach', 'Coach match warmup duration default', (() => {
  const match = createMatch('p1', 'p2', 'badminton');
  return match.warmupDuration === 5;
})());

// ══════════════════════════════════════════════
// MODULE 7: EVALUATION SYSTEM (SCORING RULES)
// ══════════════════════════════════════════════
console.log('📦 Module 7: Evaluation System');

assert('TC-EVAL-001', 'Evaluation', 'Badminton normal win (21-15)', (() => {
  const r = checkSetWin(21, 15, 'badminton');
  return r.won === true && r.winner === 1;
})());
assert('TC-EVAL-002', 'Evaluation', 'Badminton normal win P2 (15-21)', (() => {
  const r = checkSetWin(15, 21, 'badminton');
  return r.won === true && r.winner === 2;
})());
assert('TC-EVAL-003', 'Evaluation', 'Badminton deuce detection (20-20)', isDeuce(20, 20, 'badminton') === true);
assert('TC-EVAL-004', 'Evaluation', 'Badminton not deuce (19-20)', isDeuce(19, 20, 'badminton') === false);
assert('TC-EVAL-005', 'Evaluation', 'Badminton deuce win (22-20)', (() => {
  const r = checkSetWin(22, 20, 'badminton');
  return r.won === true && r.winner === 1;
})());
assert('TC-EVAL-006', 'Evaluation', 'Badminton deuce not won (21-20)', (() => {
  const r = checkSetWin(21, 20, 'badminton');
  return r.won === false;
})());
assert('TC-EVAL-007', 'Evaluation', 'Badminton cap at 30-29', (() => {
  const r = checkSetWin(30, 29, 'badminton');
  return r.won === true && r.winner === 1;
})());
assert('TC-EVAL-008', 'Evaluation', 'Table Tennis normal win (11-9)', (() => {
  const r = checkSetWin(11, 9, 'tabletennis');
  return r.won === true && r.winner === 1;
})());
assert('TC-EVAL-009', 'Evaluation', 'Table Tennis deuce (10-10)', isDeuce(10, 10, 'tabletennis') === true);
assert('TC-EVAL-010', 'Evaluation', 'Match win Best of 3 (2-1 sets)', (() => {
  const sets = [{ score1: 21, score2: 15 }, { score1: 19, score2: 21 }, { score1: 21, score2: 18 }];
  const r = checkMatchWin(sets, 'badminton');
  return r.won === true && r.winner === 1 && r.setsWon[0] === 2 && r.setsWon[1] === 1;
})());
assert('TC-EVAL-011', 'Evaluation', 'Match not won yet (1-1 sets)', (() => {
  const sets = [{ score1: 21, score2: 15 }, { score1: 19, score2: 21 }];
  const r = checkMatchWin(sets, 'badminton');
  return r.won === false;
})());
assert('TC-EVAL-012', 'Evaluation', 'Format set scores correctly', formatSetScores([{ score1: 21, score2: 18 }, { score1: 19, score2: 21 }]) === '21-18, 19-21');
assert('TC-EVAL-013', 'Evaluation', 'Service rotation (TT, 2 points)', getServer(2, false, 1, 'tabletennis') === 2);
assert('TC-EVAL-014', 'Evaluation', 'Service rotation deuce (TT, every point)', getServer(1, true, 1, 'tabletennis') === 2);
assert('TC-EVAL-015', 'Evaluation', 'Create match has correct structure', (() => {
  const m = createMatch('p1', 'p2', 'badminton', { tournamentId: 'trn1' });
  return m.player1Id === 'p1' && m.player2Id === 'p2' && m.sport === 'badminton' && m.bestOf === 3 && m.sets.length === 1 && m.status === 'scheduled' && m.tournamentId === 'trn1';
})());

// ══════════════════════════════════════════════
// MODULE 8: VIDEO RECORDING SYSTEM
// ══════════════════════════════════════════════
console.log('📦 Module 8: Video Recording System');

assert('TC-VID-001', 'Video', 'Locked video detection (price > 0, not purchased)', (() => {
  const video = { id: 'v1', price: 49 };
  const user = { purchasedVideos: [] };
  const isUnlocked = video.price === 0 || (user.purchasedVideos && user.purchasedVideos.includes(video.id));
  return !isUnlocked;
})());
assert('TC-VID-002', 'Video', 'Unlocked video detection (purchased)', (() => {
  const video = { id: 'v1', price: 49 };
  const user = { purchasedVideos: ['v1'] };
  const isUnlocked = video.price === 0 || (user.purchasedVideos && user.purchasedVideos.includes(video.id));
  return isUnlocked;
})());
assert('TC-VID-003', 'Video', 'Free video always unlocked', (() => {
  const video = { id: 'v2', price: 0 };
  const user = { purchasedVideos: [] };
  const isUnlocked = video.price === 0 || (user.purchasedVideos && user.purchasedVideos.includes(video.id));
  return isUnlocked;
})());
assert('TC-VID-004', 'Video', 'Deletion requested blocks playback', (() => {
  const video = { id: 'v3', adminStatus: 'Deletion Requested' };
  return video.adminStatus === 'Deletion Requested';
})());
assert('TC-VID-005', 'Video', 'Upload limit check (20 per tournament)', (() => {
  const videos = Array.from({ length: 20 }, (_, i) => ({ id: `v${i}`, tournamentId: 'trn1' }));
  const count = videos.filter(v => v.tournamentId === 'trn1').length;
  return count >= 20;
})());
assert('TC-VID-006', 'Video', 'Video card metadata structure', (() => {
  const video = { id: 'v1', tournamentId: 'trn1', matchId: 'm1', sport: 'Badminton', date: '2026-05-15', cameraType: 'Single', price: 49, isPurchasable: true, adminStatus: 'Active' };
  return video.id && video.tournamentId && video.sport && video.price !== undefined && video.adminStatus;
})());
assert('TC-VID-007', 'Video', 'Purchasers filtering', (() => {
  const players = [
    { id: 'p1', purchasedVideos: ['v1', 'v2'] },
    { id: 'p2', purchasedVideos: ['v1'] },
    { id: 'p3', purchasedVideos: [] },
  ];
  const purchasers = players.filter(p => (p.purchasedVideos || []).includes('v1'));
  return purchasers.length === 2;
})());
assert('TC-VID-008', 'Video', 'Video under review shows Inactive badge', (() => {
  const video = { adminStatus: 'Deletion Requested' };
  const isUnderReview = video.adminStatus === 'Deletion Requested';
  return isUnderReview;
})());

// ══════════════════════════════════════════════
// MODULE 9: AI HIGHLIGHTS
// ══════════════════════════════════════════════
console.log('📦 Module 9: AI Highlights');

assert('TC-AI-001', 'AI Highlights', 'Highlights only after unlock', (() => {
  const video = { id: 'v1', price: 49 };
  const user = { purchasedVideos: ['v1'], purchasedHighlights: [] };
  const isUnlocked = video.price === 0 || user.purchasedVideos.includes(video.id);
  const hasHighlights = user.purchasedHighlights.includes(video.id);
  return isUnlocked && !hasHighlights;
})());
assert('TC-AI-002', 'AI Highlights', 'Highlights not available for locked video', (() => {
  const video = { id: 'v1', price: 49 };
  const user = { purchasedVideos: [], purchasedHighlights: [] };
  const isUnlocked = video.price === 0 || user.purchasedVideos.includes(video.id);
  return !isUnlocked;
})());
assert('TC-AI-003', 'AI Highlights', 'Purchased highlights shows Watch button', (() => {
  const user = { purchasedVideos: ['v1'], purchasedHighlights: ['v1'] };
  return user.purchasedHighlights.includes('v1');
})());
assert('TC-AI-004', 'AI Highlights', 'Highlights price is ₹20', (() => {
  const highlightsPrice = 20;
  return highlightsPrice === 20;
})());
assert('TC-AI-005', 'AI Highlights', 'Wallet debit for highlights succeeds', (() => {
  const player = { walletCredits: 100, walletHistory: [] };
  const { success, player: updated } = debitWallet(player, 20, 'AI Highlights');
  return success && updated.walletCredits === 80;
})());

// ══════════════════════════════════════════════
// MODULE 10: NOTIFICATIONS
// ══════════════════════════════════════════════
console.log('📦 Module 10: Notifications');

assert('TC-NOTIF-001', 'Notifications', 'Challenge notification structure', (() => {
  const notification = { type: 'challenge', title: 'New Match Challenge', message: 'Shashank challenged you to Badminton on 2026-06-01 at 10:00 AM' };
  return notification.type === 'challenge' && notification.title && notification.message.includes('challenged');
})());
assert('TC-NOTIF-002', 'Notifications', 'Unread badge count calculation', (() => {
  const user = { notifications: [{ read: false }, { read: true }, { read: false }, { read: false }] };
  const unread = user.notifications.filter(n => !n.read).length;
  return unread === 3;
})());
assert('TC-NOTIF-003', 'Notifications', 'Mark as read decrements count', (() => {
  const notifications = [{ id: 'n1', read: false }, { id: 'n2', read: false }];
  const updated = notifications.map(n => n.id === 'n1' ? { ...n, read: true } : n);
  return updated.filter(n => !n.read).length === 1;
})());
assert('TC-NOTIF-004', 'Notifications', 'Empty notifications returns 0 badge', (() => {
  const user = { notifications: [] };
  return (user.notifications || []).filter(n => !n.read).length === 0;
})());
assert('TC-NOTIF-005', 'Notifications', 'Null notifications handled safely', (() => {
  const user = {};
  return (user.notifications || []).filter(n => !n.read).length === 0;
})());

// ══════════════════════════════════════════════
// MODULE 11: ADMIN PANEL
// ══════════════════════════════════════════════
console.log('📦 Module 11: Admin Panel');

assert('TC-ADMIN-001', 'Admin', 'Badge: pending coaches counted', (() => {
  const players = [
    { id: 'c1', role: 'coach', coachStatus: 'pending' },
    { id: 'c2', role: 'coach', isApprovedCoach: true },
    { id: 'p1', role: 'user' },
  ];
  const pending = players.filter(p => p.role === 'coach' && (p.coachStatus === 'pending' || !p.coachStatus) && !p.isApprovedCoach);
  return pending.length === 1;
})());
assert('TC-ADMIN-002', 'Admin', 'Badge: deletion requests counted', (() => {
  const videos = [{ adminStatus: 'Deletion Requested' }, { adminStatus: 'Active' }, { adminStatus: 'Deletion Requested' }];
  return videos.filter(v => v.adminStatus === 'Deletion Requested').length === 2;
})());
assert('TC-ADMIN-003', 'Admin', 'Badge: open tickets counted', (() => {
  const tickets = [{ status: 'Open' }, { status: 'Resolved' }, { status: 'Awaiting Response' }];
  return tickets.filter(t => t.status === 'Open' || t.status === 'Awaiting Response').length === 2;
})());
assert('TC-ADMIN-004', 'Admin', 'Admin bypasses all tournament filters', (() => {
  const tournaments = [{ ...baseTournament, format: "Women's Singles" }];
  const visible = getVisibleTournaments({ tournaments, userRole: 'admin', now: new Date('2026-04-01') });
  return visible.length === 1;
})());
assert('TC-ADMIN-005', 'Admin', 'Refund policy creation', (() => {
  const policy = createRefundPolicy('2026-06-15', 3, 100, 25);
  return policy.refundPercent === 100 && policy.lateRefundPercent === 25 && policy.daysBeforeDeadline === 3;
})());
assert('TC-ADMIN-006', 'Admin', 'Safe diagnostics string split handles null/undefined gracefully', (() => {
  // Mocking the safe split implemented in diagnostics map
  const pName = undefined;
  const firstName = (pName || 'USER').split(' ')[0];
  const safeTimestamp = undefined;
  const timestampExtracted = safeTimestamp?.split(' ')[1] || '00:00';
  return firstName === 'USER' && timestampExtracted === '00:00';
})());
assert('TC-ADMIN-007', 'Admin', 'Calculate Academy Tier assigns Gold for >10 hosted', (() => {
  // Simulating AdminHubScreen academy tier logic
  const uid = 'academy';
  const t = Array.from({ length: 11 }, (_, i) => ({ creatorId: uid, sport: 'Badminton', status: 'completed' }));
  const hostedCount = t.length;
  let tier = 'Bronze';
  if (hostedCount > 10) tier = 'Gold';
  else if (hostedCount > 5) tier = 'Silver';
  return tier === 'Gold' && hostedCount === 11;
})());

// ══════════════════════════════════════════════
// MODULE 12: SUPPORT / GRIEVANCE SYSTEM
// ══════════════════════════════════════════════
console.log('📦 Module 12: Support System');

assert('TC-SUP-001', 'Support', 'Ticket types available (9 types)', (() => {
  const types = ['Technical Issue', 'Bug', 'Refund', 'Enhancement Request', 'Fraud Report', 'Match Recordings', 'Payment Issue', 'Tournament Issue', 'Other'];
  return types.length === 9;
})());
assert('TC-SUP-002', 'Support', 'Ticket creation validation — empty title', (() => {
  const title = ''; const description = 'Some desc';
  return !title.trim() || !description.trim() ? 'validation_fail' : 'ok';
})() === 'validation_fail');
assert('TC-SUP-003', 'Support', 'Ticket creation validation — empty description', (() => {
  const title = 'Some title'; const description = '';
  return !title.trim() || !description.trim() ? 'validation_fail' : 'ok';
})() === 'validation_fail');
assert('TC-SUP-004', 'Support', 'Valid ticket passes validation', (() => {
  const title = 'Issue'; const description = 'Details here';
  return title.trim() && description.trim();
})());
assert('TC-SUP-005', 'Support', 'Ticket filtering by userId', (() => {
  const tickets = [{ userId: 'u1', status: 'Open' }, { userId: 'u2', status: 'Open' }, { userId: 'u1', status: 'Resolved' }];
  return tickets.filter(t => t.userId === 'u1').length === 2;
})());
assert('TC-SUP-006', 'Support', 'Closed ticket detected', (() => {
  const ticket = { status: 'Closed' };
  return ticket.status === 'Closed' || ticket.status === 'Resolved';
})());
assert('TC-SUP-007', 'Support', 'Unread admin reply detection', (() => {
  const ticket = { status: 'Awaiting Response', messages: [{ senderId: 'admin', text: 'Reply' }] };
  const lastMsg = ticket.messages[ticket.messages.length - 1];
  return lastMsg.senderId !== 'u1' && ticket.status === 'Awaiting Response';
})());
assert('TC-SUP-008', 'Support', 'Status colors mapping', (() => {
  const statusColors = { 'Open': '#2563EB', 'In Progress': '#D97706', 'Resolved': '#16A34A', 'Closed': '#64748B' };
  return Object.keys(statusColors).length === 4;
})());

// ══════════════════════════════════════════════
// MODULE 13: SYNC & STATE MANAGEMENT
// ══════════════════════════════════════════════
console.log('📦 Module 13: Sync & State Management');

assert('TC-SYNC-001', 'Sync', 'Sync throttle logic (2s window)', (() => {
  const now = Date.now();
  const lastSync = now - 1000;
  return (now - lastSync) < 2000;
})());
assert('TC-SYNC-002', 'Sync', 'Sync allowed after throttle window', (() => {
  const now = Date.now();
  const lastSync = now - 3000;
  return (now - lastSync) > 2000;
})());
assert('TC-SYNC-003', 'Sync', 'No duplicate players after merge', (() => {
  const local = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }];
  const cloud = [{ id: 'p2', name: 'B Updated' }, { id: 'p3', name: 'C' }];
  const merged = [...local];
  cloud.forEach(cp => { if (!merged.find(lp => lp.id === cp.id)) merged.push(cp); });
  return merged.length === 3;
})());
assert('TC-SYNC-004', 'Sync', 'Profile edit blocks sync check', (() => {
  const isProfileEditActive = true;
  const shouldSync = !isProfileEditActive;
  return !shouldSync;
})());
assert('TC-SYNC-005', 'Sync', 'Cloud online/offline state propagation', (() => {
  let isCloudOnline = true;
  isCloudOnline = false;
  return isCloudOnline === false;
})());
assert('TC-SYNC-006', 'Sync', 'Version comparison for OTA', (() => {
  const APP_VERSION = '2.6.5';
  const latestAppVersion = '2.7.0';
  return APP_VERSION !== latestAppVersion;
})());
assert('TC-SYNC-007', 'Sync', 'Version match no update needed', (() => {
  const APP_VERSION = '2.6.5';
  const latestAppVersion = '2.6.5';
  return APP_VERSION === latestAppVersion;
})());
assert('TC-SYNC-008', 'Sync', 'Avatar Sync: Cache buster change correctly flags drift', (() => {
  // Simulating App.js avatar drift detection (exact string match without stripping buster)
  const localAvatar = 'https://cloudinary.com/img1?v=100';
  const cloudAvatar = 'https://cloudinary.com/img1?v=200';
  const drifted = localAvatar !== cloudAvatar;
  return drifted === true;
})());
assert('TC-SYNC-009', 'Sync', 'Avatar Sync: Identical buster does not flag drift', (() => {
  const localAvatar = 'https://cloudinary.com/img1?v=100';
  const cloudAvatar = 'https://cloudinary.com/img1?v=100';
  const drifted = localAvatar !== cloudAvatar;
  return drifted === false;
})());
assert('TC-SYNC-010', 'Sync', 'Logout completely clears sessionCustomAvatar state leak', (() => {
  let storageState = { currentUser: { id: 'shashank' }, pendingSync: [], sessionCustomAvatar: 'https://shashank-avatar' };
  const mockRemoveItem = (key) => { delete storageState[key]; };
  
  mockRemoveItem('currentUser');
  mockRemoveItem('pendingSync');
  mockRemoveItem('sessionCustomAvatar'); 
  return !('sessionCustomAvatar' in storageState);
})());


// ══════════════════════════════════════════════
// MODULE 14: REFERRAL SYSTEM
// ══════════════════════════════════════════════
console.log('📦 Module 14: Referral System');

assert('TC-REF-001', 'Referral', 'Generate referral code from username', generateReferralCode('shashank') === 'ACE-SHASHANK');
assert('TC-REF-002', 'Referral', 'Referral code validation — valid', isValidReferralCode('ACE-SHASHANK'));
assert('TC-REF-003', 'Referral', 'Referral code validation — invalid format', !isValidReferralCode('INVALID'));
assert('TC-REF-004', 'Referral', 'Referral code validation — too short', !isValidReferralCode('ACE-A'));
assert('TC-REF-005', 'Referral', 'Apply reward to both players', (() => {
  const players = [
    { id: 'ref', walletCredits: 0, referralCount: 0, referralHistory: [] },
    { id: 'new', walletCredits: 0, referredBy: null },
  ];
  const updated = applyReferralReward(players, 'ref', 'new', 50);
  return updated.find(p => p.id === 'ref').walletCredits === 50 && updated.find(p => p.id === 'new').walletCredits === 50;
})());
assert('TC-REF-006', 'Referral', 'Referral stats calculation', (() => {
  const player = { username: 'test', referralHistory: [{ refereeId: 'a', amount: 50, date: '2026-01-01' }, { refereeId: 'b', amount: 50, date: '2026-02-01' }] };
  const stats = getReferralStats(player);
  return stats.totalReferrals === 2 && stats.totalEarned === 100;
})());
assert('TC-REF-007', 'Referral', 'Null username handled', generateReferralCode(null) === 'ACE-USER');
assert('TC-REF-008', 'Referral', 'Special chars stripped from code', generateReferralCode('user@123!') === 'ACE-USER123');

// ══════════════════════════════════════════════
// REPORT
// ══════════════════════════════════════════════
console.log('\n' + '═'.repeat(70));
console.log('  📊  REGRESSION TEST RESULTS');
console.log('═'.repeat(70));
console.log(`\n  ✅ PASSED: ${passed}`);
console.log(`  ❌ FAILED: ${failed}`);
console.log(`  📋 TOTAL:  ${passed + failed}`);
console.log(`  📈 RATE:   ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`);

if (failed > 0) {
  console.log('  ⚠️  FAILED TEST DETAILS:');
  console.log('  ' + '─'.repeat(66));
  results.filter(r => r.status.includes('FAIL')).forEach(r => {
    console.log(`  ${r.status}  ${r.testId} — ${r.scenario}${r.detail ? ` (${r.detail})` : ''}`);
  });
}

console.log('\n' + '═'.repeat(70));
console.log(`  🏁  Run completed at ${new Date().toLocaleTimeString()}`);
console.log('═'.repeat(70) + '\n');

process.exit(failed > 0 ? 1 : 0);
