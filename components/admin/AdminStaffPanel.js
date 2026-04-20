import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, Clipboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows } from '../../theme/designSystem';
import config from '../../config';

const AdminStaffPanel = () => {
  const [email, setEmail] = useState('');
  const [invites, setInvites] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [resendingToken, setResendingToken] = useState(null); // token currently being resent
  const [resendCooldowns, setResendCooldowns] = useState({}); // { token: { nextAt: Date, message: '' } }

  // Poll for invites to show real-time click tracking
  useEffect(() => {
    fetchInvites();
    const interval = setInterval(fetchInvites, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  // Countdown timer for cooldowns
  useEffect(() => {
    const timer = setInterval(() => {
      setResendCooldowns(prev => {
        const updated = { ...prev };
        let changed = false;
        for (const token in updated) {
          const cd = updated[token];
          if (cd.nextAt && new Date(cd.nextAt) <= new Date()) {
            delete updated[token];
            changed = true;
          }
        }
        return changed ? updated : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchInvites = async () => {
    try {
      const res = await fetch(`${config.API_BASE_URL}/api/support/invites`, {
        headers: { 'x-ace-api-key': config.ACE_API_KEY, 'x-user-id': 'admin' }
      });
      if (res.ok) {
        const data = await res.json();
        setInvites(data.invites);
      }
    } catch (e) {
      console.warn("Failed to fetch invites");
    }
  };

  const generateInvite = async () => {
    if (!email.includes('@')) {
      Alert.alert("Invalid Email", "Please enter a valid corporate email address.");
      return;
    }
    
    setIsGenerating(true);
    try {
      const res = await fetch(`${config.API_BASE_URL}/api/support/invite`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-ace-api-key': config.ACE_API_KEY,
          'x-user-id': 'admin' 
        },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok) {
        const link = `https://acetrack-suggested.onrender.com/setup/${data.token}`;
        const emailNote = data.emailSent 
          ? '📧 Onboarding email sent successfully!' 
          : '⚠️ Email not sent (configure GMAIL credentials on Render)';
        Alert.alert("Invite Generated", `${emailNote}\n\nSetup Link:\n${link}`);
        setEmail('');
        fetchInvites();
      } else {
        Alert.alert("Error", data.error || "Failed to generate invite");
      }
    } catch (e) {
      Alert.alert("Network Error", e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const resendEmail = async (token, email) => {
    setResendingToken(token);
    try {
      const res = await fetch(`${config.API_BASE_URL}/api/support/invite/resend`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-ace-api-key': config.ACE_API_KEY,
          'x-user-id': 'admin' 
        },
        body: JSON.stringify({ token })
      });
      const data = await res.json();
      
      if (res.ok) {
        Alert.alert("Email Resent", `📧 Onboarding email resent to ${email}\n\n${data.resendsRemaining} resend(s) remaining`);
        // Set 1-min cooldown locally
        setResendCooldowns(prev => ({
          ...prev,
          [token]: { nextAt: new Date(Date.now() + 60000).toISOString(), message: '' }
        }));
        fetchInvites();
      } else if (res.status === 429) {
        // Rate limited
        setResendCooldowns(prev => ({
          ...prev,
          [token]: { nextAt: data.nextAvailableAt, message: data.error }
        }));
        Alert.alert("Rate Limited", data.error);
      } else {
        Alert.alert("Error", data.error || "Failed to resend email");
      }
    } catch (e) {
      Alert.alert("Network Error", e.message);
    } finally {
      setResendingToken(null);
    }
  };

  const copyToClipboard = (link) => {
    Clipboard.setString(link);
    Alert.alert("Link Copied", `Share this link securely with the employee:\n\n${link}`);
  };

  const getTimeRemaining = (expiresAt) => {
    const total = Date.parse(expiresAt) - Date.parse(new Date());
    if (total <= 0) return "Expired";
    const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((total / 1000 / 60) % 60);
    return `${hours}h ${minutes}m left`;
  };

  const getResendCooldownText = (token, inv) => {
    const cd = resendCooldowns[token];
    if (cd && cd.nextAt) {
      const remaining = new Date(cd.nextAt) - new Date();
      if (remaining > 0) {
        if (remaining > 60000) {
          // Hours display (4hr lockout)
          const h = Math.floor(remaining / (1000 * 60 * 60));
          const m = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
          return `Email can be resent after ${h}h ${m}m`;
        } else {
          const s = Math.ceil(remaining / 1000);
          return `Wait ${s}s to resend`;
        }
      }
    }
    // Check from server data
    const resends = inv.emailResends || [];
    if (resends.length >= 3) {
      const last = new Date(resends[resends.length - 1].timestamp).getTime();
      const lockoutEnd = last + (4 * 60 * 60 * 1000);
      const remaining = lockoutEnd - Date.now();
      if (remaining > 0) {
        const h = Math.floor(remaining / (1000 * 60 * 60));
        const m = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        return `Email can be resent after ${h}h ${m}m`;
      }
    }
    return null;
  };

  const isResendDisabled = (token, inv) => {
    return !!getResendCooldownText(token, inv) || resendingToken === token;
  };

  const getResendCount = (inv) => {
    const resends = inv.emailResends || [];
    // If 3+ and lockout expired, it's reset
    if (resends.length >= 3) {
      const last = new Date(resends[resends.length - 1].timestamp).getTime();
      const lockoutEnd = last + (4 * 60 * 60 * 1000);
      if (Date.now() >= lockoutEnd) return 0; // reset
    }
    return resends.length;
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'Pending': return '#F59E0B'; // Amber
      case 'Clicked': return '#3B82F6'; // Blue
      case 'Used': return '#10B981'; // Green
      case 'Expired': return '#EF4444'; // Red
      default: return '#64748B';
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.header}>
        <Ionicons name="shield-checkmark" size={24} color="#6366F1" />
        <View style={{ marginLeft: 12 }}>
          <Text style={styles.title}>Support Provisioning</Text>
          <Text style={styles.subtitle}>Generate secure, time-limited onboarding links.</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Employee Corporate Email</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. j.doe@acetrack.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TouchableOpacity 
          style={[styles.btn, (!email || isGenerating) && styles.btnDisabled]} 
          onPress={generateInvite}
          disabled={!email || isGenerating}
        >
          {isGenerating ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Generate Secure Link</Text>}
        </TouchableOpacity>
      </View>

      <Text style={[styles.title, { marginTop: 24, marginBottom: 12 }]}>Active Provisioning Links</Text>

      {invites.map((inv) => {
        const cooldownText = getResendCooldownText(inv.token, inv);
        const resendDisabled = isResendDisabled(inv.token, inv);
        const resendCount = getResendCount(inv);
        const isActive = inv.status === 'Pending' || inv.status === 'Clicked';

        return (
          <View key={inv._id} style={styles.inviteCard}>
            <View style={styles.inviteHeader}>
              <Text style={styles.inviteEmail}>{inv.email}</Text>
              <View style={[styles.badge, { backgroundColor: getStatusColor(inv.status) + '20' }]}>
                <Text style={[styles.badgeText, { color: getStatusColor(inv.status) }]}>{inv.status}</Text>
              </View>
            </View>
            
            <View style={styles.inviteMetaRow}>
              <Ionicons name="time-outline" size={14} color="#64748B" />
              <Text style={styles.metaText}>{inv.status === 'Expired' ? 'Expired' : getTimeRemaining(inv.expiresAt)}</Text>
            </View>

            {inv.clicks && inv.clicks.length > 0 && (
              <View style={styles.clickTracking}>
                <Text style={styles.clickTitle}>Analytics (Click Tracking):</Text>
                {inv.clicks.map((click, idx) => (
                  <Text key={idx} style={styles.clickEntry}>
                    • IP: <Text style={{fontWeight: 'bold'}}>{click.ip}</Text> at {new Date(click.timestamp).toLocaleTimeString()}
                  </Text>
                ))}
              </View>
            )}

            {isActive && (
              <View style={styles.actionRow}>
                <TouchableOpacity 
                  style={styles.copyBtn} 
                  onPress={() => copyToClipboard(`https://acetrack-suggested.onrender.com/setup/${inv.token}`)}
                >
                  <Ionicons name="copy-outline" size={16} color="#4F46E5" />
                  <Text style={styles.copyBtnText}>Copy Link</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.resendBtn, resendDisabled && styles.resendBtnDisabled]} 
                  onPress={() => resendEmail(inv.token, inv.email)}
                  disabled={resendDisabled}
                >
                  {resendingToken === inv.token ? (
                    <ActivityIndicator size="small" color="#7C3AED" />
                  ) : (
                    <>
                      <Ionicons name="mail-outline" size={16} color={resendDisabled ? '#94A3B8' : '#7C3AED'} />
                      <Text style={[styles.resendBtnText, resendDisabled && { color: '#94A3B8' }]}>Resend</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Resend counter & cooldown message */}
            {isActive && (
              <View style={styles.resendInfo}>
                {cooldownText ? (
                  <View style={styles.cooldownRow}>
                    <Ionicons name="timer-outline" size={12} color="#F59E0B" />
                    <Text style={styles.cooldownText}>{cooldownText}</Text>
                  </View>
                ) : null}
                <Text style={styles.resendCounter}>
                  {resendCount}/3 resends used
                </Text>
              </View>
            )}
          </View>
        );
      })}

      {invites.length === 0 && (
        <Text style={styles.emptyText}>No provisioning links generated yet.</Text>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navy[50] },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '700', color: colors.navy[900] },
  subtitle: { fontSize: 12, color: colors.navy[500] },
  card: { backgroundColor: '#FFF', padding: 16, borderRadius: 16, ...shadows.sm, borderWidth: 1, borderColor: '#F1F5F9' },
  label: { fontSize: 12, fontWeight: '600', color: colors.navy[600], marginBottom: 8 },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 12, fontSize: 14 },
  btn: { backgroundColor: '#4F46E5', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 16 },
  btnDisabled: { backgroundColor: '#94A3B8' },
  btnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  inviteCard: { backgroundColor: '#FFF', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  inviteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  inviteEmail: { fontSize: 14, fontWeight: '700', color: '#1E293B', flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  inviteMetaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  metaText: { fontSize: 12, color: '#64748B', marginLeft: 4 },
  clickTracking: { backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, marginBottom: 12 },
  clickTitle: { fontSize: 10, fontWeight: '700', color: '#475569', marginBottom: 4 },
  clickEntry: { fontSize: 10, color: '#64748B', marginBottom: 2 },
  actionRow: { flexDirection: 'row', gap: 8 },
  copyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF', padding: 10, borderRadius: 8 },
  copyBtnText: { color: '#4F46E5', fontWeight: '600', fontSize: 12, marginLeft: 6 },
  resendBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F3FF', padding: 10, borderRadius: 8 },
  resendBtnDisabled: { backgroundColor: '#F1F5F9' },
  resendBtnText: { color: '#7C3AED', fontWeight: '600', fontSize: 12, marginLeft: 6 },
  resendInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  cooldownRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cooldownText: { fontSize: 11, color: '#F59E0B', fontWeight: '600' },
  resendCounter: { fontSize: 11, color: '#94A3B8' },
  emptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 40 }
});

export default AdminStaffPanel;
