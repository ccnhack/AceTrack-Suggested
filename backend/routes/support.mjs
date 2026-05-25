import express from 'express';
import createAuthRoutes from './support/auth.mjs';
import createOnboardingRoutes from './support/onboarding.mjs';
import createManagementRoutes from './support/management.mjs';
import createOperationsRoutes from './support/operations.mjs';

export default function createSupportRoutes(deps) {
  const router = express.Router();
  router.use('/', createAuthRoutes(deps));
  router.use('/', createOnboardingRoutes(deps));
  router.use('/', createManagementRoutes(deps));
  router.use('/', createOperationsRoutes(deps));
  return router;
}
