import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { useAdminCoreStore } from '../stores/useAdminCoreStore';
import { useHrStore } from '../stores/useHrStore';
import { useCommsStore } from '../stores/useCommsStore';
import { socketService } from '../services/sync/SocketService';

export default function AdminProfileModals({ visibleModal, onClose, user }) {
  const { auditLogs, orgSettings, teamDirectory, isLoading: isAdminLoading, fetchAuditLogs, fetchOrgSettings, fetchTeamDirectory, saveOrgSetting } = useAdminCoreStore();
  const { leaveRequests, policies, reviews, attendance, payslips, documents, isLoading: isHrLoading, fetchLeaveRequests, fetchPolicies, fetchReviews, fetchAttendance, checkIn, checkOut, fetchPayslips, fetchDocuments, submitLeaveRequest } = useHrStore();
  const { messages, announcements, isLoading: isCommsLoading, fetchMessages, sendMessage, appendMessage, fetchAnnouncements } = useCommsStore();

  useEffect(() => {
    if (visibleModal === 'audit_logs') fetchAuditLogs();
    if (visibleModal === 'org_settings') fetchOrgSettings();
    if (visibleModal === 'team_directory') fetchTeamDirectory();
    if (visibleModal === 'leave_request') fetchLeaveRequests();
    if (visibleModal === 'org_policies') fetchPolicies();
    if (visibleModal === 'performance_reviews') fetchReviews();
    if (visibleModal === 'my_attendance') fetchAttendance();
    if (visibleModal === 'payslips') fetchPayslips();
    if (visibleModal === 'documents') fetchDocuments();
    if (visibleModal === 'documents') fetchDocuments();
    if (visibleModal === 'org_chat') {
        fetchMessages();
        fetchTeamDirectory();
    }
    if (visibleModal === 'announcements') fetchAnnouncements();
  }, [visibleModal]);

  if (!visibleModal) return null;
  const isLoading = isAdminLoading || isHrLoading || isCommsLoading;

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
               visibleModal === 'org_chat' ? 'Org Chat' : 
               visibleModal === 'announcements' ? 'Announcements' : 'Feature'}
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
              {visibleModal === 'my_attendance' && <AttendanceView attendance={attendance} onCheckIn={checkIn} onCheckOut={checkOut} />}
              {visibleModal === 'payslips' && <PayslipsView payslips={payslips} />}
              {visibleModal === 'documents' && <DocumentsView documents={documents} />}
              {visibleModal === 'org_chat' && <OrgChatView messages={messages} onSend={sendMessage} user={user} teamDirectory={teamDirectory} />}
              {visibleModal === 'announcements' && <AnnouncementsView announcements={announcements} />}
              
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
  const [showCalendarFor, setShowCalendarFor] = useState(null); // 'start' | 'end' | null
  const [showDropdown, setShowDropdown] = useState(false);

  // Mock balances for now
  const leaveBalances = {
    Earned: 12,
    Sick: 8,
    Casual: 4
  };

  const handleSubmit = async () => {
    if (!startDate || !endDate) return Alert.alert('Error', 'Dates are required');
    if (!reason) return Alert.alert('Error', 'Please provide a reason');
    
    const success = await onSubmit({ type, startDate, endDate, reason });
    if (success) {
        Alert.alert('Success', 'Leave requested applied');
        setStartDate(''); setEndDate(''); setReason('');
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <View style={styles.list}>
        {/* Balances Section */}
        <View style={[styles.card, { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 20, backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
            <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#2563EB' }}>{leaveBalances.Earned}</Text>
                <Text style={{ fontSize: 12, color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase', marginTop: 4 }}>Earned Leaves</Text>
            </View>
            <View style={{ width: 1, backgroundColor: '#BFDBFE' }} />
            <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#EF4444' }}>{leaveBalances.Sick}</Text>
                <Text style={{ fontSize: 12, color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase', marginTop: 4 }}>Sick Leaves</Text>
            </View>
        </View>

        <View style={styles.card}>
            <Text style={styles.cardTitle}>Apply for Leave</Text>
            <View style={styles.inputGroup}>
                
                {/* Leave Type Dropdown */}
                <View style={{ zIndex: 10 }}>
                  <Text style={styles.label}>Leave Type</Text>
                  <TouchableOpacity 
                    style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} 
                    onPress={() => setShowDropdown(!showDropdown)}
                  >
                    <Text style={{ color: '#0F172A', fontSize: 14 }}>{type} Leave</Text>
                    <Ionicons name={showDropdown ? "chevron-up" : "chevron-down"} size={20} color="#64748B" />
                  </TouchableOpacity>
                  
                  {showDropdown && (
                    <View style={{ backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, marginTop: 4, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 }}>
                      {Object.keys(leaveBalances).map((leaveType) => (
                        <TouchableOpacity 
                          key={leaveType}
                          style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}
                          onPress={() => { setType(leaveType); setShowDropdown(false); }}
                        >
                          <Text style={{ color: type === leaveType ? '#2563EB' : '#334155', fontWeight: type === leaveType ? 'bold' : 'normal' }}>
                            {leaveType} Leave ({leaveBalances[leaveType]} remaining)
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {/* Dates */}
                <View style={{ flexDirection: 'row', gap: 12, zIndex: 1, marginTop: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Start Date</Text>
                    <TouchableOpacity style={[styles.input, { flexDirection: 'row', alignItems: 'center', gap: 8 }]} onPress={() => setShowCalendarFor('start')}>
                      <Ionicons name="calendar-outline" size={18} color="#64748B" />
                      <Text style={{ color: startDate ? '#0F172A' : '#94A3B8' }}>{startDate || 'Select Date'}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>End Date</Text>
                    <TouchableOpacity style={[styles.input, { flexDirection: 'row', alignItems: 'center', gap: 8 }]} onPress={() => setShowCalendarFor('end')}>
                      <Ionicons name="calendar-outline" size={18} color="#64748B" />
                      <Text style={{ color: endDate ? '#0F172A' : '#94A3B8' }}>{endDate || 'Select Date'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={{ zIndex: 1, marginTop: 8 }}>
                  <Text style={styles.label}>Reason</Text>
                  <TextInput 
                    style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]} 
                    placeholder="Briefly explain why you need leave..." 
                    value={reason} 
                    onChangeText={setReason} 
                    multiline={true}
                  />
                </View>

                <TouchableOpacity style={[styles.saveBtn, { paddingVertical: 14, marginTop: 16 }]} onPress={handleSubmit}>
                    <Text style={[styles.saveBtnText, { textAlign: 'center', fontSize: 16 }]}>Submit Request</Text>
                </TouchableOpacity>
            </View>
        </View>

        <Text style={[styles.cardTitle, { marginTop: 20 }]}>Past Requests</Text>
        {leaves.map((l, i) => (
            <View key={i} style={styles.card}>
                <View style={styles.logHeader}>
                    <Text style={styles.logAction}>{l.type} Leave</Text>
                    <Text style={{ color: l.status === 'Approved' ? '#10B981' : l.status === 'Rejected' ? '#EF4444' : '#F59E0B', fontWeight: 'bold' }}>{l.status}</Text>
                </View>
                <Text style={styles.logDetails}>{l.startDate} to {l.endDate}</Text>
                {l.reason && <Text style={{ fontSize: 12, color: '#475569', marginTop: 8 }}>"{l.reason}"</Text>}
            </View>
        ))}

        {/* Calendar Picker Modal */}
        {showCalendarFor && (
            <Modal visible={true} transparent={true} animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <View style={{ backgroundColor: '#FFF', borderRadius: 20, width: '100%', maxWidth: 400, overflow: 'hidden' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#0F172A' }}>
                                Select {showCalendarFor === 'start' ? 'Start' : 'End'} Date
                            </Text>
                            <TouchableOpacity onPress={() => setShowCalendarFor(null)}>
                                <Ionicons name="close" size={24} color="#64748B" />
                            </TouchableOpacity>
                        </View>
                        <Calendar
                            current={today}
                            onDayPress={(day) => {
                                if (showCalendarFor === 'start') {
                                    setStartDate(day.dateString);
                                    if (!endDate || day.dateString > endDate) {
                                        setEndDate(day.dateString);
                                    }
                                } else {
                                    setEndDate(day.dateString);
                                    if (startDate && day.dateString < startDate) {
                                        setStartDate(day.dateString);
                                    }
                                }
                                setShowCalendarFor(null);
                            }}
                            markedDates={{
                                [showCalendarFor === 'start' ? startDate : endDate]: { selected: true, selectedColor: '#2563EB' }
                            }}
                            theme={{
                                todayTextColor: '#2563EB',
                                selectedDayBackgroundColor: '#2563EB',
                                arrowColor: '#2563EB',
                            }}
                        />
                    </View>
                </View>
            </Modal>
        )}
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

const AttendanceView = ({ attendance, onCheckIn, onCheckOut }) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayRecord = attendance.find(a => a.date === todayStr);

    return (
        <View style={styles.list}>
            <View style={[styles.card, { alignItems: 'center', paddingVertical: 24 }]}>
                <Text style={styles.cardTitle}>Today's Attendance</Text>
                <Text style={styles.cardText}>{todayStr}</Text>
                
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 24 }}>
                    <TouchableOpacity 
                        style={[styles.saveBtn, { backgroundColor: todayRecord?.checkIn ? '#94A3B8' : '#10B981', paddingVertical: 12 }]} 
                        onPress={onCheckIn}
                        disabled={!!todayRecord?.checkIn}
                    >
                        <Text style={styles.saveBtnText}>{todayRecord?.checkIn ? `Checked In: ${new Date(todayRecord.checkIn).toLocaleTimeString()}` : 'Check In'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={[styles.saveBtn, { backgroundColor: (!todayRecord?.checkIn || todayRecord?.checkOut) ? '#94A3B8' : '#EF4444', paddingVertical: 12 }]} 
                        onPress={onCheckOut}
                        disabled={!todayRecord?.checkIn || !!todayRecord?.checkOut}
                    >
                        <Text style={styles.saveBtnText}>{todayRecord?.checkOut ? `Checked Out: ${new Date(todayRecord.checkOut).toLocaleTimeString()}` : 'Check Out'}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <Text style={[styles.cardTitle, { marginTop: 20 }]}>Recent History</Text>
            {attendance.filter(a => a.date !== todayStr).map((a, i) => (
                <View key={i} style={styles.card}>
                    <View style={styles.logHeader}>
                        <Text style={styles.cardTitle}>{a.date}</Text>
                        <Text style={{ color: '#10B981', fontWeight: 'bold' }}>{a.status}</Text>
                    </View>
                    <Text style={styles.cardText}>In: {a.checkIn ? new Date(a.checkIn).toLocaleTimeString() : '--:--'}</Text>
                    <Text style={styles.cardText}>Out: {a.checkOut ? new Date(a.checkOut).toLocaleTimeString() : '--:--'}</Text>
                </View>
            ))}
        </View>
    );
};

const PayslipsView = ({ payslips }) => (
    <View style={styles.list}>
        {payslips.length === 0 ? <Text style={styles.empty}>No payslips generated yet.</Text> : payslips.map((p, i) => (
            <View key={i} style={styles.card}>
                <View style={styles.logHeader}>
                    <Text style={styles.cardTitle}>{p.month}</Text>
                    <TouchableOpacity onPress={() => Alert.alert('Downloading', 'PDF download starting...')}>
                        <Ionicons name="download-outline" size={24} color="#3B82F6" />
                    </TouchableOpacity>
                </View>
                <Text style={styles.logTime}>Generated on {new Date(p.uploadedAt).toLocaleDateString()}</Text>
            </View>
        ))}
    </View>
);

const DocumentsView = ({ documents }) => (
    <View style={styles.list}>
        <TouchableOpacity style={[styles.card, { alignItems: 'center', borderStyle: 'dashed', borderColor: '#3B82F6', backgroundColor: '#EFF6FF' }]} onPress={() => Alert.alert('Upload', 'Opening file picker...')}>
            <Ionicons name="cloud-upload-outline" size={32} color="#3B82F6" />
            <Text style={[styles.cardTitle, { color: '#3B82F6', marginTop: 8 }]}>Upload New Document</Text>
        </TouchableOpacity>

        <Text style={[styles.cardTitle, { marginTop: 20 }]}>My Documents</Text>
        {documents.length === 0 ? <Text style={styles.empty}>No documents uploaded.</Text> : documents.map((d, i) => (
            <View key={i} style={styles.card}>
                <View style={styles.logHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="document-text-outline" size={20} color="#64748B" />
                        <Text style={styles.cardTitle}>{d.title}</Text>
                    </View>
                    <Text style={styles.logAction}>{d.type}</Text>
                </View>
            </View>
        ))}
    </View>
);

const OrgChatView = ({ messages, onSend, user, teamDirectory }) => {
    const [activeChatUser, setActiveChatUser] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [msg, setMsg] = useState('');
    const { appendMessage } = useCommsStore();

    useEffect(() => {
        const socket = socketService.getSocket();
        if (!socket) return;
        
        const handleNewMessage = (newMsg) => {
            appendMessage(newMsg);
        };
        socket.on('org_chat_message', handleNewMessage);
        
        return () => {
            socket.off('org_chat_message', handleNewMessage);
        };
    }, []);

    const handleSend = () => {
        if (!msg.trim() || !activeChatUser) return;
        onSend(msg, activeChatUser.id);
        setMsg('');
    };

    if (!activeChatUser) {
        const filteredContacts = (teamDirectory || []).filter(c => 
            c.id !== user.id && 
            (c.role === 'support' || c.role === 'admin') &&
            (c.name || '').toLowerCase().includes(searchQuery.toLowerCase())
        );

        return (
            <View style={[styles.list, { height: '100%', flex: 1 }]}>
                <View style={{ marginBottom: 16 }}>
                    <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }]}>
                        <Ionicons name="search" size={20} color="#94A3B8" style={{ marginRight: 8 }} />
                        <TextInput 
                            style={{ flex: 1, fontSize: 16, color: '#0F172A', outlineStyle: 'none' }} 
                            placeholder="Search support employees..." 
                            placeholderTextColor="#94A3B8"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </View>
                </View>
                <ScrollView style={{ flex: 1 }}>
                    {filteredContacts.length === 0 ? (
                        <Text style={styles.empty}>No contacts found.</Text>
                    ) : (
                        filteredContacts.map((contact, i) => (
                            <TouchableOpacity 
                                key={i} 
                                style={[styles.card, { flexDirection: 'row', alignItems: 'center', padding: 16 }]}
                                onPress={() => setActiveChatUser(contact)}
                            >
                                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginRight: 16 }}>
                                    <Text style={{ color: '#2563EB', fontWeight: 'bold', fontSize: 18 }}>{(contact.name || '?').charAt(0).toUpperCase()}</Text>
                                </View>
                                <View>
                                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#0F172A' }}>{contact.name || 'Unknown User'}</Text>
                                    <Text style={{ fontSize: 14, color: '#64748B', textTransform: 'capitalize' }}>{contact.role}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color="#CBD5E1" style={{ marginLeft: 'auto' }} />
                            </TouchableOpacity>
                        ))
                    )}
                </ScrollView>
            </View>
        );
    }

    const filteredMessages = messages.filter(m => 
        (m.senderId === user.id && m.receiverId === activeChatUser.id) || 
        (m.senderId === activeChatUser.id && m.receiverId === user.id) ||
        (!m.receiverId) // Include global broadcast messages if any exist
    );

    return (
        <View style={[styles.list, { height: '100%', flex: 1 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                <TouchableOpacity onPress={() => setActiveChatUser(null)} style={{ marginRight: 16 }}>
                    <Ionicons name="arrow-back" size={24} color="#0F172A" />
                </TouchableOpacity>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                    <Text style={{ color: '#2563EB', fontWeight: 'bold', fontSize: 16 }}>{(activeChatUser.name || '?').charAt(0).toUpperCase()}</Text>
                </View>
                <View>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#0F172A' }}>{activeChatUser.name || 'Unknown User'}</Text>
                    <Text style={{ fontSize: 12, color: '#10B981' }}>Online</Text>
                </View>
            </View>

            <ScrollView style={{ flex: 1, marginBottom: 16 }}>
                {filteredMessages.length === 0 ? <Text style={styles.empty}>Start a conversation with {activeChatUser.name || 'this user'}!</Text> : filteredMessages.map((m, i) => (
                    <View key={i} style={[styles.card, m.senderId === user.id ? { backgroundColor: '#EFF6FF', alignSelf: 'flex-end', maxWidth: '80%' } : { alignSelf: 'flex-start', maxWidth: '80%' }]}>
                        <Text style={[styles.cardTitle, { fontSize: 12, color: '#64748B' }]}>{m.senderId === user.id ? 'You' : m.senderName}</Text>
                        <Text style={[styles.cardText, { marginTop: 4, color: '#0F172A' }]}>{m.content}</Text>
                        <Text style={[styles.logTime, { alignSelf: 'flex-end', marginTop: 4, fontSize: 10 }]}>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                    </View>
                ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 24 }}>
                <TextInput 
                    style={[styles.input, { flex: 1, marginBottom: 0, paddingVertical: 12 }]} 
                    placeholder={`Message ${activeChatUser.name || 'user'}...`}
                    value={msg} 
                    onChangeText={setMsg}
                    onSubmitEditing={handleSend}
                />
                <TouchableOpacity style={[styles.saveBtn, { width: 50, height: 50, justifyContent: 'center', alignItems: 'center', borderRadius: 25 }]} onPress={handleSend}>
                    <Ionicons name="send" size={20} color="#FFF" />
                </TouchableOpacity>
            </View>
        </View>
    );
};

const AnnouncementsView = ({ announcements }) => (
    <View style={styles.list}>
        {announcements.length === 0 ? <Text style={styles.empty}>No recent announcements.</Text> : announcements.map((a, i) => (
            <View key={i} style={styles.card}>
                <View style={styles.logHeader}>
                    <Text style={styles.cardTitle}>{a.title}</Text>
                    <Ionicons name="megaphone-outline" size={20} color="#7C3AED" />
                </View>
                <Text style={styles.cardText}>{a.content}</Text>
                <Text style={[styles.logTime, { marginTop: 8 }]}>Posted by {a.createdBy} on {new Date(a.createdAt).toLocaleDateString()}</Text>
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
