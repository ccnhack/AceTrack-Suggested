import React, { useState } from 'react';
import { 
  View, Text, TouchableOpacity, StyleSheet, 
  ScrollView, Dimensions, FlatList 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const PureJSDateTimePicker = ({ 
  mode = 'date', // 'date' or 'time'
  value, // string 'YYYY-MM-DD' or 'HH:MM AM'
  minDate, // string 'YYYY-MM-DD'
  maxDate, // string 'YYYY-MM-DD'
  onChange, // callback with string
  onClose 
}) => {
  const [currentViewDate, setCurrentViewDate] = useState(value ? new Date(value) : new Date());

  // Date constants
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const generateCalendar = () => {
    const year = currentViewDate.getFullYear();
    const month = currentViewDate.getMonth();
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const calendarDays = [];
    
    // Fill empty days for the first week
    for (let i = 0; i < firstDay; i++) {
        calendarDays.push(null);
    }
    
    // Fill actual days
    for (let i = 1; i <= daysInMonth; i++) {
        calendarDays.push(i);
    }
    
    return calendarDays;
  };

  const changeMonth = (offset) => {
    const newDate = new Date(currentViewDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setCurrentViewDate(newDate);
  };

  const isSelected = (day) => {
    if (!day || !value || mode === 'time') return false;
    const [vYear, vMonth, vDay] = value.split('-').map(Number);
    return (
        vYear === currentViewDate.getFullYear() &&
        vMonth === currentViewDate.getMonth() + 1 &&
        vDay === day
    );
  };

  const isDisabled = (day) => {
    if (!day || mode === 'time') return false;
    const m = String(currentViewDate.getMonth() + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    const dateStr = `${currentViewDate.getFullYear()}-${m}-${d}`;
    
    if (minDate && dateStr < minDate) return true;
    if (maxDate && dateStr > maxDate) return true;
    return false;
  };

  const renderDatePicker = () => {
    const calendarDays = generateCalendar();
    
    return (
      <View style={styles.pickerContainer}>
        <View style={styles.header}>
            <TouchableOpacity onPress={() => changeMonth(-1)}>
                <Ionicons name="chevron-back" size={24} color="#0F172A" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
                {months[currentViewDate.getMonth()]} {currentViewDate.getFullYear()}
            </Text>
            <TouchableOpacity onPress={() => changeMonth(1)}>
                <Ionicons name="chevron-forward" size={24} color="#0F172A" />
            </TouchableOpacity>
        </View>

        <View style={styles.daysHeader}>
            {days.map(d => (
                <Text key={d} style={styles.dayLabel}>{d}</Text>
            ))}
        </View>

        <View style={styles.calendarGrid}>
            {calendarDays.map((day, idx) => (
                <TouchableOpacity 
                    key={idx}
                    disabled={!day || isDisabled(day)}
                    style={[
                        styles.dayCell, 
                        day && styles.dayCellActive,
                        isSelected(day) && styles.dayCellSelected,
                        day && isDisabled(day) && styles.dayCellDisabled
                    ]}
                    onPress={() => {
                        const m = String(currentViewDate.getMonth() + 1).padStart(2, '0');
                        const d = String(day).padStart(2, '0');
                        onChange(`${currentViewDate.getFullYear()}-${m}-${d}`);
                    }}
                >
                    <Text style={[
                        styles.dayText, 
                        isSelected(day) && styles.dayTextSelected,
                        day && isDisabled(day) && styles.dayTextDisabled,
                        !day && styles.dayTextEmpty
                    ]}>
                        {day || ''}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
      </View>
    );
  };

  const renderTimePicker = () => {
    const hours = Array.from({ length: 12 }, (_, i) => String(i === 0 ? 12 : i).padStart(2, '0'));
    const minutes = ['00', '15', '30', '45'];
    const ampm = ['AM', 'PM'];

    const currentHours = value?.split(' ')[0]?.split(':')[0] || '09';
    const currentMinutes = value?.split(' ')[0]?.split(':')[1] || '00';
    const currentAmPm = value?.split(' ')[1] || 'AM';

    return (
      <View style={styles.pickerContainer}>
        <Text style={styles.timeTitle}>Select Time</Text>
        <View style={styles.timeRows}>
            <View style={styles.timeCol}>
                <Text style={styles.colLabel}>Hour</Text>
                <ScrollView showsVerticalScrollIndicator={false} style={styles.timeScroll}>
                    {hours.map(h => (
                        <TouchableOpacity 
                            key={h} 
                            onPress={() => onChange(`${h}:${currentMinutes} ${currentAmPm}`)}
                            style={[styles.timeItem, currentHours === h && styles.timeItemSelected]}
                        >
                            <Text style={[styles.timeItemText, currentHours === h && styles.timeItemTextSelected]}>{h}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>
            <View style={styles.timeCol}>
                <Text style={styles.colLabel}>Min</Text>
                <ScrollView showsVerticalScrollIndicator={false} style={styles.timeScroll}>
                    {minutes.map(m => (
                        <TouchableOpacity 
                            key={m} 
                            onPress={() => onChange(`${currentHours}:${m} ${currentAmPm}`)}
                            style={[styles.timeItem, currentMinutes === m && styles.timeItemSelected]}
                        >
                            <Text style={[styles.timeItemText, currentMinutes === m && styles.timeItemTextSelected]}>{m}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>
            <View style={styles.timeCol}>
                <Text style={styles.colLabel}>Period</Text>
                <View style={styles.ampmContainer}>
                    {ampm.map(a => (
                        <TouchableOpacity 
                            key={a} 
                            onPress={() => onChange(`${currentHours}:${currentMinutes} ${a}`)}
                            style={[styles.timeItem, currentAmPm === a && styles.timeItemSelected]}
                        >
                            <Text style={[styles.timeItemText, currentAmPm === a && styles.timeItemTextSelected]}>{a}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.outerContainer}>
        {mode === 'date' ? renderDatePicker() : renderTimePicker()}
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    width: '100%',
  },
  pickerContainer: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  daysHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  dayLabel: {
    width: (width - 80) / 7,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  dayCell: {
    width: (width - 110) / 7,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
    marginHorizontal: 2,
    borderRadius: 20,
  },
  dayCellActive: {
    backgroundColor: '#F8FAFC',
  },
  dayCellSelected: {
    backgroundColor: '#0F172A',
  },
  dayCellDisabled: {
    backgroundColor: 'transparent',
    opacity: 0.3,
  },
  dayText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#334155',
  },
  dayTextSelected: {
    color: '#FFFFFF',
  },
  dayTextDisabled: {
    color: '#94A3B8',
  },
  dayTextEmpty: {
    color: 'transparent',
  },
  timeTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 20,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  timeRows: {
    flexDirection: 'row',
    height: 200,
  },
  timeCol: {
    flex: 1,
    alignItems: 'center',
  },
  colLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  timeScroll: {
    width: '100%',
  },
  timeItem: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    marginVertical: 2,
    marginHorizontal: 4,
  },
  timeItemSelected: {
    backgroundColor: '#0F172A',
  },
  timeItemText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#334155',
  },
  timeItemTextSelected: {
    color: '#FFFFFF',
  },
  ampmContainer: {
    width: '100%',
    gap: 8,
  }
});

export default PureJSDateTimePicker;
