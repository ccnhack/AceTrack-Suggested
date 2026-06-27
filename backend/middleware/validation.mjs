import { z } from 'zod';

/**
 * Creates an Express middleware that validates the request against a Zod schema.
 * @param {z.ZodSchema} schema - The Zod schema to validate against (can contain body, query, params)
 */
export const validateRequest = (schema) => (req, res, next) => {
  try {
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    next();
  } catch (err) {
    if (err instanceof z.ZodError) {
      const formattedErrors = err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: formattedErrors,
      });
    }
    next(err);
  }
};
