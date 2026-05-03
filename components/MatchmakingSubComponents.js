import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SafeAvatar from './SafeAvatar';

// Note: Ensure the parent passes down the correct styles or they are defined here.
// For now, we expect the parent to pass styles down or we define minimal styles here.

export const TimeSlotItem = memo(({ index, slot, isBlocked, isInPast, isSelBase, isExpanded, onExpand, onSelect, expandedSlot, styles }) => {
  const isRightSide = index % 4 >= 2;
  return (
    <View style={[styles.slotWrapper, { zIndex: isExpanded ? 100 : 1 }]}>
      <TouchableOpacity 
        disabled={isBlocked || isInPast}
        style={[
          styles.slotBtn, 
          isSelBase && styles.slotBtnActive,
          (isBlocked || isInPast) && { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0', opacity: 0.5 }
        ]}
        onPress={() => onExpand(isExpanded ? null : slot)}
      >
        <Text style={[
          styles.slotText, 
          isSelBase && styles.slotTextActive,
          isBlocked && { color: '#94A3B8' }
        ]}>{isSelBase ? (onSelect.targetTime || slot) : slot}</Text>
      </TouchableOpacity>

      {isExpanded && !isBlocked && (
        <View style={[styles.subIntervalsPopup, isRightSide ? { left: undefined, right: 0 } : { left: 0 }]}>
           {[':00', ':15', ':30', ':45'].map((mins, subIndex) => {
             const fullTime = slot.replace(':00', mins);
             const isSel = onSelect.targetTime === fullTime;
             return (
               <TouchableOpacity 
                 key={`mins-${subIndex}`}
                 style={[styles.subBtn, isSel && styles.subBtnActive]}
                 onPress={() => onSelect(fullTime)}
               >
                 <Text style={[styles.subBtnText, isSel && styles.subBtnTextActive]}>{fullTime}</Text>
               </TouchableOpacity>
             );
           })}
        </View>
      )}
    </View>
  );
});

export const VenueItem = memo(({ venue, isSelected, onSelect, styles }) => {
  return (
    <TouchableOpacity 
      style={[styles.venueItem, isSelected && styles.venueItemSelected]}
      onPress={() => onSelect(venue)}
    >
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[styles.venueName, isSelected && styles.venueNameSelected]}>
            {venue.venueName}{venue.area ? ` - ${venue.area}` : ''}
          </Text>
          <Text style={styles.venueDistance}>{venue.distance ? `${venue.distance} km` : ''}</Text>
        </View>
        {venue.sport && <Text style={styles.venueSportText}>({venue.sport})</Text>}
        <Text style={styles.venueAddress} numberOfLines={1}>{venue.address}</Text>
      </View>
      {isSelected && <Ionicons name="checkmark-circle" size={20} color="#6366F1" />}
    </TouchableOpacity>
  );
});

export const OpponentCard = memo(({ item, role, isSent, onChallenge, styles }) => {
  const isAcademy = role === 'academy';
  const imageUri = item.avatar || item.headshot || item.profileImage;

  return (
    <View style={styles.card}>
      <SafeAvatar 
        uri={imageUri} 
        name={item.name} 
        role={item.role} 
        size={50} 
        borderRadius={25} 
        style={styles.avatar} 
      />
      <View style={styles.info}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.details}>
          {isAcademy ? (item.managedSports?.join(', ')) : (item.sport || item.certifiedSports?.[0] || 'Badminton')} • {item.skillLevel || item.level || 'Intermediate'}
        </Text>
        <Text style={styles.dist}><Ionicons name="location" size={12} /> {item.city || 'Near You'}</Text>
      </View>
      <TouchableOpacity
        testID="matchmaking.challenge.button"
        style={[styles.btn, isSent && styles.btnSent]}
        onPress={() => isSent ? null : onChallenge(item)}
      >
        <Text style={styles.btnText}>{isSent ? 'Requests' : 'Challenge'}</Text>
      </TouchableOpacity>
    </View>
  );
});

export const SentRequestCard = memo(({ req, getOpponentName, onOpenDetails, onCounter, onCancel, styles }) => (
  <TouchableOpacity style={styles.requestCard} onPress={() => onOpenDetails(req)}>
    <View style={styles.info}>
      <Text style={styles.name} numberOfLines={1}>{getOpponentName(req)}</Text>
      <Text style={styles.details}>{req.sport} • {req.proposedDate} at {req.proposedTime} • {req.status || 'Pending'}</Text>
    </View>
    <View style={styles.actionRow}>
      <TouchableOpacity 
        testID="matchmaking.counter.button"
        style={styles.smallBtn} 
        onPress={() => onCounter(req)}
      >
        <Text style={styles.smallBtnText}>Counter</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        testID="matchmaking.cancel.button"
        style={[styles.smallBtn, { backgroundColor: '#FFEEF2' }]} 
        onPress={() => onCancel(req)}
      >
        <Text style={[styles.smallBtnText, { color: '#E11D48' }]}>Cancel</Text>
      </TouchableOpacity>
    </View>
  </TouchableOpacity>
));

