import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    identifier: z.string().min(1, 'Username/Email is required'),
    password: z.string().min(1, 'Password is required')
  })
});

export const adminLoginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required')
  })
});

export const mfaVerifySchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    pin: z.string().min(4, 'PIN must be at least 4 digits')
  })
});

export const passwordResetRequestSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address')
  })
});

export const passwordResetConfirmSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters')
  })
});
