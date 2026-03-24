import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Calendar } from 'react-native-calendars';
import designSystem from '../theme/designSystem';

const MOCK_EVENTS = [
  { id: '1', title: 'Bangalore Open TT', date: '2026-03-25', sport: 'Table Tennis' },
  { id: '2', title: 'Whitefield Badminton League', date: '2026-03-28', sport: 'Badminton' },
];

export default function TournamentCalendarScreen() {
  const markedDates = {
    '2026-03-25': { marked: true, dotColor: designSystem.colors.primary },
    '2026-03-28': { marked: true, dotColor: designSystem.colors.primary },
  };

  return (
    <View style={styles.container}>
      <Calendar 
        theme={{
          todayTextColor: designSystem.colors.primary,
          arrowColor: designSystem.colors.primary,
          dotColor: designSystem.colors.primary,
          selectedDayBackgroundColor: designSystem.colors.primary,
        }}
        markedDates={markedDates}
      />
      <View style={styles.eventsSection}>
        <Text style={styles.sectionTitle}>Upcoming Events</Text>
        <FlatList
          data={MOCK_EVENTS}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={styles.eventCard}>
              <View style={styles.dateBox}>
                <Text style={styles.dateDay}>{item.date.split('-')[2]}</Text>
                <Text style={styles.dateMonth}>MAR</Text>
              </View>
              <View style={styles.eventInfo}>
                <Text style={styles.eventTitle}>{item.title}</Text>
                <Text style={styles.eventSport}>{item.sport}</Text>
              </View>
            </View>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  eventsSection: { flex: 1, backgroundColor: '#f8f9fa', padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#333', marginBottom: 15 },
  eventCard: { 
    flexDirection: 'row', 
    backgroundColor: '#fff', 
    padding: 15, 
    borderRadius: 12, 
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee'
  },
  dateBox: { alignItems: 'center', justifyContent: 'center', paddingRight: 15, borderRightWidth: 1, borderRightColor: '#eee' },
  dateDay: { fontSize: 20, fontWeight: '900', color: designSystem.colors.primary },
  dateMonth: { fontSize: 10, fontWeight: '700', color: '#666' },
  eventInfo: { paddingLeft: 15, justifyContent: 'center' },
  eventTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  eventSport: { fontSize: 12, color: '#666', marginTop: 2 }
});
