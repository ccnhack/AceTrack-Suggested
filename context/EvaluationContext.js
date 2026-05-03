import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { syncManager } from '../services/SyncManager';
import { useSync } from './SyncContext';
import { useEvaluationsStore } from '../stores';
import { useEvaluationsQuery } from '../stores/hooks';

const EvaluationContext = createContext(null);

export const useEvaluations = () => {
  const { data: evaluations } = useEvaluationsQuery();
  const context = useContext(EvaluationContext);

  return { 
    evaluations: evaluations || [], 
    ...context 
  };
};

export const EvaluationProvider = ({ children }) => {
  const setEvaluationsStore = useEvaluationsStore(s => s.setEvaluations);
  const { syncAndSaveData } = useSync();

  const onSaveEvaluation = useCallback((evaluationData) => {
    const currentEvaluations = useEvaluationsStore.getState().evaluations;
    const updated = [evaluationData, ...currentEvaluations];
    setEvaluationsStore(updated);
    syncAndSaveData({ evaluations: updated });
  }, [syncAndSaveData, setEvaluationsStore]);

  const value = useMemo(() => ({
    setEvaluations: setEvaluationsStore,
    onSaveEvaluation
  }), [setEvaluationsStore, onSaveEvaluation]);

  return (
    <EvaluationContext.Provider value={value}>
      {children}
    </EvaluationContext.Provider>
  );
};
