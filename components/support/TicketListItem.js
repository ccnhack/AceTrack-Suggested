import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { statusColors, formatTicketDateFull } from '../grievances/constants';
import styles from '../grievances/AdminGrievancesPanel.styles';

export const TicketListItem = ({ 
  ticket, 
  isUnread, 
  getUserName, 
  onSelect 
}) => {
  const status = ticket.status || 'Open';
  const st = statusColors[status] || statusColors['Open'];

  return (
    <TouchableOpacity 
      testID={`admin.support.card.${ticket.id}`}
      onPress={() => onSelect(ticket)}
      style={[styles.ticketCard, isUnread && styles.unreadCard]}
    >
      <View style={styles.ticketTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.ticketTitle} numberOfLines={1}>
            {ticket.title || 'Untitled Ticket'}
          </Text>
          <Text style={styles.ticketMeta}>
            {getUserName(ticket.userId)} • ID: {ticket.id || 'NO-ID'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={[styles.statusBadge, { backgroundColor: st.bg, borderColor: st.border }]}>
            <Text style={[styles.statusBadgeText, { color: st.text }]}>{status}</Text>
          </View>
          <Text 
            style={{ fontSize: 9, color: ticket.assignedTo ? '#64748B' : '#EF4444', fontWeight: 'bold', marginTop: 4 }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {ticket.assignedTo ? getUserName(ticket.assignedTo) : 'Unassigned'}
          </Text>
        </View>
      </View>
      <View style={styles.ticketBottom}>
        <Text style={styles.ticketType}>{ticket.type || 'General'}</Text>
        <Text style={styles.ticketDate}>{formatTicketDateFull(ticket.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );
};
