import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows, typography, borderRadius, spacing } from '../theme/designSystem';

const TIERS = [
  { id: '1', name: 'Basic', price: '₹999/mo', features: ['4 Tournaments', '16 Max Players', '1 Camera View'] },
  { id: '2', name: 'Pro', price: '₹2,999/mo', features: ['15 Tournaments', '32 Max Players', '2 Camera Views', 'Financial Reports'] },
  { id: '3', name: 'Enterprise', price: '₹9,999/mo', features: ['Unlimited', '64 Max Players', 'Multi-Camera AI', 'Custom Branding'] },
];

export default function SubscriptionScreen() {
  const [selected, setSelected] = useState('2');

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Academy Plans</Text>
        <Text style={styles.subtitle}>Scale your sports business</Text>
      </View>
      <View style={styles.list}>
        {TIERS.map(tier => (
          <TouchableOpacity 
            key={tier.id} 
            style={[styles.card, selected === tier.id && styles.selectedCard]}
            onPress={() => setSelected(tier.id)}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.tierName}>{tier.name}</Text>
              <Text style={styles.tierPrice}>{tier.price}</Text>
            </View>
            <View style={styles.features}>
              {tier.features.map((f, i) => (
                <View key={i} style={styles.featureLine}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>
            {selected === tier.id && (
              <View style={styles.activeTag}>
                <Text style={styles.activeTagText}>CURRENT PLAN</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.mainBtn}>
        <Text style={styles.mainBtnText}>Upgrade Plan</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navy[50] },
  header: { padding: 40, alignItems: 'center', backgroundColor: '#fff', borderBottomLeftRadius: 32, borderBottomRightRadius: 32, ...shadows.sm },
  title: { fontSize: 28, fontWeight: '900', color: colors.primary.base, textTransform: 'uppercase', letterSpacing: 1 },
  subtitle: { fontSize: 16, color: colors.navy[500], marginTop: 8, fontWeight: '600' },
  list: { padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 24, padding: 24, marginBottom: 20, borderWidth: 2, borderColor: colors.navy[100], position: 'relative' },
  selectedCard: { borderColor: colors.primary.base, backgroundColor: '#F5F8FF', ...shadows.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  tierName: { fontSize: 22, fontWeight: '900', color: colors.navy[900] },
  tierPrice: { fontSize: 20, fontWeight: '800', color: colors.primary.base },
  features: { borderTopWidth: 1, borderTopColor: colors.navy[100], paddingTop: 15 },
  featureLine: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  featureText: { fontSize: 14, color: colors.navy[700], marginLeft: 10, fontWeight: '600' },
  activeTag: { 
    position: 'absolute', 
    top: -12, 
    right: 24, 
    backgroundColor: colors.primary.base, 
    paddingHorizontal: 14, 
    paddingVertical: 6, 
    borderRadius: 12,
    ...shadows.sm,
    borderWidth: 2,
    borderColor: '#fff'
  },
  activeTagText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  mainBtn: { backgroundColor: colors.primary.base, margin: 24, padding: 20, borderRadius: 20, alignItems: 'center', ...shadows.md },
  mainBtnText: { color: '#fff', fontSize: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5 }
});
