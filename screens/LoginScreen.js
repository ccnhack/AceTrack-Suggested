import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, Dimensions, ScrollView, Alert, Modal, ActivityIndicator, Platform, ImageBackground } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import config from '../config';
import logger from '../utils/logger';

const { height } = Dimensions.get('window');

const LoginScreen = ({ 
  onLoginSuccess, onSignup, onResetPassword, onRefreshData, 
  onBack, players, onToggleCloud, isUsingCloud 
}) => {
  useEffect(() => {
    // DIAGNOSTIC LOGGING
    console.log(`📱 [DIAGNOSTIC] LoginScreen Dimensions: ${JSON.stringify({
      window: { width: Dimensions.get('window').width, height: Dimensions.get('window').height },
      screen: { width: Dimensions.get('screen').width, height: Dimensions.get('screen').height },
      platform: Platform.OS,
      isShortScreen: Dimensions.get('window').height < 750
    })}`);
  }, []);

  const isShortScreen = height < 700;
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
  const [storedUserToReset, setStoredUserToReset] = useState(null);

  const handleLogin = async () => {
    logger.logAction('LOGIN_CLICK', { username });
    setError('');
    setIsLoading(true);
    setIsSyncing(false);

    try {
      // Web Admin Only restriction
      if (Platform.OS === 'web') {
        if (username === 'admin' && password === 'Password@123') {
          onLoginSuccess('admin', { 
            id: 'admin', 
            name: 'System Admin', 
            role: 'admin',
            avatar: 'https://ui-avatars.com/api/?name=Admin&background=random'
          });
          return;
        } else {
          setError('Access Denied. This portal is strictly for AceTrack Administrators.');
          setIsLoading(false);
          return;
        }
      }

      // Admin Login logic
      if (username === 'admin' && password === 'Password@123') {
        onLoginSuccess('admin', { 
          id: 'admin', 
          name: 'System Admin', 
          role: 'admin',
          avatar: 'https://ui-avatars.com/api/?name=Admin&background=000000&color=ffffff'
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
        console.log(`🔍 User "${username}" not found in ${players.length} local players. IDs: [${players.slice(0, 10).map(p => p.id).join(', ')}]. Attempting cloud refresh...`);
        logger.logAction('LOGIN_CLOUD_REFRESH_START', { username, localPlayerCount: players.length });
        setIsSyncing(true);
        const cloudResult = await onRefreshData();
        setIsSyncing(false);
        
        logger.logAction('LOGIN_CLOUD_REFRESH_RESULT', { 
          hasResult: !!cloudResult, 
          type: typeof cloudResult, 
          hasPlayers: !!(cloudResult && cloudResult.players),
          playerCount: cloudResult?.players?.length || 0 
        });
        
        // If cloudResult contains players, search in the fresh list immediately
        if (cloudResult && cloudResult.players) {
          const search = username.toLowerCase().trim();
          const cloudPlayerIds = cloudResult.players.map(p => String(p.id || '').toLowerCase());
          console.log(`☁️ Cloud returned ${cloudResult.players.length} players. Searching for "${search}"...`);
          console.log(`☁️ Cloud player IDs: [${cloudPlayerIds.slice(0, 15).join(', ')}${cloudPlayerIds.length > 15 ? '...' : ''}]`);
          
          foundUser = cloudResult.players.find(p => {
            const pEmail = (p.email || '').toLowerCase();
            const pId = String(p.id || '').toLowerCase();
            const pUsername = (p.username || '').toLowerCase();
            const pName = (p.name || '').toLowerCase();
            return pEmail === search || pId === search || pUsername === search || pName === search;
          });
          if (foundUser) {
            console.log("✅ User found in fresh cloud data!");
            logger.logAction('LOGIN_CLOUD_USER_FOUND', { userId: foundUser.id, role: foundUser.role });
          } else {
            console.log(`❌ User "${search}" NOT found even after cloud refresh.`);
            logger.logAction('LOGIN_CLOUD_USER_NOT_FOUND', { search, cloudPlayerCount: cloudResult.players.length });
          }
        } else {
          console.log(`⚠️ Cloud refresh returned no player data. cloudResult type: ${typeof cloudResult}`);
          logger.logAction('LOGIN_CLOUD_REFRESH_NO_DATA', { resultType: typeof cloudResult });
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
          allPlayerIds: players.slice(0, 30).map(p => p.id),
          isUsingCloud,
          apiUrl: isUsingCloud ? 'https://acetrack-suggested.onrender.com' : config.API_BASE_URL
        };
        logger.logAction('LOGIN_FAILURE_DIAG', diagInfo);
        console.error(`🛑 LOGIN FAILED for "${username}". Players in state: [${players.map(p => p.id).join(', ')}]`);
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
      setStoredUserToReset(userToReset);
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
    const targetId = storedUserToReset ? storedUserToReset.id : forgotUser;
    const success = await onResetPassword(targetId, newPass);
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

  if (Platform.OS === 'web') {
    return (
      <ImageBackground 
        source={{ uri: "https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?q=80&w=2000&auto=format&fit=crop" }} 
        style={styles.webBg}
        resizeMode="cover"
      >
        <View style={styles.webOverlay}>
          <View style={styles.webLoginBox}>
            <View style={{ alignItems: 'center', marginBottom: 32 }}>
              <Image source={require('../assets/icon.png')} style={{ width: 80, height: 80, borderRadius: 20, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' }} />
              <Text style={styles.webTitle}>AceTrack Admin</Text>
              <Text style={styles.webSubtitle}>Authorized Personnel Only</Text>
            </View>

            {error ? <View style={{ backgroundColor: '#FEE2E2', padding: 12, borderRadius: 8, marginBottom: 16 }}><Text style={{ color: '#EF4444', textAlign: 'center', fontSize: 13, fontWeight: 'bold' }}>{error}</Text></View> : null}

            <View style={{ marginBottom: 20 }}>
              <Text style={styles.webInputLabel}>Admin Username</Text>
              <View style={styles.webInputWrapper}>
                <Ionicons name="person-outline" size={20} color="#94A3B8" style={{ marginRight: 12 }} />
                <TextInput 
                  style={styles.webInput}
                  placeholder="Enter admin username"
                  placeholderTextColor="#94A3B8"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  editable={!isLoading}
                />
              </View>
            </View>

            <View style={{ marginBottom: 32 }}>
              <Text style={styles.webInputLabel}>Admin Password</Text>
              <View style={styles.webInputWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color="#94A3B8" style={{ marginRight: 12 }} />
                <TextInput 
                  style={styles.webInput}
                  placeholder="Enter secure password"
                  placeholderTextColor="#94A3B8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  editable={!isLoading}
                  onSubmitEditing={handleLogin}
                />
              </View>
            </View>

            <TouchableOpacity 
              style={styles.webLoginButton}
              onPress={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.webLoginButtonText}>ACCESS SECURE DASHBOARD</Text>
              )}
            </TouchableOpacity>

            <Text style={{ textAlign: 'center', color: '#64748B', fontSize: 11, marginTop: 24, letterSpacing: 0.5 }}>
              Platform actions are monitored and audited.
            </Text>
          </View>
        </View>
      </ImageBackground>
    );
  }

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
          <TouchableOpacity onPress={() => {
            console.log("🔑 LoginScreen: Sign Up pressed");
            if (onSignup) onSignup();
            else if (onBack) onBack();
          }}>
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
  headerImageContainer: { height: height < 700 ? height * 0.22 : height * 0.3, width: '100%' },
  image: { width: '100%', height: '100%' },
  backButton: { position: 'absolute', top: height < 700 ? 30 : 50, left: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0, 0, 0, 0.3)', alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, padding: height < 700 ? 20 : 24, marginTop: -30, backgroundColor: '#FFFFFF', borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  welcomeSection: { marginBottom: height < 700 ? 16 : 32 },
  title: { fontSize: height < 700 ? 24 : 28, fontWeight: 'bold', color: '#0F172A', marginBottom: 4 },
  subtitle: { fontSize: height < 700 ? 14 : 16, color: '#64748B' },
  form: { gap: height < 700 ? 12 : 20 },
  inputGroup: { gap: height < 700 ? 4 : 8 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#0F172A', marginLeft: 4 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 16 },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, height: 56, color: '#0F172A', fontSize: 16 },
  forgotPassword: { alignSelf: 'flex-end' },
  forgotPasswordText: { color: '#3B82F6', fontSize: 14, fontWeight: '600' },
  errorText: { color: '#EF4444', fontSize: 14, textAlign: 'center', marginTop: 4 },
  loginButton: { height: 56, backgroundColor: '#EF4444', borderRadius: 16, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#EF4444', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, marginTop: 12 },
  registerText: {
    color: '#0F172A',
    fontWeight: 'bold',
  },

  // Web Admin Styles
  webBg: {
    flex: 1,
    width: '100%',
    height: '100vh',
    justifyContent: 'center',
    alignItems: 'center',
  },
  webOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  webLoginBox: {
    width: 440,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    padding: 48,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
    elevation: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  webTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 16,
    letterSpacing: -0.5,
  },
  webSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  webInputLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  webInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9', // slightly solid to match premium feel
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  webInput: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '500',
    height: '100%',
    outlineStyle: 'none', // Web specific hack
  },
  webLoginButton: {
    backgroundColor: '#0F172A',
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    marginTop: 8,
    cursor: 'pointer',
  },
  webLoginButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  devToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: height < 700 ? 8 : 12, backgroundColor: '#F1F5F9', borderRadius: 12, marginTop: height < 700 ? 4 : 8, borderWidth: 1, borderColor: '#E2E8F0' },
  devToggleActive: { backgroundColor: '#3B82F6', borderColor: '#2563EB' },
  devToggleText: { fontSize: 10, fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase' },
  devToggleTextActive: { color: '#FFFFFF' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: height < 700 ? 16 : 32, marginBottom: 20 },
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
