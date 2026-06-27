import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════
// 🎫 Support Validators — Zod Schemas
// Phase 4D: Production Hardening (v2.6.345)
// ═══════════════════════════════════════════════════════════════

export const createTicketSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title is required').max(200),
    type: z.string().min(1, 'Ticket type is required'),
    description: z.string().min(1, 'Description is required').max(5000),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional()
  })
});

export const replyTicketSchema = z.object({
  body: z.object({
    ticketId: z.string().min(1, 'Ticket ID is required'),
    text: z.string().min(1, 'Reply text is required').max(5000),
    imageUri: z.string().url().optional().or(z.literal(''))
  })
});

export const updateTicketStatusSchema = z.object({
  body: z.object({
    ticketId: z.string().min(1, 'Ticket ID is required'),
    status: z.enum(['Open', 'In Progress', 'Awaiting Response', 'Resolved', 'Closed']),
    justification: z.string().max(1000).optional()
  })
});

export const reassignTicketSchema = z.object({
  body: z.object({
    ticketId: z.string().min(1, 'Ticket ID is required'),
    assignToId: z.string().min(1, 'Assignee ID is required'),
    reason: z.string().max(500).optional()
  })
});

export const manageUserSchema = z.object({
  body: z.object({
    targetUserId: z.string().min(1, 'Target user ID is required'),
    status: z.enum(['active', 'suspended', 'terminated']).optional(),
    level: z.string().optional()
  })
});

export const forceResetSchema = z.object({
  body: z.object({
    targetUserId: z.string().min(1, 'Target user ID is required')
  })
});
