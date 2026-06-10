import express from 'express';
import createHydrateRoutes from './data/hydrate.mjs';
import createStatusRoutes from './data/status.mjs';
import createSaveRoutes from './data/save.mjs';
import createDiagnosticsRoutes from './data/diagnostics.mjs';
import createNotificationsRoutes from './data/notifications.mjs';
import createMediaRoutes from './data/media.mjs';

export default function createDataRoutes(deps) {
  const router = express.Router();
  router.use('/', createHydrateRoutes(deps));
  router.use('/', createStatusRoutes(deps));
  router.use('/', createSaveRoutes(deps));
  router.use('/', createDiagnosticsRoutes(deps));
  router.use('/', createNotificationsRoutes(deps));
  router.use('/', createMediaRoutes(deps));
  return router;
}
