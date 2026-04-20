import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, Clipboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows } from '../../theme/designSystem';
import config from '../../config';

const AdminStaffPanel = () => {
  const [email, setEmail] = useState('');
  const [invites, setInvites] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Poll for invites to show real-time click tracking
  useEffect(() => {
    fetchInvites();
    const interval = setInterval(fetchInvites, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const fetchInvites = async () => {
    try {
      // In a real app, you would pass the current user's role header or token.
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
        const link = `https://support.acetrack.com/setup/${data.token}`;
        Alert.alert("Invite Generated", `The secure setup link has been created:\n\n${link}`);
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

      {invites.map((inv) => (
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

          {(inv.status === 'Pending' || inv.status === 'Clicked') && (
            <TouchableOpacity style={styles.copyBtn} onPress={() => copyToClipboard(`https://support.acetrack.com/setup/${inv.token}`)}>
              <Ionicons name="copy-outline" size={16} color="#4F46E5" />
              <Text style={styles.copyBtnText}>Copy Link</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

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
  inviteEmail: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  inviteMetaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  metaText: { fontSize: 12, color: '#64748B', marginLeft: 4 },
  clickTracking: { backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, marginBottom: 12 },
  clickTitle: { fontSize: 10, fontWeight: '700', color: '#475569', marginBottom: 4 },
  clickEntry: { fontSize: 10, color: '#64748B', marginBottom: 2 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF', padding: 10, borderRadius: 8 },
  copyBtnText: { color: '#4F46E5', fontWeight: '600', fontSize: 12, marginLeft: 6 },
  emptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 40 }
});

export default AdminStaffPanel;
