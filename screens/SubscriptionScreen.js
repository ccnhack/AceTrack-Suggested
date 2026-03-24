import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import designSystem from '../theme/designSystem';

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
                  <Ionicons name="checkmark-circle" size={16} color={designSystem.colors.success} />
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
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { padding: 40, alignItems: 'center', backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '900', color: designSystem.colors.primary },
  subtitle: { fontSize: 16, color: '#666', marginTop: 8 },
  list: { padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 2, borderColor: '#eee' },
  selectedCard: { borderColor: designSystem.colors.primary, backgroundColor: '#f0f4ff' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  tierName: { fontSize: 20, fontWeight: '800', color: '#333' },
  tierPrice: { fontSize: 18, fontWeight: '700', color: designSystem.colors.primary },
  features: { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 15 },
  featureLine: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  featureText: { fontSize: 14, color: '#444', marginLeft: 8 },
  activeTag: { position: 'absolute', top: -10, right: 20, backgroundColor: designSystem.colors.primary, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  activeTagText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  mainBtn: { backgroundColor: designSystem.colors.primary, margin: 20, padding: 18, borderRadius: 12, alignItems: 'center' },
  mainBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' }
});
