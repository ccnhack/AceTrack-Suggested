import React from 'react';
import { View, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDateIST } from '../utils/tournamentUtils';
import { Sport } from '../types';

export const AcademyTournamentCard = ({
  t,
  tFilter,
  players,
  visibleOtps,
  setVisibleOtps,
  setEditingT,
  setIsFormOpen,
  setViewingTournamentId,
  onDeleteTournament,
  styles
}) => {
  return (
    <View style={[styles.premiumCard, tFilter === 'past' && styles.tCardPast]}>
      <View style={styles.premiumCardBody}>
        <View style={styles.tCardMainInfo}>
          <View style={styles.sportBadgeSmall}>
              <Ionicons 
                  name={t.sport === Sport.Tennis ? "tennisball" : (t.sport === Sport.Badminton ? "fitness" : "disc")} 
                  size={12} 
                  color="#6366F1" 
              />
              <Text style={styles.sportBadgeTextSmall}>{t.sport}</Text>
          </View>
          <Text style={styles.premiumTTitle}>{t.title}</Text>
          <View style={styles.locationRow}>
              <Ionicons name="location" size={12} color="#94A3B8" />
              <Text style={styles.locationTextSmall} numberOfLines={1}>{t.location}</Text>
          </View>
        </View>
        
        <View style={styles.tCardRightActions}>
          <TouchableOpacity 
              onPress={() => { setEditingT(t); setIsFormOpen(true); }}
              style={styles.premiumEditBtn}
          >
              <Ionicons name={tFilter === 'past' ? "eye" : "create"} size={20} color="#6366F1" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.premiumTInfoGrid}>
          <View style={styles.infoGridItem}>
              <Text style={styles.infoGridLabel}>Date</Text>
              <Text 
                  style={styles.infoGridValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
              >
                  {formatDateIST(t.date)}
              </Text>
          </View>
          <View style={styles.infoGridItem}>
              <Text style={styles.infoGridLabel}>Participants</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.infoGridValue}>{(t.registeredPlayerIds || []).length} / {t.maxPlayers}</Text>
                  {(t.waitlistedPlayerIds || []).length > 0 && (
                      <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 4, borderRadius: 4 }}>
                          <Text style={{ fontSize: 9, color: '#64748B', fontWeight: 'bold' }}>+{t.waitlistedPlayerIds.length} Wait</Text>
                      </View>
                  )}
              </View>
          </View>
          <View style={styles.infoGridItem}>
              <Text style={styles.infoGridLabel}>Entry Fee</Text>
              <Text style={styles.infoGridValue}>₹{t.entryFee}</Text>
          </View>
      </View>

      {(t.coachStatus === 'Coach Assigned' || t.coachStatus === 'Coach Assigned - Academy') && t.assignedCoachId && (
          <View style={styles.premiumCoachSection}>
              <View style={styles.premiumCoachHeader}>
                  <View style={styles.premiumCoachAvatar}>
                      <Ionicons name="person" size={14} color="#6366F1" />
                  </View>
                  <View style={styles.flex}>
                      <Text style={styles.premiumCoachLabel}>Assigned Coach</Text>
                      <Text style={styles.premiumCoachName}>{players.find(p => p.id === t.assignedCoachId)?.name}</Text>
                  </View>
                  {tFilter === 'upcoming' && t.status !== 'completed' && !t.tournamentConcluded && (
                      <View style={styles.premiumOtpTrigger}>
                          {visibleOtps.has(t.id) ? (
                              <TouchableOpacity 
                                  onPress={() => setVisibleOtps(prev => {
                                      const next = new Set(prev);
                                      next.delete(t.id);
                                      return next;
                                  })}
                                  style={styles.premiumOtpBox}
                              >
                                  <Text style={styles.pOtpVal}>{t.startOtp}</Text>
                                  <View style={styles.pOtpLine} />
                                  <Text style={styles.pOtpVal}>{t.endOtp}</Text>
                              </TouchableOpacity>
                          ) : (
                              <TouchableOpacity 
                                  onPress={() => setVisibleOtps(prev => new Set(prev).add(t.id))}
                                  style={styles.pViewOtpBtn}
                              >
                                  <Text style={styles.pViewOtpText}>OTP</Text>
                              </TouchableOpacity>
                          )}
                      </View>
                  )}
              </View>
          </View>
      )}

      <View style={styles.premiumCardFooter}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <TouchableOpacity 
                testID={`academy.tournament.manageRoster.${t.title}`}
                onPress={() => setViewingTournamentId(t.id)}
                style={styles.premiumPrimaryBtn}
            >
                <Text style={styles.premiumPrimaryBtnText}>Manage Roster</Text>
                {t.interestedPlayerIds?.length > 0 && (
                  <View style={styles.interestBadge}>
                    <Text style={styles.interestBadgeText}>{t.interestedPlayerIds.length}</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
            </TouchableOpacity>

            {(t.registeredPlayerIds || []).length === 0 && (t.pendingPaymentPlayerIds || []).length === 0 && (
              <TouchableOpacity 
                  onPress={() => {
                    Alert.alert(
                      "Delete Tournament",
                      "Are you sure you want to permanently delete this tournament?",
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Delete", style: "destructive", onPress: () => onDeleteTournament(t.id) }
                      ]
                    );
                  }}
              >
                  <Text style={styles.footerDeleteButton}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
          
          <View style={[styles.premiumStatusPill, tFilter === 'past' ? styles.statusPillPast : styles.statusPillActive]}>
              <View style={[styles.statusDot, tFilter === 'past' ? { backgroundColor: '#94A3B8' } : { backgroundColor: '#EF4444' }]} />
              <Text style={[styles.premiumStatusText, tFilter === 'past' ? { color: '#64748B' } : { color: '#EF4444' }]}>
                  {tFilter === 'past' ? 'Archived' : (t.status === 'upcoming' ? 'Upcoming' : t.status)}
              </Text>
          </View>
      </View>
    </View>
  );
};
