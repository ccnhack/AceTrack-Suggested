import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import storage from '../utils/storage';
import { syncManager } from '../services/SyncManager';
import { useSync } from './SyncContext';
import { eventBus } from '../services/EventBus';

const EvaluationContext = createContext(null);

export const useEvaluations = () => useContext(EvaluationContext);

export const EvaluationProvider = ({ children }) => {
  const [evaluations, setEvaluations] = useState([]);
  const evaluationsRef = useRef([]);
  const { syncAndSaveData } = useSync();

  useEffect(() => {
    evaluationsRef.current = evaluations;
  }, [evaluations]);

  // Initial Hydration
  useEffect(() => {
    const hydrate = async () => {
      const saved = await syncManager.getSystemFlag('evaluations');
      if (saved) setEvaluations(saved);
    };
    hydrate();
  }, []);

  // Entity Listener
  useEffect(() => {
    const unsub = eventBus.subscribe('ENTITY_UPDATED', async (e) => {
      const { entity, source } = e.payload;
      if (entity === 'evaluations' && (source === 'socket' || source === 'api')) {
        const freshData = await syncManager.getSystemFlag('evaluations');
        if (freshData) setEvaluations(freshData);
      }
    });
    return unsub;
  }, []);

  const onSaveEvaluation = useCallback((evaluationData) => {
    const updated = [evaluationData, ...evaluationsRef.current];
    setEvaluations(updated);
    syncAndSaveData({ evaluations: updated });
  }, [syncAndSaveData]);

  const value = {
    evaluations,
    setEvaluations,
    onSaveEvaluation
  };

  return (
    <EvaluationContext.Provider value={value}>
      {children}
    </EvaluationContext.Provider>
  );
};
