import React, { memo } from 'react';
import { View, Text, TouchableOpacity, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import logger from '../utils/logger';

export const PaymentModal = memo(({
  regPaymentTarget,
  reschedulingFrom,
  tournaments,
  user,
  onRegister,
  setRegPaymentTarget,
  setSelectedTournament,
  styles
}) => {
  if (!regPaymentTarget) return null;

  const isRescheduling = !!reschedulingFrom;
  const oldT = isRescheduling ? tournaments.find(i => i.id === reschedulingFrom) : null;
  const rescheduleCount = isRescheduling ? (user?.rescheduleCounts?.[reschedulingFrom] || 0) : 0;
  const rescheduleFee = (isRescheduling && rescheduleCount > 0) ? 20 : 0;
  const priceDiff = (isRescheduling && oldT) ? (regPaymentTarget.entryFee - oldT.entryFee) : 0;
  const totalAdjustedCost = isRescheduling ? (priceDiff + rescheduleFee) : regPaymentTarget.entryFee;
  const canPayWithCredits = (user?.credits || 0) >= totalAdjustedCost;

  const finalize = async (method) => {
      try {
          const result = await onRegister(regPaymentTarget, method, totalAdjustedCost, isRescheduling, reschedulingFrom);
          
          if (result && result.success) {
              setRegPaymentTarget(null);
              setSelectedTournament(null);
              
              if (result.type === 'UPI_PENDING') {
                  Alert.alert(
                      "Verification Pending", 
                      "Your registration is being processed. Please share the payment screenshot with the organizer or wait for admin confirmation."
                  );
              } else {
                  Alert.alert("Success", isRescheduling ? "Arena swapped successfully!" : "Registration successful!");
              }
          }
      } catch (e) {
          console.error('[ExploreScreen] Finalize Error:', e);
          if (logger?.addLog) {
              logger.addLog('error', 'registration_failure', { error: e.message, stack: e.stack, tid: regPaymentTarget?.id });
          }
          Alert.alert("Error", `Could not complete registration: ${e.message || 'Please try again.'}`);
      }
  };

  return (
      <Modal transparent animationType="fade" visible={!!regPaymentTarget}>
          <View style={styles.modalOverlay}>
              <View style={styles.paymentSheet}>
                  <View style={styles.paymentHeader}>
                      <Text style={styles.paymentTitle}>{isRescheduling ? 'Confirm Swap' : 'Select Payment'}</Text>
                      <TouchableOpacity onPress={() => setRegPaymentTarget(null)}>
                          <Ionicons name="close" size={24} color="#0F172A" />
                      </TouchableOpacity>
                  </View>

                  <View style={styles.paymentSummary}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={[styles.summaryLabel, { flex: 1 }]}>Total Adjustment</Text>
                          <Text style={[styles.summaryLabel, { flex: 1, textAlign: 'right' }]}>Wallet Balance</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <Text 
                              style={[styles.summaryValue, { flex: 1, color: totalAdjustedCost < 0 ? '#16A34A' : '#EF4444' }]}
                              adjustsFontSizeToFit
                              numberOfLines={1}
                          >
                              ₹{Math.abs(totalAdjustedCost)}
                          </Text>
                          <Text 
                              style={[styles.summaryValue, { flex: 1, textAlign: 'right', color: '#334155' }, !canPayWithCredits && totalAdjustedCost > 0 && { color: '#EF4444' }]}
                              adjustsFontSizeToFit
                              numberOfLines={1}
                          >
                              ₹{user?.credits || 0}
                          </Text>
                      </View>
                      {!canPayWithCredits && totalAdjustedCost > 0 && (
                          <Text style={styles.insufficientText}>Insufficient AceTrack credits</Text>
                      )}
                  </View>

                  <View style={styles.paymentActions}>
                      <TouchableOpacity 
                          testID="explore.payment.payBtn"
                          disabled={!canPayWithCredits}
                          onPress={() => finalize('credits')}
                          style={[styles.payBtn, !canPayWithCredits && styles.payBtnDisabled]}
                      >
                          <Text style={[styles.payBtnText, !canPayWithCredits && styles.payBtnTextDisabled]}>Pay with Wallet</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity 
                          testID="explore.payment.upiBtn"
                          onPress={() => finalize('upi')}
                          style={[styles.payBtn, { backgroundColor: '#EF4444', marginTop: 12 }]}
                      >
                          <Text style={styles.payBtnText}>Pay with UPI</Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={() => setRegPaymentTarget(null)} style={styles.cancelLink}>
                          <Text style={styles.cancelLinkText}>Cancel</Text>
                      </TouchableOpacity>
                  </View>
              </View>
          </View>
      </Modal>
  );
});
