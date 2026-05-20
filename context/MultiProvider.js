import React from 'react';
import { AppProvider } from './AppContext';
import { AuthProvider } from './AuthContext';
import { SyncProvider } from './SyncContext';
import { PlayerProvider } from './PlayerContext';

import { VideoProvider } from './VideoContext';
import { SupportProvider } from './SupportContext';

import config from '../config';

const APP_VERSION = config.APP_VERSION;


import { AdminProvider } from './AdminContext';
import { MatchmakingProvider } from './MatchmakingContext';

export const MultiProvider = ({ children }) => {
  return (
    <AppProvider initialVersion={APP_VERSION}>
      <SyncProvider>
        <AuthProvider>
          <PlayerProvider>
              <VideoProvider>
                <SupportProvider>
                  <AdminProvider>
                    <MatchmakingProvider>
                      {children}
                    </MatchmakingProvider>
                  </AdminProvider>
                </SupportProvider>
              </VideoProvider>
          </PlayerProvider>
        </AuthProvider>
      </SyncProvider>
    </AppProvider>
  );
};
