import express from 'express';
import createSyncRoutes from './data/sync.mjs';
import createDiagnosticsRoutes from './data/diagnostics.mjs';
import createNotificationsRoutes from './data/notifications.mjs';
import createMediaRoutes from './data/media.mjs';

export default function createDataRoutes(deps) {
  const router = express.Router();
  router.use('/', createSyncRoutes(deps));
  router.use('/', createDiagnosticsRoutes(deps));
  router.use('/', createNotificationsRoutes(deps));
  router.use('/', createMediaRoutes(deps));
  return router;
}
