import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import designSystem from '../theme/designSystem';

export default function BroadcastTools({ tournaments = [], serverClockOffset = 0 }) {
  const [message, setMessage] = useState('');
  const [selectedTournament, setSelectedTournament] = useState('all');
  const [targetAudience, setTargetAudience] = useState('registered');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const handleSend = () => {
    if (!message) return;
    const tName = selectedTournament === 'all' ? 'All Tournaments' : tournaments.find(t => t.id === selectedTournament)?.title;
    const audienceName = targetAudience === 'all' ? 'All (Registered + Future Registrations)' : 'Registered Participants';
    Alert.alert("Broadcast Sent", `Your announcement for "${tName}" has been sent to ${audienceName}.`);
    setMessage('');
  };

  const getTargetingCount = () => {
    if (selectedTournament === 'all') {
      return tournaments.reduce((acc, t) => acc + (t.registeredPlayerIds?.length || 0), 0);
    }
    const t = tournaments.find(curr => curr.id === selectedTournament);
    return t?.registeredPlayerIds?.length || 0;
  };

  const filteredTournaments = (tournaments || []).filter(t => {
    if (categoryFilter === 'all') return true;
    
    // Robust, timezone-agnostic date comparison using YYYY-MM-DD strings
    const todayStr = new Date(Date.now() + (serverClockOffset || 0)).toISOString().split('T')[0];
    const isPast = t.date < todayStr;
    
    if (categoryFilter === 'upcoming') {
      return t.status !== 'completed' && !t.tournamentConcluded && (!isPast || t.tournamentStarted);
    } else {
      return t.status === 'completed' || t.tournamentConcluded || (isPast && !t.tournamentStarted);
    }
  });

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons name="megaphone" size={20} color={designSystem.colors.primary} />
          </View>
          <View>
            <Text style={styles.title}>Send Announcement</Text>
            <Text style={styles.subtitle}>Reach your participants instantly</Text>
          </View>
        </View>

        <Text style={styles.label}>FILTER BY STATUS</Text>
        <View style={styles.categoryRow}>
          {['all', 'upcoming', 'past'].map((cat) => (
            <TouchableOpacity 
              key={cat}
              style={[styles.catBtn, categoryFilter === cat && styles.catBtnActive]}
              onPress={() => {
                setCategoryFilter(cat);
                if (cat === 'all') setSelectedTournament('all');
              }}
            >
              <Text style={[styles.catBtnText, categoryFilter === cat && styles.catBtnTextActive]}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>SELECT TOURNAMENT</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={{ paddingBottom: 10 }}>
          {categoryFilter === 'all' && (
            <TouchableOpacity 
              style={[styles.chip, selectedTournament === 'all' && styles.chipActive]}
              onPress={() => setSelectedTournament('all')}
            >
              <Text style={[styles.chipText, selectedTournament === 'all' && styles.chipTextActive]}>All Tournaments</Text>
            </TouchableOpacity>
          )}
          {filteredTournaments.map(t => (
            <TouchableOpacity 
              key={t.id}
              style={[styles.chip, selectedTournament === t.id && styles.chipActive]}
              onPress={() => setSelectedTournament(t.id)}
            >
              <Text style={[styles.chipText, selectedTournament === t.id && styles.chipTextActive]}>{t.title}</Text>
            </TouchableOpacity>
          ))}
          {filteredTournaments.length === 0 && (
            <View style={styles.emptyChip}>
              <Text style={styles.emptyChipText}>No {categoryFilter} events found</Text>
            </View>
          )}
        </ScrollView>

        <Text style={styles.label}>TARGET AUDIENCE</Text>
        <View style={styles.targetRow}>
          <TouchableOpacity 
            style={[styles.targetBtn, targetAudience === 'registered' && styles.targetBtnActive]}
            onPress={() => setTargetAudience('registered')}
          >
            <Ionicons name="people" size={16} color={targetAudience === 'registered' ? designSystem.colors.primary : '#94A3B8'} />
            <Text style={[styles.targetText, targetAudience === 'registered' && styles.targetTextActive]}>
              Registered
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.targetBtn, targetAudience === 'all' && styles.targetBtnActive]}
            onPress={() => setTargetAudience('all')}
          >
            <Ionicons name="globe" size={16} color={targetAudience === 'all' ? designSystem.colors.primary : '#94A3B8'} />
            <Text style={[styles.targetText, targetAudience === 'all' && styles.targetTextActive]}>
              All Participants
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type your message here..."
            placeholderTextColor="#94A3B8"
            multiline
            value={message}
            onChangeText={setMessage}
          />
        </View>

        <View style={styles.targetingBox}>
           <Ionicons name="information-circle" size={16} color="#6366F1" />
           <Text style={styles.hint}>
             Targeting <Text style={{fontWeight:'900', color:'#4338CA'}}>{getTargetingCount()}</Text> Registered Players {targetAudience === 'all' ? 'and New Registrations' : ''}
           </Text>
        </View>

        <TouchableOpacity style={[styles.btn, !message && styles.btnDisabled]} onPress={handleSend} disabled={!message}>
          <Text style={styles.btnText}>BROADCAST MESSAGE</Text>
          <Ionicons name="send" size={16} color="#fff" style={{ marginLeft: 10 }} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 10 },
  card: { backgroundColor: '#fff', padding: 24, borderRadius: 24, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 10 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 25, gap: 15 },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  label: { fontSize: 10, fontWeight: '900', color: '#94A3B8', letterSpacing: 1.5, marginBottom: 12, marginTop: 5 },
  categoryRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  catBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#F1F5F slate-400', backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  catBtnActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  catBtnText: { fontSize: 11, fontWeight: '800', color: '#64748B' },
  catBtnTextActive: { color: '#FFFFFF' },
  chipRow: { marginBottom: 15 },
  chip: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 14, backgroundColor: '#F1F5F9', marginRight: 10, height: 40, justifyContent: 'center' },
  emptyChip: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 14, backgroundColor: '#F8FAFC', borderStyle: 'dashed', borderWidth: 1, borderColor: '#E2E8F0', height: 40, justifyContent: 'center' },
  emptyChipText: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  chipActive: { backgroundColor: designSystem.colors.primary },
  chipText: { fontSize: 13, color: '#64748B', fontWeight: '700' },
  chipTextActive: { color: '#fff' },
  targetRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  targetBtn: { flex: 1, flexDirection: 'row', paddingVertical: 14, borderRadius: 16, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F1F5F9', gap: 8 },
  targetBtnActive: { backgroundColor: '#EEF2FF', borderColor: designSystem.colors.primary },
  targetText: { fontSize: 13, color: '#64748B', fontWeight: '700' },
  targetTextActive: { color: designSystem.colors.primary },
  inputContainer: { backgroundColor: '#F8FAFC', borderRadius: 20, padding: 4, borderWidth: 1, borderColor: '#F1F5F9' },
  input: { padding: 20, height: 120, textAlignVertical: 'top', fontSize: 15, color: '#0F172A', fontWeight: '600' },
  btn: { backgroundColor: designSystem.colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 20, borderRadius: 20, marginTop: 20, shadowColor: designSystem.colors.primary, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
  btnDisabled: { opacity: 0.5, backgroundColor: '#CBD5E1' },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  targetingBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 15, backgroundColor: '#F5F3FF', padding: 12, borderRadius: 12 },
  hint: { color: '#6366F1', fontSize: 12, fontWeight: '700' }
});
