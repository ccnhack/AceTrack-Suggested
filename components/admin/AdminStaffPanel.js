import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, Clipboard, Modal, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows } from '../../theme/designSystem';
import config from '../../config';

const ACTION_LABELS = {
  link_click: { icon: '🔗', label: 'Link Clicked', color: '#3B82F6' },
  form_view: { icon: '👁️', label: 'Form Viewed', color: '#8B5CF6' },
  step_1: { icon: '1️⃣', label: 'Step 1: Personal Details', color: '#6366F1' },
  step_2: { icon: '2️⃣', label: 'Step 2: ID Verification', color: '#A855F7' },
  step_3: { icon: '3️⃣', label: 'Step 3: Security', color: '#EC4899' },
  form_submit: { icon: '✅', label: 'Form Submitted', color: '#10B981' },
};

const AdminStaffPanel = () => {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [invites, setInvites] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [resendingToken, setResendingToken] = useState(null);
  const [resendCooldowns, setResendCooldowns] = useState({});
  const [expandedAnalytics, setExpandedAnalytics] = useState(null); // token of expanded card
  const [selectedEvent, setSelectedEvent] = useState(null); // specific event for modal
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('active'); // 'active' or 'resolved'
  const [isRetiring, setIsRetiring] = useState(null); // token of link being retired

  useEffect(() => {
    fetchInvites();
    const interval = setInterval(fetchInvites, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setResendCooldowns(prev => {
        const updated = { ...prev };
        let changed = false;
        for (const token in updated) {
          if (updated[token].nextAt && new Date(updated[token].nextAt) <= new Date()) {
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
    if (!email.includes('@')) { Alert.alert("Invalid Email", "Please enter a valid corporate email address."); return; }
    if (!firstName.trim() || !lastName.trim()) { Alert.alert("Name Required", "Please enter the employee's first and last name."); return; }
    
    setIsGenerating(true);
    try {
      const res = await fetch(`${config.API_BASE_URL}/api/support/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ace-api-key': config.ACE_API_KEY, 'x-user-id': 'admin' },
        body: JSON.stringify({ email, firstName: firstName.trim(), lastName: lastName.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        const link = `https://acetrack-suggested.onrender.com/setup/${data.token}`;
        const emailNote = data.emailSent ? '📧 Onboarding email sent!' : '⚠️ Email not sent (configure GMAIL on Render)';
        Alert.alert("Invite Generated", `${emailNote}\n\nSetup Link:\n${link}`);
        setEmail(''); setFirstName(''); setLastName('');
        fetchInvites();
      } else if (res.status === 409) {
        Alert.alert(
          "Link Already Active", 
          `The email ${email} already has an active provisioning link.\n\nKindly resend the existing link or retire it to provision a new one.`,
          [{ text: "OK" }]
        );
      } else { Alert.alert("Error", data.error || "Failed to generate invite"); }
    } catch (e) { Alert.alert("Network Error", e.message); }
    finally { setIsGenerating(false); }
  };

  const resendEmail = async (token, email) => {
    setResendingToken(token);
    try {
      const res = await fetch(`${config.API_BASE_URL}/api/support/invite/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ace-api-key': config.ACE_API_KEY, 'x-user-id': 'admin' },
        body: JSON.stringify({ token })
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Email Resent", `📧 Resent to ${email}\n\n${data.resendsRemaining} resend(s) remaining`);
        setResendCooldowns(prev => ({ ...prev, [token]: { nextAt: new Date(Date.now() + 60000).toISOString() } }));
        fetchInvites();
      } else if (res.status === 429) {
        setResendCooldowns(prev => ({ ...prev, [token]: { nextAt: data.nextAvailableAt, message: data.error } }));
        Alert.alert("Rate Limited", data.error);
      } else { Alert.alert("Error", data.error || "Failed to resend email"); }
    } catch (e) { Alert.alert("Network Error", e.message); }
    finally { setResendingToken(null); }
  };

  const retireInvite = async (token, email) => {
    Alert.alert(
      "Retire Link?",
      `Are you sure you want to retire the setup link for ${email}? This action is irreversible and the link will become instantly inaccessible.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Retire Link", 
          style: "destructive",
          onPress: async () => {
            setIsRetiring(token);
            try {
              const res = await fetch(`${config.API_BASE_URL}/api/support/invite/expire`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-ace-api-key': config.ACE_API_KEY, 'x-user-id': 'admin' },
                body: JSON.stringify({ token })
              });
              if (res.ok) {
                Alert.alert("Link Retired", "The onboarding link has been successfully invalidated.");
                fetchInvites();
              } else {
                const data = await res.json();
                Alert.alert("Error", data.error || "Failed to retire link");
              }
            } catch (e) {
              Alert.alert("Network Error", e.message);
            } finally {
              setIsRetiring(null);
            }
          }
        }
      ]
    );
  };

  const copyToClipboard = (link) => { Clipboard.setString(link); Alert.alert("Link Copied", `Share securely:\n\n${link}`); };

  const getTimeRemaining = (expiresAt) => {
    const total = Date.parse(expiresAt) - Date.now();
    if (total <= 0) return "Expired";
    const h = Math.floor((total / (1000 * 60 * 60)) % 24);
    const m = Math.floor((total / 1000 / 60) % 60);
    return `${h}h ${m}m left`;
  };

  const getResendCooldownText = (token, inv) => {
    const cd = resendCooldowns[token];
    if (cd?.nextAt) {
      const rem = new Date(cd.nextAt) - new Date();
      if (rem > 0) {
        if (rem > 60000) { const h = Math.floor(rem / 3600000); const m = Math.floor((rem % 3600000) / 60000); return `Email can be resent after ${h}h ${m}m`; }
        return `Wait ${Math.ceil(rem / 1000)}s to resend`;
      }
    }
    const resends = inv.emailResends || [];
    if (resends.length >= 3) {
      const lockoutEnd = new Date(resends[resends.length - 1].timestamp).getTime() + 14400000;
      const rem = lockoutEnd - Date.now();
      if (rem > 0) { const h = Math.floor(rem / 3600000); const m = Math.floor((rem % 3600000) / 60000); return `Email can be resent after ${h}h ${m}m`; }
    }
    return null;
  };

  const isResendDisabled = (token, inv) => !!getResendCooldownText(token, inv) || resendingToken === token;

  const getResendCount = (inv) => {
    const resends = inv.emailResends || [];
    if (resends.length >= 3) {
      const lockoutEnd = new Date(resends[resends.length - 1].timestamp).getTime() + 14400000;
      if (Date.now() >= lockoutEnd) return 0;
    }
    return resends.length;
  };

  const getStatusColor = (s) => ({ Pending: '#F59E0B', Clicked: '#3B82F6', Used: '#10B981', Expired: '#EF4444' }[s] || '#64748B');

  const getFormProgress = (clicks) => {
    if (!clicks || clicks.length === 0) return null;
    const actions = clicks.map(c => c.action).filter(Boolean);
    if (actions.includes('form_submit')) return { label: 'Submitted', color: '#10B981', icon: '✅' };
    if (actions.includes('step_3')) return { label: 'Step 3/3', color: '#EC4899', icon: '🔒' };
    if (actions.includes('step_2')) return { label: 'Step 2/3', color: '#A855F7', icon: '📄' };
    if (actions.includes('step_1')) return { label: 'Step 1/3', color: '#6366F1', icon: '✏️' };
    if (actions.includes('form_view')) return { label: 'Form Opened', color: '#8B5CF6', icon: '👁️' };
    if (actions.includes('link_click')) return { label: 'Link Clicked', color: '#3B82F6', icon: '🔗' };
    return null;
  };

  const isFormValid = email.includes('@') && firstName.trim() && lastName.trim();

  const filteredInvites = invites.filter(inv => {
    // 1. Tab Filtering
    const isInviteActive = (inv.status === 'Pending' || inv.status === 'Clicked') && new Date(inv.expiresAt) > new Date();
    if (activeTab === 'active' && !isInviteActive) return false;
    if (activeTab === 'resolved' && (isInviteActive || inv.status === 'Used')) return false; // Simple logic: Resolved = Expired/Retired. Used is different? User said "retired or expired tab"
    
    // Actually, user said Resolved tab should show retired/expired.
    // Let's refine:
    // Tab "Active": Pending/Clicked AND not expired.
    // Tab "Resolved": Used.
    // Tab "Retired/Expired": Expired or manually retired.
    
    // Re-reading user: "subtab inside active provision links to have the retire/expire tab to show the retired or expired links in that"
    // So 2 tabs: 
    // 1. "Active Links" (Pending/Clicked/Used) -- Wait, Used is not active.
    // Let's use:
    // Tab "Active": Pending/Clicked (not naturally expired)
    // Tab "Resolved": Used
    // Tab "Retired": Naturally expired or manually retired.
    
    // Let's stick to user phrasing: "Active" and "Retired/Expired"
    if (activeTab === 'active') {
       if (inv.status === 'Used' || inv.status === 'Expired' || new Date(inv.expiresAt) <= new Date()) return false;
    } else {
       if (inv.status !== 'Expired' && new Date(inv.expiresAt) > new Date()) return false;
       if (inv.status === 'Used') return false; // Used links stay in their own bucket or we show them? User didn't specify Used.
    }

    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const fullName = `${inv.firstName || ''} ${inv.lastName || ''}`.toLowerCase();
    return fullName.includes(query) || inv.email.toLowerCase().includes(query);
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
      {/* 🔍 Staff Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color="#94A3B8" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search staff by name or email..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClear}>
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {!searchQuery && (
        <>
          <View style={styles.header}>
            <Ionicons name="shield-checkmark" size={24} color="#6366F1" />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.title}>Support Provisioning</Text>
              <Text style={styles.subtitle}>Generate secure, time-limited onboarding links.</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.nameRow}>
              <View style={styles.nameField}>
                <Text style={styles.label}>First Name</Text>
                <TextInput style={styles.input} placeholder="John" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
              </View>
              <View style={styles.nameField}>
                <Text style={styles.label}>Last Name</Text>
                <TextInput style={styles.input} placeholder="Doe" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
              </View>
            </View>

            <Text style={[styles.label, { marginTop: 12 }]}>Employee Corporate Email</Text>
            <TextInput style={styles.input} placeholder="e.g. j.doe@acetrack.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />

            {firstName.trim() && lastName.trim() && (
              <View style={styles.preview}>
                <Text style={styles.previewLabel}>Email Salutation Preview:</Text>
                <Text style={styles.previewText}>Hi {lastName.trim()}, {firstName.trim()}</Text>
              </View>
            )}

            <TouchableOpacity style={[styles.btn, (!isFormValid || isGenerating) && styles.btnDisabled]} onPress={generateInvite} disabled={!isFormValid || isGenerating}>
              {isGenerating ? <ActivityIndicator color="#FFF" /> : <Text style={styles.btnText}>Generate Secure Link</Text>}
            </TouchableOpacity>
          </View>
        </>
      )}

      <Text style={[styles.title, { marginTop: 24, marginBottom: 4 }]}>
        {searchQuery ? `Search Results (${filteredInvites.length})` : 'Provisioning Links History'}
      </Text>

      {/* 📑 Sub-Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity 
          style={[styles.smallTab, activeTab === 'active' && styles.smallTabActive]}
          onPress={() => setActiveTab('active')}
        >
          <Text style={[styles.smallTabText, activeTab === 'active' && styles.smallTabTextActive]}>Active</Text>
          {activeTab === 'active' && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.smallTab, activeTab === 'resolved' && styles.smallTabActive]}
          onPress={() => setActiveTab('resolved')}
        >
          <Text style={[styles.smallTabText, activeTab === 'resolved' && styles.smallTabTextActive]}>Retired / Expired</Text>
          {activeTab === 'resolved' && <View style={styles.tabIndicator} />}
        </TouchableOpacity>
      </View>

      {filteredInvites.map((inv) => {
        const cooldownText = getResendCooldownText(inv.token, inv);
        const resendDisabled = isResendDisabled(inv.token, inv);
        const resendCount = getResendCount(inv);
        const isActive = inv.status === 'Pending' || inv.status === 'Clicked';
        const isExpanded = expandedAnalytics === inv.token;
        const formProgress = getFormProgress(inv.clicks);
        const clickCount = (inv.clicks || []).length;

        return (
          <View key={inv._id} style={styles.inviteCard}>
            <View style={styles.inviteHeader}>
              <View style={{ flex: 1 }}>
                {(inv.firstName || inv.lastName) && (
                  <Text style={styles.inviteName}>{inv.lastName}, {inv.firstName}</Text>
                )}
                <Text style={styles.inviteEmail}>{inv.email}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: getStatusColor(inv.status) + '20' }]}>
                <Text style={[styles.badgeText, { color: getStatusColor(inv.status) }]}>{inv.status}</Text>
              </View>
            </View>
            
            <View style={styles.inviteMetaRow}>
              <Ionicons name="time-outline" size={14} color="#64748B" />
              <Text style={styles.metaText}>{inv.status === 'Expired' ? 'Expired' : getTimeRemaining(inv.expiresAt)}</Text>
              {formProgress && (
                <View style={[styles.progressChip, { backgroundColor: formProgress.color + '15', marginLeft: 12 }]}>
                  <Text style={{ fontSize: 10 }}>{formProgress.icon}</Text>
                  <Text style={[styles.progressChipText, { color: formProgress.color }]}>{formProgress.label}</Text>
                </View>
              )}
            </View>

            {/* Clickable Analytics Summary */}
            {clickCount > 0 && (
              <TouchableOpacity 
                style={styles.analyticsBtn}
                onPress={() => setExpandedAnalytics(isExpanded ? null : inv.token)}
                activeOpacity={0.7}
              >
                <View style={styles.analyticsBtnLeft}>
                  <Ionicons name="analytics-outline" size={14} color="#6366F1" />
                  <Text style={styles.analyticsBtnText}>Analytics ({clickCount} events)</Text>
                </View>
                <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}

            {/* Expanded Analytics Detail */}
            {isExpanded && inv.clicks && (
              <View style={styles.analyticsDetail}>
                {invites.find(i => i.token === expandedAnalytics)?.clicks?.map((click, idx) => {
                  const actionInfo = ACTION_LABELS[click.action] || { icon: '📍', label: click.action || 'Click', color: '#64748B' };
                  
                  return (
                    <TouchableOpacity 
                      key={idx} 
                      style={styles.eventRow}
                      onPress={() => setSelectedEvent({ ...click, ...actionInfo })}
                      activeOpacity={0.6}
                    >
                      <View style={[styles.eventDot, { backgroundColor: actionInfo.color }]} />
                      <View style={styles.eventContent}>
                        <View style={styles.eventHeaderRow}>
                          <Text style={[styles.eventAction, { color: actionInfo.color }]}>
                            {actionInfo.icon} {actionInfo.label}
                          </Text>
                          <Text style={styles.eventTime}>
                            {new Date(click.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                        
                        <View style={styles.eventDetailRow}>
                          <Ionicons name="location-outline" size={11} color="#94A3B8" />
                          <Text style={styles.eventDetailText} numberOfLines={1}>
                            {click.ip} - {[click.city, click.region].filter(Boolean).join(', ')}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {isActive && (
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.copyBtn} onPress={() => copyToClipboard(`https://acetrack-suggested.onrender.com/setup/${inv.token}`)}>
                  <Ionicons name="copy-outline" size={16} color="#4F46E5" />
                  <Text style={styles.copyBtnText}>Copy Link</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.resendBtn, resendDisabled && styles.resendBtnDisabled]} onPress={() => resendEmail(inv.token, inv.email)} disabled={resendDisabled}>
                  {resendingToken === inv.token ? <ActivityIndicator size="small" color="#7C3AED" /> : (
                    <>
                      <Ionicons name="mail-outline" size={16} color={resendDisabled ? '#94A3B8' : '#7C3AED'} />
                      <Text style={[styles.resendBtnText, resendDisabled && { color: '#94A3B8' }]}>Resend</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.retireBtn} 
                  onPress={() => retireInvite(inv.token, inv.email)}
                  disabled={isRetiring === inv.token}
                >
                  {isRetiring === inv.token ? (
                    <ActivityIndicator size="small" color="#EF4444" />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                      <Text style={styles.retireBtnText}>Retire</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {isActive && (
              <View style={styles.resendInfo}>
                {cooldownText ? (
                  <View style={styles.cooldownRow}>
                    <Ionicons name="timer-outline" size={12} color="#F59E0B" />
                    <Text style={styles.cooldownText}>{cooldownText}</Text>
                  </View>
                ) : null}
                <Text style={styles.resendCounter}>{resendCount}/3 resends used</Text>
              </View>
            )}
          </View>
        );
      })}

      {filteredInvites.length === 0 && (
        <Text style={styles.emptyText}>
          {searchQuery ? `No staff found matching "${searchQuery}"` : 'No provisioning links generated yet.'}
        </Text>
      )}

      {/* 📊 Analytics Detail Modal */}
      <Modal
        visible={!!selectedEvent}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedEvent(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIconBox, { backgroundColor: (selectedEvent?.color || '#6366F1') + '15' }]}>
                <Text style={{ fontSize: 24 }}>{selectedEvent?.icon || '📍'}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={styles.modalTitle}>{selectedEvent?.label || 'Event Details'}</Text>
                <Text style={styles.modalSubtitle}>
                  {selectedEvent ? new Date(selectedEvent.timestamp).toLocaleString() : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedEvent(null)}>
                <Ionicons name="close-circle" size={28} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {/* Bot / Preview Badge */}
              {selectedEvent?.action?.startsWith('BOT:') && (
                <View style={styles.botBadge}>
                  <Ionicons name="robot-outline" size={16} color="#B45309" />
                  <Text style={styles.botBadgeText}>🤖 BOT / PREVIEW DETECTED</Text>
                  {selectedEvent.userAgent?.includes('WhatsApp') && <Text style={styles.botPlatform}>platform: WhatsApp</Text>}
                  {selectedEvent.userAgent?.includes('Telegram') && <Text style={styles.botPlatform}>platform: Telegram</Text>}
                </View>
              )}

              <View style={styles.infoSection}>
                <Text style={styles.infoLabel}>IP - Location Chain</Text>
                {selectedEvent?.ip?.split(',').map((ip, i) => {
                  const cleanIp = ip.trim();
                  const isPrimary = i === 0;
                  const location = isPrimary ? [selectedEvent.city, selectedEvent.region, selectedEvent.country].filter(Boolean).join(', ') : '';
                  return (
                    <View key={i} style={[styles.infoRow, i > 0 && { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0' }]}>
                      <Ionicons name={isPrimary ? "globe-outline" : "share-social-outline"} size={16} color={isPrimary ? "#6366F1" : "#94A3B8"} />
                      <Text style={styles.infoValue}>
                        {cleanIp} {location ? `- ${location}` : (isPrimary ? '' : '- [Network Proxy/Gateway]')}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.infoSection}>
                <Text style={styles.infoLabel}>User agent :-</Text>
                <View style={styles.infoRow}>
                  <Ionicons name="phone-portrait-outline" size={16} color="#8B5CF6" />
                  <Text style={[styles.infoValue, { fontSize: 11, fontStyle: 'italic' }]}>
                    {selectedEvent?.userAgent || 'Unknown'}
                  </Text>
                </View>
              </View>

              <View style={styles.infoSection}>
                <Text style={styles.infoLabel}>Actions Performed:-</Text>
                <View style={styles.infoRow}>
                  <Ionicons name="flash-outline" size={16} color="#10B981" />
                  <Text style={styles.infoValue}>
                    {selectedEvent?.action?.replace('BOT:', '') || 'Performed interaction'}
                  </Text>
                </View>
              </View>
              
              {selectedEvent?.isp && (
                <View style={styles.infoSection}>
                  <Text style={styles.infoLabel}>Network / ISP</Text>
                  <View style={styles.infoRow}>
                    <Ionicons name="wifi-outline" size={16} color="#64748B" />
                    <Text style={styles.infoValue}>{selectedEvent.isp}</Text>
                  </View>
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSelectedEvent(null)}>
              <Text style={styles.modalCloseBtnText}>Close Details</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navy[50] },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '700', color: colors.navy[900] },
  subtitle: { fontSize: 12, color: colors.navy[500] },
  card: { backgroundColor: '#FFF', padding: 16, borderRadius: 16, ...shadows.sm, borderWidth: 1, borderColor: '#F1F5F9' },
  label: { fontSize: 12, fontWeight: '600', color: colors.navy[600], marginBottom: 6 },
  nameRow: { flexDirection: 'row', gap: 10 },
  nameField: { flex: 1 },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 12, fontSize: 14 },
  preview: { backgroundColor: '#F0F9FF', borderRadius: 8, padding: 10, marginTop: 12, borderWidth: 1, borderColor: '#BAE6FD' },
  previewLabel: { fontSize: 10, fontWeight: '600', color: '#0369A1', marginBottom: 4 },
  previewText: { fontSize: 14, fontWeight: '700', color: '#0C4A6E' },
  btn: { backgroundColor: '#4F46E5', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 16 },
  btnDisabled: { backgroundColor: '#94A3B8' },
  btnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  inviteCard: { backgroundColor: '#FFF', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  inviteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  inviteName: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 2 },
  inviteEmail: { fontSize: 13, fontWeight: '500', color: '#64748B' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  inviteMetaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  metaText: { fontSize: 12, color: '#64748B', marginLeft: 4 },
  progressChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, gap: 4 },
  progressChipText: { fontSize: 10, fontWeight: '700' },
  // Analytics button
  analyticsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 10, marginBottom: 12 },
  analyticsBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  analyticsBtnText: { fontSize: 12, fontWeight: '700', color: '#6366F1' },
  // Expanded analytics
  analyticsDetail: { backgroundColor: '#FAFBFF', borderWidth: 1, borderColor: '#E0E7FF', borderRadius: 10, padding: 12, marginBottom: 12 },
  eventRow: { flexDirection: 'row', marginBottom: 12 },
  eventDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, marginRight: 10 },
  eventContent: { flex: 1 },
  eventHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  eventAction: { fontSize: 12, fontWeight: '800' },
  eventTime: { fontSize: 10, color: '#94A3B8', fontWeight: '600' },
  eventDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  eventDetailText: { fontSize: 10, color: '#64748B', flex: 1 },
  // Actions
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
  emptyText: { textAlign: 'center', color: '#94A3B8', marginTop: 40 },
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', width: '100%', borderRadius: 20, padding: 24, ...shadows.lg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  modalIconBox: { width: 50, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  modalSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  modalBody: { gap: 16 },
  infoSection: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  infoLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#1E293B', flex: 1 },
  modalCloseBtn: { backgroundColor: '#4F46E5', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  modalCloseBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  // Bot Badge
  botBadge: { backgroundColor: '#FFFBEB', borderColor: '#FEF3C7', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16, alignItems: 'center' },
  botBadgeText: { color: '#B45309', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  botPlatform: { color: '#D97706', fontSize: 10, fontWeight: '600', marginTop: 4, textTransform: 'uppercase' },
  // Search Styles
  searchContainer: { backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, marginBottom: 20, borderWidth: 1, borderColor: '#E2E8F0', height: 48, ...shadows.sm },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A', height: '100%' },
  searchClear: { padding: 4 },
  // 📑 Sub-Tabs UI
  tabRow: { flexDirection: 'row', gap: 24, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingHorizontal: 4 },
  smallTab: { paddingVertical: 12, position: 'relative' },
  smallTabActive: {},
  smallTabText: { fontSize: 13, fontWeight: '700', color: '#94A3B8' },
  smallTabTextActive: { color: '#4F46E5' },
  tabIndicator: { position: 'absolute', bottom: -1, left: 0, right: 0, height: 2, backgroundColor: '#4F46E5', borderRadius: 2 },
  retireBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2', paddingHorizontal: 12, borderRadius: 8 },
  retireBtnText: { color: '#EF4444', fontWeight: '700', fontSize: 12, marginLeft: 6 }
});

export default AdminStaffPanel;
