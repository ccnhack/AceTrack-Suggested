import { StatusCode } from './statusCodes';

/**
 * 💬 Standardized Message Map
 * Maps internal status codes to user-facing messages.
 * Supports dynamic content via functions.
 */

type MessageResolver = (data?: any) => string;

export const MESSAGE_MAP: Partial<Record<StatusCode, MessageResolver>> = {
  // --- Tournament Operations ---
  PLAYER_REGISTERED: (data) => 
    `Successfully registered for ${data?.tournamentTitle || 'the tournament'}!`,
  
  TOURNAMENT_FULL: () => 
    'Tournament slots are full. You can join the waitlist.',
  
  JOINED_WAITLIST: (data) => 
    `You have joined the waitlist for ${data?.tournamentTitle || 'the tournament'}.`,
  
  ALREADY_REGISTERED: () => 
    'You are already registered for this tournament.',
  
  ALREADY_WAITLISTED: () => 
    'You are already on the waitlist for this tournament.',
  
  REGISTRATION_CLOSED: () => 
    'Registration for this tournament is now closed.',
  
  INTEREST_SUBMITTED: () => 
    'Thank you! Your interest has been sent to the academy for confirmation.',
  
  INTEREST_REMOVED: () => 
    'Your interest has been removed.',
  
  COACH_OPT_IN_SUCCESS: (data) => 
    `Successfully opted-in as a coach for ${data?.tournamentTitle || 'the event'}.`,

  // --- Payment & Wallet ---
  PAYMENT_SUCCESS: () => 
    'Payment completed successfully!',
  
  PAYMENT_FAILED: () => 
    'Payment failed. Please try again.',
  
  INSUFFICIENT_BALANCE: (data) => 
    `Insufficient balance. You need ₹${data?.required || 0} but only have ₹${data?.current || 0}.`,
  
  REFUND_PROCESSED: (data) => 
    `Refund of ₹${data?.amount || 0} has been processed successfully.`,

  // --- Auth & Profile ---
  PROFILE_UPDATED: () => 
    'Profile updated successfully.',
  
  VERIFICATION_REQUIRED: () => 
    'Email and Phone verification required before this action.',
  
  VERIFICATION_SUCCESS: () => 
    'Verification completed successfully!',
  
  UNAUTHORIZED: () => 
    'You do not have permission to perform this action.',

  // --- Matches ---
  SCORE_UPDATED: () => 
    'Match score updated successfully.',
  
  MATCH_COMPLETED: () => 
    'Match has been marked as completed.',
  
  EVALUATION_SAVED: () => 
    'Evaluation saved successfully.',

  // --- Matchmaking ---
  CHALLENGE_SENT: (data) => 
    `Challenge sent to ${data?.opponentName || 'opponent'}!`,
  
  CHALLENGE_ACCEPTED: (data) => 
    `Match accepted with ${data?.opponentName || 'opponent'}!`,
  
  CHALLENGE_DECLINED: () => 
    'Challenge has been declined.',
  
  CHALLENGE_CANCELLED: () => 
    'Challenge has been cancelled.',
  
  COUNTER_SENT: (data) => 
    `Counter proposal sent to ${data?.opponentName || 'opponent'}.`,

  // --- Support ---
  TICKET_CREATED: (data) => 
    `Support ticket ${data?.ticketId || ''} created successfully.`,
  
  ALREADY_SEEN: () => 
    '',

  // --- Coach Management ---
  COACH_APPROVED: () => 
    'Coach has been approved.',
  
  COACH_STATUS_UPDATED: () => 
    'Coach status updated.',
  
  COACH_ASSIGNED: () => 
    'Coach assigned to tournament.',
  
  COACH_REMOVED: () => 
    'Coach removed from tournament.',

  // --- Tournament Lifecycle ---
  TOURNAMENT_STARTED: () => 
    'Tournament has started!',
  
  TOURNAMENT_CONCLUDED: () => 
    'Tournament has been concluded.',
  
  TOURNAMENT_DELETED: () => 
    'Tournament has been removed.',

  // --- System ---
  SUCCESS: () => 
    'Operation successful.',
  
  ERROR: (data) => 
    `${data?.message || 'Something went wrong. Please try again.'}`,
  
  UNKNOWN_ERROR: () => 
    'An unknown error occurred.',
  
  OFFLINE: () => 
    'You are currently offline. Changes will sync when you reconnect.'
};