export const ReceivedRequestCard = memo(({ req, role, getOpponentName, onOpenDetails, onDecline, onCounter, onAccept, styles }) => (
  <TouchableOpacity 
    style={[styles.requestCard, req.isNew && styles.unreadRequestCard]} 
    onPress={() => onOpenDetails(req)}
  >
    <View style={styles.info}>
      <Text style={styles.name}>{getOpponentName(req)}</Text>
      <Text style={[styles.details, req.status === 'Counter Proposed' && { color: '#D97706' }]}>
        {req.sport} • {req.time || (req.proposedDate + ' @ ' + req.proposedTime)}
        {req.status === 'Counter Proposed' ? ' (Negotiating)' : ''}
      </Text>
    </View>
    <View style={styles.actionRow}>
      <TouchableOpacity 
        testID="matchmaking.decline.button"
        style={[styles.smallBtn, { backgroundColor: '#F1F5F9' }]} 
        onPress={() => onDecline(req)}
      >
        <Text style={[styles.smallBtnText, { color: '#64748B' }]}>Decline</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        testID="matchmaking.counter.button"
        style={styles.smallBtn} 
        onPress={() => onCounter(req)}
      >
        <Text style={styles.smallBtnText}>Counter</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        testID="matchmaking.accept.button"
        style={[styles.smallBtn, { backgroundColor: '#22C55E' }]} 
        onPress={() => onAccept(req)}
      >
        <Text style={styles.smallBtnText}>{role === 'coach' ? 'Confirm' : 'Accept'}</Text>
      </TouchableOpacity>
    </View>
  </TouchableOpacity>
));

export const CounteredRequestCard = memo(({ req, role, getOpponentName, onOpenDetails, onCounter, onAccept, styles }) => (
  <TouchableOpacity style={[styles.requestCard, { borderLeftColor: '#F59E0B' }]} onPress={() => onOpenDetails(req)}>
    <View style={styles.info}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>{getOpponentName(req)}</Text>
        {req.hasUserResponse && (
          <View style={styles.responseTag}>
            <Text style={styles.responseTagText}>USER RESPONDED</Text>
          </View>
        )}
      </View>
      <Text style={styles.details}>{req.sport} • {req.proposedDate} at {req.proposedTime} • {req.status}</Text>
    </View>
    <View style={styles.actionRow}>
      <TouchableOpacity style={styles.smallBtn} onPress={() => onCounter(req)}>
        <Text style={styles.smallBtnText}>Counter</Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.smallBtn, { backgroundColor: (role === 'coach' ? (req.hasUserResponse ? '#22C55E' : '#E2E8F0') : '#22C55E') }]} 
        onPress={() => role === 'coach' ? (req.hasUserResponse ? onAccept(req) : null) : onAccept(req)}
      >
        <Text style={[styles.smallBtnText, { color: (role === 'coach' ? (req.hasUserResponse ? '#fff' : '#94A3B8') : '#fff') }]}>
          {role === 'coach' ? 'Confirm' : 'Accept'}
        </Text>
      </TouchableOpacity>
    </View>
  </TouchableOpacity>
));

export const ExpiredRequestCard = memo(({ req, getOpponentName, onOpenDetails, onRemove, isUnread, styles }) => (
  <TouchableOpacity 
    style={[
      styles.requestCard, 
      { borderLeftColor: '#94A3B8' },
      isUnread && styles.unreadRequestCard
    ]} 
    onPress={() => onOpenDetails(req)}
  >
    <View style={styles.info}>
      <Text style={styles.name} numberOfLines={1}>{getOpponentName(req)}</Text>
      <Text style={styles.details}>{req.sport} • {req.proposedDate} at {req.proposedTime}</Text>
      <Text style={[styles.details, { color: '#EF4444', fontSize: 10, fontWeight: '700' }]}>EXPIRED</Text>
    </View>
    <View style={styles.actionRow}>
      <TouchableOpacity 
        style={[styles.smallBtn, { backgroundColor: '#F1F5F9' }]} 
        onPress={() => onRemove(req.id)}
      >
        <Ionicons name="trash-outline" size={16} color="#64748B" />
      </TouchableOpacity>
    </View>
  </TouchableOpacity>
));

export const AcceptedMatchCard = memo(({ match, role, getOpponentName, onOpenDetails, styles, colors }) => (
  <TouchableOpacity style={styles.acceptedCard} onPress={() => onOpenDetails(match)}>
    <View style={styles.acceptedHeader}>
       <Ionicons name="calendar" size={20} color={colors.primary} />
       <Text style={styles.acceptedTime}>{match.time}</Text>
    </View>
    <Text style={styles.acceptedTitle}>{role === 'coach' ? 'Booked by ' : 'vs '}{getOpponentName(match)}</Text>
    <Text style={styles.acceptedDetail}>{match.sport} • {match.location}</Text>
  </TouchableOpacity>
));

export const HistoryMatchCard = memo(({ item, getOpponentName, onOpenDetails, styles }) => (
  <TouchableOpacity style={styles.historyCard} onPress={() => onOpenDetails(item)}>
    <View>
      <Text style={styles.historyName}>{getOpponentName(item)}</Text>
      <Text style={styles.historyDetail}>{item.sport} • {item.date || item.proposedDate}</Text>
      {item.location && <Text style={styles.historySubDetail}>{item.location}</Text>}
    </View>
  </TouchableOpacity>
));
