import { z } from 'zod';

// Middleware generator to wrap schemas
export const validateSchema = (schema, property = 'body') => {
  return (req, res, next) => {
    try {
      req[property] = schema.parse(req[property]);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: err.errors
        });
      }
      next(err);
    }
  };
};

export const createTournamentSchema = z.object({
  tournament: z.object({
    name: z.string().min(1, "Tournament name is required"),
    sport: z.string().min(1, "Sport is required"),
    type: z.enum(['knockout', 'league', 'hybrid', 'custom']).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    location: z.string().min(1, "Location is required"),
    maxParticipants: z.number().int().positive().optional(),
    isTeam: z.boolean().optional(),
    teamSize: z.number().int().positive().optional(),
  })
});

export const updateTournamentSchema = createTournamentSchema; // Reusing structure

export const registerPlayerSchema = z.object({
  category: z.string().optional(),
  partnerId: z.string().optional(),
  teamCode: z.string().optional(),
});
