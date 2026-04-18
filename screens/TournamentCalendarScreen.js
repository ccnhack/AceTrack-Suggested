import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { colors, shadows, typography, borderRadius, spacing } from '../theme/designSystem';

const MOCK_EVENTS = [
  { id: '1', title: 'Bangalore Open TT', date: '2026-03-25', sport: 'Table Tennis' },
  { id: '2', title: 'Whitefield Badminton League', date: '2026-03-28', sport: 'Badminton' },
  { id: '3', title: 'Karnataka State Ranking', date: '2026-04-19', sport: 'Table Tennis' },
  { id: '4', title: 'Bengaluru City Open', date: '2026-04-22', sport: 'Badminton' },
  { id: '5', title: 'Electronic City Junior Champ', date: '2026-05-02', sport: 'Tennis' },
  { id: '6', title: 'South Bangalore Masters', date: '2026-05-15', sport: 'Table Tennis' },
];

export default function TournamentCalendarScreen() {
  const today = new Date().toISOString().split('T')[0];
  
  const upcomingEvents = MOCK_EVENTS
    .filter(event => event.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const markedDates = MOCK_EVENTS.reduce((acc, event) => {
    acc[event.date] = { marked: true, dotColor: colors.primary };
    return acc;
  }, {});

  const getMonthAbbr = (dateStr) => {
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const monthIdx = parseInt(dateStr.split('-')[1]) - 1;
    return months[monthIdx] || '???';
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Calendar 
          theme={{
            todayTextColor: colors.primary,
            arrowColor: colors.primary,
            dotColor: colors.primary,
            selectedDayBackgroundColor: colors.primary,
          }}
          markedDates={markedDates}
        />
        <View style={styles.eventsSection}>
          <Text style={styles.sectionTitle}>Upcoming Events</Text>
          {upcomingEvents.length === 0 ? (
            <Text style={styles.emptyText}>No upcoming events scheduled</Text>
          ) : (
            upcomingEvents.map(item => (
              <View key={item.id} style={styles.eventCard}>
                <View style={styles.dateBox}>
                  <Text style={styles.dateDay}>{item.date.split('-')[2]}</Text>
                  <Text style={styles.dateMonth}>{getMonthAbbr(item.date)}</Text>
                </View>
                <View style={styles.eventInfo}>
                  <Text style={styles.eventTitle}>{item.title}</Text>
                  <Text style={styles.eventSport}>{item.sport}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  eventsSection: { backgroundColor: '#f8f9fa', padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#333', marginBottom: 15 },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 20, fontStyle: 'italic' },
  eventCard: { 
    flexDirection: 'row', 
    backgroundColor: '#fff', 
    padding: 15, 
    borderRadius: 12, 
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee'
  },
  dateBox: { alignItems: 'center', justifyContent: 'center', minWidth: 60, paddingRight: 15, borderRightWidth: 1, borderRightColor: '#eee' },
  dateDay: { fontSize: 20, fontWeight: '900', color: colors.primary },
  dateMonth: { fontSize: 10, fontWeight: '700', color: '#666' },
  eventInfo: { paddingLeft: 15, justifyContent: 'center' },
  eventTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  eventSport: { fontSize: 12, color: '#666', marginTop: 2 }
});

