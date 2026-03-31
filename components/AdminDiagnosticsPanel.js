import React, { useState, useMemo, useEffect } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, Image, 
  StyleSheet, TextInput, Alert, ActivityIndicator, FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSafeAvatar } from '../utils/imageUtils';
import logger from '../utils/logger';
import config from '../config';

const AdminDiagnosticsPanel = ({ 
  players, 
  socketRef, 
  isCloudOnline, 
  isUsingCloud, 
  onManualSync 
}) => {
  const [diagUserSearch, setDiagUserSearch] = useState('');
  const [selectedDiagUser, setSelectedDiagUser] = useState(null);
  const [userDiagFiles, setUserDiagFiles] = useState([]);
  const [isFetchingDiags, setIsFetchingDiags] = useState(false);
  const [onlineDevices, setOnlineDevices] = useState({});

  const targetCloudUrl = 'https://acetrack-suggested.onrender.com';
  const activeApiUrl = isUsingCloud ? targetCloudUrl : config.API_BASE_URL;

  // Memoize filtered players for diagnostics selection
  const filteredDiagPlayers = useMemo(() => {
    const s = diagUserSearch.toLowerCase().trim();
    return (players || []).filter(p => {
      if (!p) return false;
      const name = (p.name || '').toLowerCase();
      const id = String(p.id || '').toLowerCase();
      const email = (p.email || '').toLowerCase();
      if (s) return name.includes(s) || id.includes(s) || email.includes(s);
      
      const priorityNames = ['shashank', 'pranshu', 'riya', 'saumya', 'academy', 'coach'];
      return priorityNames.some(m => name.includes(m) || id.includes(m) || email.includes(m));
    });
  }, [players, diagUserSearch]);

  const handleFetchFiles = async (p) => {
    setSelectedDiagUser(p);
    setUserDiagFiles([]);
    setIsFetchingDiags(true);
    
    // PING DEVICE (Local socket logic)
    if (socketRef && socketRef.current) {
        socketRef.current.emit('admin_ping_device', { targetUserId: p.id });
        // Coalesce status in this component
        setOnlineDevices(prev => {
            const next = { ...prev };
            delete next[p.id];
            return next;
        });
    }

    const url = `${activeApiUrl}/api/diagnostics`;
    try {
      const res = await fetch(url, { headers: { 'x-ace-api-key': config.ACE_API_KEY } });
      if (res.ok) {
        const data = await res.json();
        const safeName = p.name ? p.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() : '';
        const safeId = p.id ? String(p.id).replace(/[^a-z0-9]/gi, '_').toLowerCase() : '';
        const safeEmail = p.email ? p.email.split('@')[0].replace(/[^a-z0-9]/gi, '_').toLowerCase() : '';
        
        let fs = (data?.files || []).filter(f => {
          if (!f) return false;
          const low = f.toLowerCase();
          return low.startsWith(safeName + '_') || 
                 low.startsWith(safeId + '_') ||
                 low.startsWith(safeEmail + '_') ||
                 low.startsWith('admin_requested_' + safeName + '_') ||
                 low.includes(`_${safeName}_`);
        });
        
        const getTs = (f) => {
          const m = f.match(/(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})|(\d{8}_\d{6})/);
          return m ? m[0].replace(/[-_]/g, '') : f;
        };
        fs = fs.sort((a, b) => getTs(b).localeCompare(getTs(a))).slice(0, 5);
        setUserDiagFiles(fs);
      }
    } catch (e) {
      logger.logAction('DIAG_FETCH_ERR', { error: e.message });
    } finally {
      setIsFetchingDiags(false);
    }
  };

  const renderUserItem = ({ item }) => (
    <TouchableOpacity 
      key={item.id} 
      onPress={() => handleFetchFiles(item)}
      style={[styles.miniUserCard, selectedDiagUser?.id === item.id && styles.miniUserCardActive]}
    >
      <Image source={getSafeAvatar(item.avatar, item.name)} style={styles.miniAvatar} />
      <View style={{ alignItems: 'center' }}>
        <Text style={[styles.miniUserName, selectedDiagUser?.id === item.id && styles.miniUserNameActive]} numberOfLines={1}>
          {(item.name || 'User').split(' ')[0]}
        </Text>
        <Text style={{ fontSize: 8, color: selectedDiagUser?.id === item.id ? '#FFFFFF' : '#94A3B8', fontWeight: 'bold' }}>
          ({item.id.slice(0, 8)})
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.diagHeaderRow}>
        <Text style={styles.sectionTitle}>System Diagnostics</Text>
        <TouchableOpacity 
          onPress={() => onManualSync?.(true)}
          style={styles.diagSyncBtn}
        >
          <Ionicons name="refresh-circle" size={16} color="#FFFFFF" />
          <Text style={styles.diagSyncBtnText}>Force Sync</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.diagSearchBox}>
        <Ionicons name="people-outline" size={16} color="#64748B" />
        <TextInput 
           placeholder="Search user..."
           value={diagUserSearch}
           onChangeText={setDiagUserSearch}
           style={styles.diagSearchInput}
        />
      </View>

      <FlatList 
        horizontal
        showsHorizontalScrollIndicator={false}
        data={filteredDiagPlayers}
        keyExtractor={item => item.id}
        renderItem={renderUserItem}
        contentContainerStyle={styles.userListScroll}
        removeClippedSubviews={true} // Performance
      />

      {selectedDiagUser && (
          <View style={styles.detailsPanel}>
             <Text style={styles.panelTitle}>Diagnostic Reports for {selectedDiagUser.name}</Text>
             {isFetchingDiags ? (
                 <ActivityIndicator size="small" color="#6366F1" style={{ marginVertical: 20 }} />
             ) : (
                 <View style={styles.fileList}>
                    {userDiagFiles.map(f => (
                        <TouchableOpacity key={f} style={styles.fileCard} onPress={() => Alert.alert("Report Selected", f)}>
                           <Ionicons name="document-attach" size={20} color="#6366F1" />
                           <Text style={styles.fileName}>{f}</Text>
                           <Ionicons name="chevron-forward" size={16} color="#CBD5E1" />
                        </TouchableOpacity>
                    ))}
                    {userDiagFiles.length === 0 && (
                        <Text style={styles.emptyText}>No reports found for this user.</Text>
                    )}
                 </View>
             )}
          </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  diagHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 2,
    flex: 1,
  },
  diagSyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  diagSyncBtnText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '900',
  },
  diagSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 20,
  },
  diagSearchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 13,
    color: '#0F172A',
    marginLeft: 10,
  },
  userListScroll: {
    paddingBottom: 4,
    gap: 12,
  },
  miniUserCard: {
    width: 80,
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  miniUserCardActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  miniAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 8,
  },
  miniUserName: {
    fontSize: 10,
    fontWeight: '900',
    color: '#334155',
    textAlign: 'center',
  },
  miniUserNameActive: {
    color: '#FFF',
  },
  detailsPanel: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  panelTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  fileList: {
    gap: 10,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 14,
    borderRadius: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  fileName: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
    padding: 20,
  }
});

export default React.memo(AdminDiagnosticsPanel);
