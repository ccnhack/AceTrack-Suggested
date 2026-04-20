import React from 'react';
import { AppProvider } from './AppContext';
import { AuthProvider } from './AuthContext';
import { SyncProvider } from './SyncContext';
import { PlayerProvider } from './PlayerContext';
import { TournamentProvider } from './TournamentContext';
import { VideoProvider } from './VideoContext';
import { SupportProvider } from './SupportContext';

import config from '../config';

const APP_VERSION = config.APP_VERSION;


import { AdminProvider } from './AdminContext';
import { MatchmakingProvider } from './MatchmakingContext';
import { EvaluationProvider } from './EvaluationContext';

export const MultiProvider = ({ children }) => {
  return (
    <AppProvider initialVersion={APP_VERSION}>
      <SyncProvider>
        <AuthProvider>
          <PlayerProvider>
            <TournamentProvider>
              <VideoProvider>
                <SupportProvider>
                  <AdminProvider>
                    <MatchmakingProvider>
                      <EvaluationProvider>
                        {children}
                      </EvaluationProvider>
                    </MatchmakingProvider>
                  </AdminProvider>
                </SupportProvider>
              </VideoProvider>
            </TournamentProvider>
          </PlayerProvider>
        </AuthProvider>
      </SyncProvider>
    </AppProvider>
  );
};
