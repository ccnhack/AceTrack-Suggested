import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { colors, typography, shadows } from '../theme/designSystem';

export default function CourtManager() {
  const { currentUser: user, onUpdateUser } = useAuth();
  const [newCourtName, setNewCourtName] = useState('');
  
  const courts = user?.courts || [];

  const handleAddCourt = () => {
    if (!newCourtName.trim()) return;
    
    const newCourt = {
      id: `court_${Date.now()}`,
      name: newCourtName.trim()
    };
    
    const updatedUser = {
      ...user,
      courts: [...courts, newCourt]
    };
    
    if (onUpdateUser) {
      onUpdateUser(updatedUser);
      setNewCourtName('');
    }
  };

  const handleRemoveCourt = (courtId) => {
    Alert.alert(
      "Remove Court",
      "Are you sure you want to remove this court? It might affect ongoing matches assigned to it.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Remove", 
          style: "destructive",
          onPress: () => {
            const updatedUser = {
              ...user,
              courts: courts.filter(c => c.id !== courtId)
            };
            if (onUpdateUser) onUpdateUser(updatedUser);
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Manage Courts</Text>
      <Text style={styles.sectionSubtitle}>Define courts available at your academy for tournament allocations.</Text>
      
      <View style={styles.addCourtContainer}>
        <TextInput
          style={styles.input}
          placeholder="e.g. Main Court, Court 1"
          placeholderTextColor={colors.navy[400]}
          value={newCourtName}
          onChangeText={setNewCourtName}
        />
        <TouchableOpacity 
          style={[styles.addBtn, !newCourtName.trim() && styles.addBtnDisabled]} 
          onPress={handleAddCourt}
          disabled={!newCourtName.trim()}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {courts.length > 0 ? (
        <View style={styles.courtList}>
          {courts.map((court) => (
            <View key={court.id} style={styles.courtItem}>
              <View style={styles.courtIcon}>
                <Ionicons name="tennisball-outline" size={20} color={colors.primary.base} />
              </View>
              <Text style={styles.courtName}>{court.name}</Text>
              <TouchableOpacity onPress={() => handleRemoveCourt(court.id)} style={styles.removeBtn}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="business-outline" size={48} color={colors.navy[200]} />
          <Text style={styles.emptyText}>No courts defined yet.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.navy[100],
    ...shadows.sm
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.navy[900],
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: colors.navy[500],
    marginBottom: 20,
    fontWeight: '500'
  },
  addCourtContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 12
  },
  input: {
    flex: 1,
    backgroundColor: colors.navy[50],
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.navy[900],
    borderWidth: 1,
    borderColor: colors.navy[100]
  },
  addBtn: {
    backgroundColor: colors.primary.base,
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnDisabled: {
    backgroundColor: colors.navy[300]
  },
  courtList: {
    gap: 10
  },
  courtItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navy[50],
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.navy[100]
  },
  courtIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  courtName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.navy[900]
  },
  removeBtn: {
    padding: 8
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 30
  },
  emptyText: {
    color: colors.navy[400],
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12
  }
});
