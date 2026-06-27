import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════
// 🏆 Tournament Validators — Zod Schemas
// Phase 4C: Production Hardening (v2.6.345)
// ═══════════════════════════════════════════════════════════════

export const registerPlayerSchema = z.object({
  body: z.object({
    tournamentId: z.string().min(1, 'Tournament ID is required'),
    playerId: z.string().min(1, 'Player ID is required'),
    partnerPreference: z.string().optional(),
    partnerName: z.string().optional(),
    skillLevel: z.string().optional()
  })
});

export const optOutSchema = z.object({
  body: z.object({
    tournamentId: z.string().min(1, 'Tournament ID is required'),
    playerId: z.string().min(1, 'Player ID is required'),
    reason: z.string().optional()
  })
});

export const startTournamentSchema = z.object({
  body: z.object({
    tournamentId: z.string().min(1, 'Tournament ID is required')
  })
});

export const endTournamentSchema = z.object({
  body: z.object({
    tournamentId: z.string().min(1, 'Tournament ID is required')
  })
});

export const joinTeamSchema = z.object({
  body: z.object({
    tournamentId: z.string().min(1, 'Tournament ID is required'),
    playerId: z.string().min(1, 'Player ID is required'),
    teamId: z.string().optional(),
    teamName: z.string().optional()
  })
});

export const manageInterestedSchema = z.object({
  body: z.object({
    tournamentId: z.string().min(1, 'Tournament ID is required'),
    action: z.enum(['approve', 'reject', 'waitlist']),
    coachId: z.string().min(1, 'Coach ID is required')
  })
});

export const partnerChatSchema = z.object({
  body: z.object({
    tournamentId: z.string().min(1, 'Tournament ID is required'),
    content: z.string().min(1, 'Message content is required').max(2000, 'Message too long')
  })
});

export const createTournamentSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title is required').max(100),
    type: z.enum(['singles', 'doubles', 'mixed_doubles']).optional(),
    maxPlayers: z.number().int().positive().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    description: z.string().max(1000).optional()
  })
});
