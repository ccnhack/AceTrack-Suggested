import React, { memo, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTournamentsStore } from '../stores/useTournamentsStore';
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
  const isDoubles = regPaymentTarget?.format && ["Men's Doubles", "Women's Doubles", "Mixed Doubles"].includes(regPaymentTarget.format);
  
  const [teamCode, setTeamCode] = useState('');
  const [registerPartner, setRegisterPartner] = useState(false);
  const [partnerPhone, setPartnerPhone] = useState('');
  const [partnerName, setPartnerName] = useState(null);
  const [partnerId, setPartnerId] = useState(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  useEffect(() => {
    if (!regPaymentTarget) {
      setTeamCode('');
      setRegisterPartner(false);
      setPartnerPhone('');
      setPartnerName(null);
      setPartnerId(null);
      setIsLookingUp(false);
    }
  }, [regPaymentTarget]);

  useEffect(() => {
    if (!registerPartner || partnerPhone.length < 10) {
      setPartnerName(null);
      setPartnerId(null);
      return;
    }
    
    const delayDebounceFn = setTimeout(async () => {
      setIsLookingUp(true);
      const res = await useTournamentsStore.getState().lookupPartnerByPhone(partnerPhone);
      if (res && res.success && res.user) {
        if (regPaymentTarget?.format === "Men's Doubles" && res.user.gender !== 'Male') {
          setPartnerName('Only male players allowed');
          setPartnerId(null);
        } else if (regPaymentTarget?.format === "Women's Doubles" && res.user.gender !== 'Female') {
          setPartnerName('Only female players allowed');
          setPartnerId(null);
        } else {
          setPartnerName(res.user.name);
          setPartnerId(res.user.id);
        }
      } else {
        setPartnerName('Not found');
        setPartnerId(null);
      }
      setIsLookingUp(false);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [partnerPhone, registerPartner]);

  const rescheduleCount = isRescheduling ? (user?.rescheduleCounts?.[reschedulingFrom] || 0) : 0;
  const rescheduleFee = (isRescheduling && rescheduleCount > 0) ? 20 : 0;
  
  const baseEntryFee = isDoubles ? (regPaymentTarget.entryFee / 2) : regPaymentTarget.entryFee;
  const isRegisteringPartner = isDoubles && registerPartner;
  const effectiveBaseFee = isRegisteringPartner ? (baseEntryFee * 2) : baseEntryFee;

  const oldBaseFee = (oldT && oldT.format && ["Men's Doubles", "Women's Doubles", "Mixed Doubles"].includes(oldT.format)) ? (oldT.entryFee / 2) : (oldT ? oldT.entryFee : 0);

  const priceDiff = (isRescheduling && oldT) ? (effectiveBaseFee - oldBaseFee) : 0;
  const totalAdjustedCost = isRescheduling ? (priceDiff + rescheduleFee) : effectiveBaseFee;
  const canPayWithCredits = (user?.credits || 0) >= totalAdjustedCost;

  const finalize = async (method) => {
      try {
          if (isRegisteringPartner && !partnerId) {
              Alert.alert("Missing Partner", "Please enter a valid partner phone number, or uncheck the register partner option.");
              return;
          }

          const result = await onRegister(
            regPaymentTarget, 
            method, 
            totalAdjustedCost, 
            isRescheduling, 
            reschedulingFrom, 
            null, 
            teamCode.trim() ? teamCode.trim() : null,
            isRegisteringPartner ? partnerId : null
          );
          
          if (result && result.success) {
              setRegPaymentTarget(null);
              setSelectedTournament(null);
              setTeamCode('');
              setRegisterPartner(false);
              setPartnerPhone('');
              
              setTimeout(() => {
                  if (isRescheduling) {
                      Alert.alert("Success", "Arena swapped successfully!");
                  } else {
                      Alert.alert(
                        "Registration successful!", 
                        result.teamCode 
                          ? `You have paid half the entry fee. Your Team Code is: ${result.teamCode}. Share this with your partner so they can join your team!`
                          : "You are successfully registered!"
                      );
                  }
              }, 300);
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

                      {isDoubles && !isRescheduling && (
                          <View style={{ marginTop: 12 }}>
                              <TouchableOpacity 
                                  style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}
                                  onPress={() => setRegisterPartner(!registerPartner)}
                              >
                                  <Ionicons name={registerPartner ? "checkbox" : "square-outline"} size={20} color="#0F172A" />
                                  <Text style={[styles.summaryLabel, { marginLeft: 8, marginBottom: 0 }]}>Register your partner too?</Text>
                              </TouchableOpacity>

                              {registerPartner && (
                                  <View style={{ marginBottom: 12 }}>
                                      <Text style={[styles.summaryLabel, { marginBottom: 6 }]}>Partner's Phone Number</Text>
                                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 10 }}>
                                          <TextInput
                                              style={{ flex: 1, color: '#0F172A', fontSize: 14, fontFamily: 'Inter-Medium', paddingVertical: 10 }}
                                              placeholder="Enter 10-digit number"
                                              placeholderTextColor="#94A3B8"
                                              keyboardType="phone-pad"
                                              value={partnerPhone}
                                              onChangeText={setPartnerPhone}
                                              maxLength={10}
                                          />
                                          {isLookingUp ? (
                                              <Ionicons name="sync-outline" size={18} color="#94A3B8" />
                                          ) : (partnerName === 'Not found' || partnerName === 'Only male players allowed' || partnerName === 'Only female players allowed') ? (
                                              <Ionicons name="close-circle" size={18} color="#EF4444" />
                                          ) : partnerId ? (
                                              <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                                          ) : null}
                                      </View>
                                      {partnerName && partnerName !== 'Not found' && partnerName !== 'Only male players allowed' && partnerName !== 'Only female players allowed' && (
                                          <Text style={{ color: '#16A34A', fontSize: 12, marginTop: 4, fontFamily: 'Inter-Medium' }}>
                                              ✅ {partnerName}
                                          </Text>
                                      )}
                                      {(partnerName === 'Not found' || partnerName === 'Only male players allowed' || partnerName === 'Only female players allowed') && (
                                          <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4, fontFamily: 'Inter-Medium' }}>
                                              {partnerName === 'Not found' ? 'Partner not found' : partnerName}
                                          </Text>
                                      )}
                                  </View>
                              )}

                              {!registerPartner && (
                                  <>
                                      <Text style={[styles.summaryLabel, { marginBottom: 6 }]}>Join Existing Team (Optional)</Text>
                                      <TextInput
                                          style={{
                                              backgroundColor: '#F8FAFC',
                                              borderWidth: 1,
                                              borderColor: '#E2E8F0',
                                              borderRadius: 8,
                                              padding: 10,
                                              color: '#0F172A',
                                              fontSize: 14,
                                              fontFamily: 'Inter-Medium'
                                          }}
                                          placeholder="Enter 6-digit Team Code"
                                          placeholderTextColor="#94A3B8"
                                          value={teamCode}
                                          onChangeText={(text) => setTeamCode(text.toUpperCase())}
                                          maxLength={6}
                                          autoCapitalize="characters"
                                      />
                                  </>
                              )}
                          </View>
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
