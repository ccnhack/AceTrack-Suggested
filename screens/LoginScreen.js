import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, Dimensions, ScrollView, Alert, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import config from '../config';
import logger from '../utils/logger';

const { height } = Dimensions.get('window');

const LoginScreen = ({ 
  onLoginSuccess, onSignup, onResetPassword, onRefreshData, 
  onBack, players, onToggleCloud, isUsingCloud 
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Forgot Password States
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1: ID, 2: OTP, 3: Reset
  const [forgotUser, setForgotUser] = useState('');
  const [forgotPhone, setForgotPhone] = useState('');
  const [forgotOTP, setForgotOTP] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleLogin = async () => {
    logger.logAction('LOGIN_CLICK', { username });
    setError('');
    setIsLoading(true);
    setIsSyncing(false);

    try {
      // Admin Login logic
      if (username === 'admin' && password === 'Password@123') {
        onLoginSuccess('admin', { 
          id: 'admin', 
          name: 'System Admin', 
          role: 'admin',
          avatar: 'https://ui-avatars.com/api/?name=Admin&background=random'
        });
        return;
      }

      // Demo Academy Login
      if (username === 'academy' && password === 'password') {
        const demoUser = players.find(p => p.id === 'academy');
        if (demoUser) {
          onLoginSuccess('academy', demoUser);
        } else {
          onLoginSuccess('academy', {
            id: 'academy', name: 'Ace Academy', email: 'academy@acetrack.com',
            phone: '+91 9999999999', username: 'academy', password: 'password',
            role: 'academy', isEmailVerified: true, isPhoneVerified: true
          });
        }
        return;
      }
      
      let foundUser = players.find(p => {
        const pEmail = (p.email || '').toLowerCase();
        const pId = String(p.id || '').toLowerCase();
        const pUsername = (p.username || '').toLowerCase();
        const pName = (p.name || '').toLowerCase();
        const search = username.toLowerCase().trim();
        return pEmail === search || pId === search || pUsername === search || pName === search;
      });

      // ROBUSTNESS: If user not found locally, try to refresh data from cloud
      if (!foundUser && onRefreshData) {
        console.log(`🔍 User ${username} not found locally. Attempting cloud refresh...`);
        setIsSyncing(true);
        const cloudResult = await onRefreshData();
        setIsSyncing(false);
        // If cloudResult contains players, search in the fresh list immediately
        if (cloudResult && cloudResult.players) {
          const search = username.toLowerCase().trim();
          foundUser = cloudResult.players.find(p => {
            const pEmail = (p.email || '').toLowerCase();
            const pId = String(p.id || '').toLowerCase();
            const pUsername = (p.username || '').toLowerCase();
            const pName = (p.name || '').toLowerCase();
            return pEmail === search || pId === search || pUsername === search || pName === search;
          });
          if (foundUser) console.log("✅ User found in fresh cloud data.");
        }
      }

      if (foundUser) {
        const userPassword = foundUser.password || 'password';
        if (userPassword === password) {
          if (foundUser.role === 'coach' && !foundUser.isApprovedCoach) {
            setError('Your coach application is pending verification.');
            return;
          }
          onLoginSuccess(foundUser.role || 'user', foundUser);
        } else {
          setError('Invalid password. Please try again.');
        }
      } else {
        const diagInfo = {
          searchingFor: username,
          totalPlayers: players.length,
          sampleIds: players.slice(0, 5).map(p => p.id),
          isUsingCloud,
          apiUrl: isUsingCloud ? 'https://acetrack-api-q39m.onrender.com' : config.API_BASE_URL
        };
        logger.logAction('LOGIN_FAILURE_DIAG', diagInfo);
        setError('Invalid credentials. Check your username or email.');
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("An unexpected error occurred during login.");
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  };

  const handleStartForgot = () => {
    setForgotStep(1);
    setShowForgot(true);
  };

  const handleIdentify = () => {
    const userToReset = players.find(p => 
      (String(p.id).toLowerCase() === forgotUser.toLowerCase() || (p.email && p.email.toLowerCase() === forgotUser.toLowerCase())) &&
      p.phone === forgotPhone
    );

    if (userToReset) {
      setForgotStep(2);
      // MOCK OTP SEND
      console.log(`🔑 OTP 1234 sent to ${forgotPhone}`);
    } else {
      Alert.alert("Not Found", "We couldn't find an account with that username and phone number.");
    }
  };

  const handleVerifyOTP = () => {
    if (forgotOTP === '1234') {
      setForgotStep(3);
    } else {
      Alert.alert("Invalid OTP", "Please enter the correct 4-digit code.");
    }
  };

  const handleResetPassword = async () => {
    if (!newPass || newPass !== confirmPass) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    setIsResetting(true);
    const success = await onResetPassword(forgotUser, newPass);
    setIsResetting(false);

    if (success) {
      Alert.alert("Success", "Password Reset Successful!", [
        { text: "OK", onPress: () => {
          setShowForgot(false);
          setForgotStep(1);
        }}
      ]);
    } else {
      Alert.alert("Error", "Failed to update password. Please check your connection.");
    }
  };

  return (
    <ScrollView style={styles.container} bounces={false}>
      <View style={styles.headerImageContainer}>
        <Image 
          source={{ uri: "https://images.unsplash.com/photo-1531415074968-036ba1b575da?q=80&w=1000&auto=format&fit=crop" }} 
          style={styles.image} 
        />
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.welcomeSection}>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to your AceTrack account</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Username or Email</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput 
                style={styles.input}
                placeholder="Enter your username or email"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput 
                style={styles.input}
                placeholder="Enter your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>
          </View>

          <TouchableOpacity style={styles.forgotPassword} onPress={handleStartForgot}>
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {__DEV__ && (
            <TouchableOpacity 
              onPress={onToggleCloud} 
              style={[styles.devToggle, isUsingCloud && styles.devToggleActive]}
            >
              <Ionicons 
                name={isUsingCloud ? "cloud" : "cloud-offline-outline"} 
                size={16} 
                color={isUsingCloud ? "#FFFFFF" : "#64748B"} 
              />
              <Text style={[styles.devToggleText, isUsingCloud && styles.devToggleTextActive]}>
                {isUsingCloud ? "Using Cloud API" : "Using Local API"}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={handleLogin} style={styles.loginButton} disabled={isLoading}>
            {isLoading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color="#FFFFFF" />
                {isSyncing && <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>Syncing account...</Text>}
              </View>
            ) : (
              <Text style={styles.loginButtonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={onSignup || onBack}>
            <Text style={styles.signUpText}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Forgot Password Modal */}
      <Modal visible={showForgot} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reset Password</Text>
              <TouchableOpacity onPress={() => setShowForgot(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {forgotStep === 1 && (
              <View style={styles.stepContainer}>
                <Text style={styles.stepDesc}>Enter your username and the mobile number linked to your account.</Text>
                <TextInput 
                  style={styles.modalInput} 
                  placeholder="Username" 
                  value={forgotUser} 
                  onChangeText={setForgotUser}
                  autoCapitalize="none"
                />
                <TextInput 
                  style={styles.modalInput} 
                  placeholder="Mobile Number" 
                  value={forgotPhone} 
                  onChangeText={setForgotPhone} 
                  keyboardType="phone-pad"
                />
                <TouchableOpacity style={styles.modalBtn} onPress={handleIdentify}>
                  <Text style={styles.modalBtnText}>Verify Account</Text>
                </TouchableOpacity>
              </View>
            )}

            {forgotStep === 2 && (
              <View style={styles.stepContainer}>
                <Text style={styles.stepDesc}>We've sent a 4-digit code to {forgotPhone}. Enter it below.</Text>
                <TextInput 
                  style={styles.modalInput} 
                  placeholder="4-digit OTP" 
                  value={forgotOTP} 
                  onChangeText={setForgotOTP} 
                  keyboardType="number-pad"
                  maxLength={4}
                />
                <TouchableOpacity style={styles.modalBtn} onPress={handleVerifyOTP}>
                  <Text style={styles.modalBtnText}>Confirm OTP</Text>
                </TouchableOpacity>
              </View>
            )}

            {forgotStep === 3 && (
              <View style={styles.stepContainer}>
                <Text style={styles.stepDesc}>Set your new password below.</Text>
                <TextInput 
                  style={styles.modalInput} 
                  placeholder="New Password" 
                  value={newPass} 
                  onChangeText={setNewPass} 
                  secureTextEntry
                />
                <TextInput 
                  style={styles.modalInput} 
                  placeholder="Confirm New Password" 
                  value={confirmPass} 
                  onChangeText={setConfirmPass} 
                  secureTextEntry
                />
                <TouchableOpacity style={styles.modalBtn} onPress={handleResetPassword} disabled={isResetting}>
                  {isResetting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalBtnText}>Update Password</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  headerImageContainer: { height: height * 0.3, width: '100%' },
  image: { width: '100%', height: '100%' },
  backButton: { position: 'absolute', top: 50, left: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0, 0, 0, 0.3)', alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, padding: 24, marginTop: -30, backgroundColor: '#FFFFFF', borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  welcomeSection: { marginBottom: 32 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#0F172A', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#64748B' },
  form: { gap: 20 },
  inputGroup: { gap: 8 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#0F172A', marginLeft: 4 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 16 },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, height: 56, color: '#0F172A', fontSize: 16 },
  forgotPassword: { alignSelf: 'flex-end' },
  forgotPasswordText: { color: '#3B82F6', fontSize: 14, fontWeight: '600' },
  errorText: { color: '#EF4444', fontSize: 14, textAlign: 'center', marginTop: 4 },
  loginButton: { height: 56, backgroundColor: '#EF4444', borderRadius: 16, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#EF4444', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, marginTop: 12 },
  loginButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  devToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, backgroundColor: '#F1F5F9', borderRadius: 12, marginTop: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  devToggleActive: { backgroundColor: '#3B82F6', borderColor: '#2563EB' },
  devToggleText: { fontSize: 12, fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase' },
  devToggleTextActive: { color: '#FFFFFF' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 32, marginBottom: 20 },
  footerText: { color: '#64748B', fontSize: 15 },
  signUpText: { color: '#EF4444', fontSize: 15, fontWeight: 'bold' },
  
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 40, borderTopRightRadius: 40, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0F172A' },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  stepContainer: { gap: 16 },
  stepDesc: { fontSize: 14, color: '#64748B', lineHeight: 20, marginBottom: 8 },
  modalInput: { backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 16, height: 56, fontSize: 16, color: '#0F172A' },
  modalBtn: { backgroundColor: '#3B82F6', borderRadius: 16, height: 56, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  modalBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
});

export default LoginScreen;
