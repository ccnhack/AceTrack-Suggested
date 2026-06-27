import express from 'express';
import { createSupportOperationsRouter } from '../../services/SupportOperationsService.mjs';
import { createSupportShiftRouter } from '../../services/SupportShiftService.mjs';

// 🏗️ PHASE 1B DECOMPOSITION: 
// All massive support ticket and shift logic has been extracted into dedicated services.
export default function (deps) {
  const router = express.Router();
  
  // Mount the decomposed routers
  router.use(createSupportOperationsRouter(deps));
  router.use(createSupportShiftRouter(deps));

  return router;
}
