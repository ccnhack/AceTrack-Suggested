import React from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import styles from "./ProfileScreen.styles";
import { PlayerWalletDashboard } from '../../components/PlayerProfileFeatures';

export const WalletModal = (props) => {
  const { showWalletModal, setShowWalletModal, user, onTopUp, players } = props;
  
  return (
        <Modal visible={showWalletModal} animationType="fade" transparent={true} onRequestClose={() => setShowWalletModal(false)}>
          <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]}>
            <View style={styles.walletModalContent}>
              <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                <View style={styles.walletModalHeader}>
                  <Text style={styles.walletModalTitle}>My Wallet</Text>
                  <TouchableOpacity onPress={() => setShowWalletModal(false)} style={styles.walletModalClose}>
                    <Ionicons name="close" size={22} color="#0F172A" />
                  </TouchableOpacity>
                </View>
                <PlayerWalletDashboard 
                  user={user} 
                  onTopUp={(amount) => onTopUp(amount, players)} 
                  noCard={true}
                />
              </ScrollView>
            </View>
          </View>
        </Modal>
  );
};
