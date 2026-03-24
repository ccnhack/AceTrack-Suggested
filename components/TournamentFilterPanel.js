import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * 🔍 Tournament Filter Panel
 * UX Fix: Advanced filtering by sport, date, price, skill level
 */

const SPORTS = ['All', 'Badminton', 'Table Tennis', 'Cricket'];
const SKILL_LEVELS = ['All', 'Beginner', 'Intermediate', 'Advanced'];
const PRICE_RANGES = [
  { label: 'Any', min: 0, max: Infinity },
  { label: 'Free', min: 0, max: 0 },
  { label: '₹1 - ₹200', min: 1, max: 200 },
  { label: '₹201 - ₹500', min: 201, max: 500 },
  { label: '₹500+', min: 500, max: Infinity },
];
const SORT_OPTIONS = [
  { label: 'Date (Nearest)', value: 'date_asc' },
  { label: 'Date (Farthest)', value: 'date_desc' },
  { label: 'Price (Low → High)', value: 'price_asc' },
  { label: 'Price (High → Low)', value: 'price_desc' },
  { label: 'Spots Left', value: 'spots' },
];

const TournamentFilterPanel = ({ visible, onClose, onApply, currentFilters = {} }) => {
  const [sport, setSport] = useState(currentFilters.sport || 'All');
  const [skillLevel, setSkillLevel] = useState(currentFilters.skillLevel || 'All');
  const [priceRange, setPriceRange] = useState(currentFilters.priceRange || 0);
  const [sortBy, setSortBy] = useState(currentFilters.sortBy || 'date_asc');
  const [city, setCity] = useState(currentFilters.city || 'All');

  const handleApply = () => {
    onApply({
      sport,
      skillLevel,
      priceRange,
      sortBy,
      city,
      priceMin: PRICE_RANGES[priceRange].min,
      priceMax: PRICE_RANGES[priceRange].max,
    });
    onClose();
  };

  const handleReset = () => {
    setSport('All');
    setSkillLevel('All');
    setPriceRange(0);
    setSortBy('date_asc');
    setCity('All');
  };

  const ChipGroup = ({ options, selected, onSelect, colors = {} }) => (
    <View style={styles.chipRow}>
      {options.map(option => {
        const label = typeof option === 'string' ? option : option.label;
        const value = typeof option === 'string' ? option : option.value;
        const isActive = selected === value || selected === label;
        return (
          <TouchableOpacity
            key={label}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={() => onSelect(value || label)}
          >
            <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Filter Tournaments</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Sport */}
            <Text style={styles.sectionTitle}>Sport</Text>
            <ChipGroup options={SPORTS} selected={sport} onSelect={setSport} />

            {/* Skill Level */}
            <Text style={styles.sectionTitle}>Skill Level</Text>
            <ChipGroup options={SKILL_LEVELS} selected={skillLevel} onSelect={setSkillLevel} />

            {/* Price Range */}
            <Text style={styles.sectionTitle}>Entry Fee</Text>
            <ChipGroup
              options={PRICE_RANGES.map((r, i) => ({ label: r.label, value: i }))}
              selected={priceRange}
              onSelect={setPriceRange}
            />

            {/* Sort */}
            <Text style={styles.sectionTitle}>Sort By</Text>
            <ChipGroup options={SORT_OPTIONS} selected={sortBy} onSelect={setSortBy} />
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
              <Text style={styles.resetText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
              <Text style={styles.applyText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#F8FAFC',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#334155',
  },
  chipActive: {
    backgroundColor: '#3B82F6',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#94A3B8',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  resetButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#334155',
    alignItems: 'center',
  },
  resetText: {
    color: '#94A3B8',
    fontWeight: '600',
    fontSize: 15,
  },
  applyButton: {
    flex: 2,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
  },
  applyText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});

export default TournamentFilterPanel;
