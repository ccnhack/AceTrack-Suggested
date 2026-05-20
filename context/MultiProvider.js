import React from 'react';
import { AppProvider } from './AppContext';
import { AuthProvider } from './AuthContext';
import { SyncProvider } from './SyncContext';


import { VideoProvider } from './VideoContext';


import config from '../config';

const APP_VERSION = config.APP_VERSION;


import { AdminProvider } from './AdminContext';
import { MatchmakingProvider } from './MatchmakingContext';

export const MultiProvider = ({ children }) => {
  return (
    <AppProvider initialVersion={APP_VERSION}>
      <SyncProvider>
        <AuthProvider>
              <VideoProvider>
                <AdminProvider>
                  <MatchmakingProvider>
                    {children}
                  </MatchmakingProvider>
                </AdminProvider>
              </VideoProvider>
        </AuthProvider>
      </SyncProvider>
    </AppProvider>
  );
};
