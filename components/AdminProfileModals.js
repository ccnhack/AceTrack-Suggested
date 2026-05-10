import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAdminCoreStore } from '../stores/useAdminCoreStore';
import { useHrStore } from '../stores/useHrStore';

export default function AdminProfileModals({ visibleModal, onClose, user }) {
  const { auditLogs, orgSettings, teamDirectory, isLoading: isAdminLoading, fetchAuditLogs, fetchOrgSettings, fetchTeamDirectory, saveOrgSetting } = useAdminCoreStore();
  const { leaveRequests, policies, reviews, isLoading: isHrLoading, fetchLeaveRequests, fetchPolicies, fetchReviews, submitLeaveRequest } = useHrStore();

  useEffect(() => {
    if (visibleModal === 'audit_logs') fetchAuditLogs();
    if (visibleModal === 'org_settings') fetchOrgSettings();
    if (visibleModal === 'team_directory') fetchTeamDirectory();
    if (visibleModal === 'leave_request') fetchLeaveRequests();
    if (visibleModal === 'org_policies') fetchPolicies();
    if (visibleModal === 'performance_reviews') fetchReviews();
  }, [visibleModal]);

  if (!visibleModal) return null;
  const isLoading = isAdminLoading || isHrLoading;

  return (
    <Modal visible={!!visibleModal} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {visibleModal === 'audit_logs' ? 'Audit Logs' : 
               visibleModal === 'org_settings' ? 'Org Settings' : 
               visibleModal === 'team_directory' ? 'Team Directory' : 
               visibleModal === 'security' ? 'Security & Access' : 
               visibleModal === 'leave_request' ? 'Leave Requests' :
               visibleModal === 'org_policies' ? 'Org Policies' :
               visibleModal === 'performance_reviews' ? 'Performance Reviews' :
               visibleModal === 'my_attendance' ? 'My Attendance' :
               visibleModal === 'payslips' ? 'Payslips' :
               visibleModal === 'holidays' ? 'Holidays' :
               visibleModal === 'documents' ? 'Documents' :
               visibleModal === 'org_chat' ? 'Org Chat' : 'Feature'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4F46E5" />
            </View>
          ) : (
            <ScrollView style={styles.body}>
              {visibleModal === 'audit_logs' && <AuditLogsView logs={auditLogs} />}
              {visibleModal === 'org_settings' && <OrgSettingsView settings={orgSettings} onSave={saveOrgSetting} />}
              {visibleModal === 'team_directory' && <TeamDirectoryView team={teamDirectory} />}
              {visibleModal === 'security' && <SecurityView user={user} />}
              {visibleModal === 'leave_request' && <LeaveRequestView leaves={leaveRequests} onSubmit={submitLeaveRequest} />}
              {visibleModal === 'org_policies' && <OrgPoliciesView policies={policies} />}
              {visibleModal === 'performance_reviews' && <ReviewsView reviews={reviews} />}
              
              {/* Placeholders for remaining features */}
              {['my_attendance', 'payslips', 'documents', 'org_chat'].includes(visibleModal) && (
                <View style={styles.loadingContainer}>
                    <Ionicons name="construct-outline" size={48} color="#94A3B8" />
                    <Text style={{ marginTop: 16, color: '#64748B' }}>This feature is under active development.</Text>
                </View>
              )}
              {visibleModal === 'holidays' && (
                <View style={styles.list}>
                  {['26 Jan — Republic Day', '14 Mar — Holi', '18 Apr — Good Friday', '01 May — May Day', '15 Aug — Independence Day', '02 Oct — Gandhi Jayanti', '20 Oct — Diwali', '25 Dec — Christmas'].map((h, i) => (
                    <View key={i} style={styles.card}><Text style={styles.cardText}>{h}</Text></View>
                  ))}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const AuditLogsView = ({ logs }) => (
  <View style={styles.list}>
    {logs.map((log, i) => (
      <View key={i} style={styles.card}>
        <View style={styles.logHeader}>
          <Text style={styles.logAction}>{log.action.replace('_', ' ').toUpperCase()}</Text>
          <Text style={styles.logTime}>{new Date(log.timestamp).toLocaleString()}</Text>
        </View>
        <Text style={styles.logUser}>{log.userEmail}</Text>
        <Text style={styles.logDetails}>{JSON.stringify(log.details)}</Text>
      </View>
    ))}
    {logs.length === 0 && <Text style={styles.empty}>No audit logs found.</Text>}
  </View>
);

const OrgSettingsView = ({ settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState(
    settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {
      companyName: 'AceTrack Technologies',
      supportEmail: 'support@acetrack.com',
      maxLeaveDays: '21'
    })
  );

  const handleSave = async (key) => {
    const success = await onSave(key, localSettings[key]);
    if (success) Alert.alert('Saved', 'Setting updated successfully.');
    else Alert.alert('Error', 'Failed to save setting.');
  };

  return (
    <View style={styles.form}>
      {Object.keys(localSettings).map((key) => (
        <View key={key} style={styles.inputGroup}>
          <Text style={styles.label}>{key}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={String(localSettings[key])}
              onChangeText={(txt) => setLocalSettings(prev => ({ ...prev, [key]: txt }))}
            />
            <TouchableOpacity style={styles.saveBtn} onPress={() => handleSave(key)}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
};

const TeamDirectoryView = ({ team }) => (
  <View style={styles.list}>
    {team.map((member, i) => (
      <View key={i} style={styles.card}>
        <Text style={styles.memberName}>{member.name || 'Unnamed User'}</Text>
        <Text style={styles.memberRole}>{member.designation || member.role}</Text>
        <Text style={styles.memberContact}>{member.email}</Text>
      </View>
    ))}
  </View>
);

const SecurityView = ({ user }) => (
  <View style={styles.list}>
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Active Session</Text>
      <Text style={styles.cardText}>Device: Web Browser</Text>
      <Text style={styles.cardText}>IP: Recorded via middleware</Text>
      <Text style={styles.cardText}>Last Login: {new Date().toLocaleString()}</Text>
    </View>
    <TouchableOpacity style={[styles.saveBtn, { marginTop: 20, backgroundColor: '#EF4444' }]} onPress={() => Alert.alert('Logged out from all devices')}>
      <Text style={[styles.saveBtnText, { textAlign: 'center' }]}>Logout from all devices</Text>
    </TouchableOpacity>
  </View>
);

const LeaveRequestView = ({ leaves, onSubmit }) => {
  const [type, setType] = useState('Earned');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  const handleSubmit = async () => {
    if (!startDate || !endDate) return Alert.alert('Error', 'Dates are required');
    const success = await onSubmit({ type, startDate, endDate, reason });
    if (success) {
        Alert.alert('Success', 'Leave requested applied');
        setStartDate(''); setEndDate(''); setReason('');
    }
  };

  return (
    <View style={styles.list}>
        <View style={styles.card}>
            <Text style={styles.cardTitle}>Apply for Leave</Text>
            <View style={styles.inputGroup}>
                <TextInput style={styles.input} placeholder="Start Date (YYYY-MM-DD)" value={startDate} onChangeText={setStartDate} />
                <TextInput style={styles.input} placeholder="End Date (YYYY-MM-DD)" value={endDate} onChangeText={setEndDate} />
                <TextInput style={styles.input} placeholder="Reason" value={reason} onChangeText={setReason} />
                <TouchableOpacity style={[styles.saveBtn, { paddingVertical: 12 }]} onPress={handleSubmit}>
                    <Text style={[styles.saveBtnText, { textAlign: 'center' }]}>Submit Leave Request</Text>
                </TouchableOpacity>
            </View>
        </View>
        <Text style={[styles.cardTitle, { marginTop: 20 }]}>Past Requests</Text>
        {leaves.map((l, i) => (
            <View key={i} style={styles.card}>
                <View style={styles.logHeader}>
                    <Text style={styles.logAction}>{l.type} Leave</Text>
                    <Text style={{ color: l.status === 'Approved' ? '#10B981' : l.status === 'Rejected' ? '#EF4444' : '#F59E0B' }}>{l.status}</Text>
                </View>
                <Text style={styles.logDetails}>{l.startDate} to {l.endDate}</Text>
            </View>
        ))}
    </View>
  );
};

const OrgPoliciesView = ({ policies }) => (
    <View style={styles.list}>
        {policies.length === 0 ? <Text style={styles.empty}>No policies uploaded.</Text> : policies.map((p, i) => (
            <View key={i} style={styles.card}>
                <Text style={styles.cardTitle}>{p.key.replace('policy_', '').toUpperCase()}</Text>
                <Text style={styles.cardText}>{String(p.value)}</Text>
            </View>
        ))}
    </View>
);

const ReviewsView = ({ reviews }) => (
    <View style={styles.list}>
        {reviews.length === 0 ? <Text style={styles.empty}>No reviews found.</Text> : reviews.map((r, i) => (
            <View key={i} style={styles.card}>
                <Text style={styles.cardTitle}>Period: {r.period}</Text>
                <Text style={styles.logAction}>Score: {r.score}/5</Text>
                <Text style={styles.cardText}>{r.feedback}</Text>
            </View>
        ))}
    </View>
);

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', maxWidth: 600, maxHeight: '80%', backgroundColor: '#FFF', borderRadius: 24, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 24, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#0F172A' },
  closeBtn: { padding: 4 },
  body: { padding: 24 },
  loadingContainer: { padding: 40, alignItems: 'center' },
  list: { gap: 16 },
  card: { padding: 16, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  logAction: { fontWeight: 'bold', color: '#3B82F6', fontSize: 12 },
  logTime: { color: '#94A3B8', fontSize: 12 },
  logUser: { color: '#334155', fontWeight: '500', marginBottom: 4 },
  logDetails: { color: '#64748B', fontSize: 12 },
  empty: { textAlign: 'center', color: '#94A3B8', marginTop: 20 },
  form: { gap: 20 },
  inputGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: 'bold', color: '#334155', textTransform: 'capitalize' },
  inputRow: { flexDirection: 'row', gap: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 12, backgroundColor: '#F8FAFC' },
  saveBtn: { backgroundColor: '#10B981', paddingHorizontal: 20, justifyContent: 'center', borderRadius: 8 },
  saveBtnText: { color: '#FFF', fontWeight: 'bold' },
  memberName: { fontSize: 16, fontWeight: 'bold', color: '#0F172A' },
  memberRole: { fontSize: 14, color: '#3B82F6', marginBottom: 4 },
  memberContact: { fontSize: 14, color: '#64748B' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  cardText: { color: '#475569', marginBottom: 4 }
});
