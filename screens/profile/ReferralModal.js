import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "../ProfileScreen.styles";

export const ReferralModal = (props) => {
  const { showReferralModal, setShowReferralModal, referralCode, copyToClipboard } = props;
  
  return (
        <Modal visible={showReferralModal} animationType="fade" transparent={true} onRequestClose={() => setShowReferralModal(false)}>
          <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]}>
            <View style={styles.walletModalContent}>
              <View style={styles.walletModalHeader}>
                <Text style={styles.walletModalTitle}>Referral Program</Text>
                <TouchableOpacity onPress={() => setShowReferralModal(false)} style={styles.walletModalClose}>
                  <Ionicons name="close" size={22} color="#0F172A" />
                </TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                <PlayerReferralDashboard user={user} />
              </ScrollView>
            </View>
          </View>
        </Modal>
  );
};
