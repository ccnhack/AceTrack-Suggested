import { z } from 'zod';

// Re-using the validator middleware from tournamentValidators
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

export const createTicketSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  category: z.string().min(1, "Category is required"),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().min(1, "Description is required"),
});

export const updateTicketStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
});

export const sendChatMessageSchema = z.object({
  message: z.string().min(1, "Message cannot be empty"),
  sender: z.enum(['user', 'support', 'admin', 'system']).optional(), // Defaults to user in route
});
