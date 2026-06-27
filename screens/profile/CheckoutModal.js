import React from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "../ProfileScreen.styles";

export const CheckoutModal = (props) => {
  const { checkoutModalVisible, setCheckoutModalVisible, isCheckingOut, handleWebCheckout, showDialog } = props;
  
  return (
      <Modal visible={checkoutModalVisible} animationType="fade" transparent={true} onRequestClose={() => setCheckoutModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: '90%', backgroundColor: '#FFF', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 10 }}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: isEarlyCheckout ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name={isEarlyCheckout ? "warning-outline" : "log-out-outline"} size={24} color={isEarlyCheckout ? "#EF4444" : "#10B981"} />
              </View>
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#1E293B', textAlign: 'center' }}>
                {isEarlyCheckout ? 'Early Checkout' : 'Confirm Checkout'}
              </Text>
            </View>

            {isEarlyCheckout && (
              <Text style={{ fontSize: 13, color: '#64748B', marginBottom: 16, textAlign: 'center', lineHeight: 20 }}>
                You are checking out before completing your 7-hour shift. Please provide a mandatory justification below.
              </Text>
            )}
            {!isEarlyCheckout && (
              <Text style={{ fontSize: 14, color: '#64748B', marginBottom: 24, textAlign: 'center', lineHeight: 20 }}>
                Are you sure you want to check out of your active shift?
              </Text>
            )}

            {isEarlyCheckout && (
              <TextInput
                style={{ backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 16, fontSize: 14, color: '#1E293B', height: 120, textAlignVertical: 'top', marginBottom: 24 }}
                placeholder="Enter reason for early checkout (min 10 characters)..."
                placeholderTextColor="#94A3B8"
                multiline={true}
                value={checkoutJustification}
                onChangeText={setCheckoutJustification}
              />
            )}

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity 
                onPress={() => { setCheckoutModalVisible(false); setCheckoutJustification(''); }}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center' }}
              >
                <Text style={{ color: '#64748B', fontWeight: '800', fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => {
                  handleProfileShiftAction('checkout', isEarlyCheckout ? checkoutJustification : '');
                }}
                disabled={isEarlyCheckout && checkoutJustification.trim().length < 10}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: (isEarlyCheckout && checkoutJustification.trim().length < 10) ? '#94A3B8' : '#EF4444', alignItems: 'center' }}
              >
                <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 15 }}>Check Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
  );
};
