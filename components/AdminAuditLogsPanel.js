import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

const AdminAuditLogsPanel = ({ auditLogs, players }) => {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.headerTitle}>System Audit Trails</Text>
      <View style={styles.logList}>
        {auditLogs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No activity logs available</Text>
          </View>
        ) : (
          auditLogs.map(log => {
            const admin = players.find(p => p.id === log.adminId);
            const targetColor = 
              log.targetType === 'video' ? '#3B82F6' :
              log.targetType === 'user' ? '#10B981' :
              log.targetType === 'tournament' ? '#A855F7' :
              '#94A3B8';

            return (
              <View key={log.id} style={styles.logCard}>
                <View style={styles.logHeader}>
                  <View style={styles.actionRow}>
                    <View style={[styles.indicator, { backgroundColor: targetColor }]} />
                    <View>
                      <Text style={styles.actionText}>{log.action}</Text>
                      <Text style={styles.timestamp}>{new Date(log.timestamp).toLocaleString()}</Text>
                    </View>
                  </View>
                  <View style={styles.targetBadge}>
                    <Text style={styles.targetText}>{log.targetType}</Text>
                  </View>
                </View>
                
                <View style={styles.logDetailsHost}>
                  <Text style={styles.detailsText}>{log.details}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>
                      Admin: <Text style={styles.metaValue}>{admin?.name || log.adminId}</Text>
                    </Text>
                    <Text style={styles.metaText}>
                      ID: <Text style={styles.metaValue}>{log.targetId}</Text>
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 20,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 16,
    paddingLeft: 4,
  },
  logList: {
    gap: 12,
  },
  emptyContainer: {
    padding: 60,
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#CBD5E1',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontStyle: 'italic',
  },
  logCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  timestamp: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  targetBadge: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  targetText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
    fontStyle: 'italic',
  },
  logDetailsHost: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 16,
  },
  detailsText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaValue: {
    color: '#334155',
  },
});

export default AdminAuditLogsPanel;
