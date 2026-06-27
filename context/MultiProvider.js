import React from 'react';
import { AppProvider } from './AppContext';
import { AuthProvider } from './AuthContext';
import { SyncProvider } from './SyncContext';





import config from '../config';

const APP_VERSION = config.APP_VERSION;



import { MatchmakingProvider } from './MatchmakingContext';

export const MultiProvider = ({ children }) => {
  return (
    <AppProvider initialVersion={APP_VERSION}>
      <SyncProvider>
        <AuthProvider>
          <MatchmakingProvider>
            {children}
          </MatchmakingProvider>
        </AuthProvider>
      </SyncProvider>
    </AppProvider>
  );
};
