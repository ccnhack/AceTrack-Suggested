import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, Dimensions, ScrollView, Alert, Modal, ActivityIndicator, Platform, ImageBackground, LayoutAnimation } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, shadows, typography, borderRadius, spacing } from '../theme/designSystem';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import config from '../config';
import logger from '../utils/logger';

const { height } = Dimensions.get('window');

import { useAuth } from '../context/AuthContext';
import { usePlayers } from '../context/PlayerContext';
import { useSync } from '../context/SyncContext';

const APP_VERSION = config.APP_VERSION;

const LoginScreen = ({ navigation }) => {
  const { onLogin: onLoginSuccess, onResetPassword, setViewingLanding } = useAuth();
  const { players } = usePlayers();
  const { loadData: onRefreshData, onToggleCloud, isUsingCloud } = useSync();

  const onSignup = () => navigation.navigate('Signup');
  const onBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      setViewingLanding(true);
    }
  };
  useEffect(() => {
    // DIAGNOSTIC LOGGING
    if (__DEV__) {
      console.log(`📱 [DIAGNOSTIC] LoginScreen Dimensions: ${JSON.stringify({
        window: { width: Dimensions.get('window').width, height: Dimensions.get('window').height },
        screen: { width: Dimensions.get('screen').width, height: Dimensions.get('screen').height },
        platform: Platform.OS,
        isShortScreen: Dimensions.get('window').height < 750
      })}`);
    }
  }, []);

  const isShortScreen = height < 700;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Forgot Password States
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1: ID, 2: Done
  const [forgotUser, setForgotUser] = useState('');
  const [forgotFoundUser, setForgotFoundUser] = useState(null);
  const [forgotPhone, setForgotPhone] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isForgotLoading, setIsForgotLoading] = useState(false);


  // 🔐 MFA States (v2.6.170)
  const [showMFA, setShowMFA] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [mfaPin, setMfaPin] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

  const handleLogin = async (e) => {
    if (showForgot || isLoading || isForgotLoading) return;
    if (e && e.preventDefault) e.preventDefault();
    
    logger.logAction('LOGIN_CLICK', { username });
    setError('');
    setIsLoading(true);

    try {
      if (Platform.OS !== 'web' && Haptics.impactAsync) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // 🌐 [SERVER AUTH FLOW] (v2.6.259)
      try {
        // 1. Admin Login
        const adminUrl = `${config.API_BASE_URL}${config.getEndpoint('ADMIN_LOGIN')}`;
        const adminRes = await fetch(adminUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-ace-api-key': config.PUBLIC_APP_ID,
          },
          credentials: 'include',
          body: JSON.stringify({ identifier: username, password }),
        });
        const adminData = await adminRes.json();

        if (username.toLowerCase().trim() === 'admin') {
          if (adminRes.ok && adminData.success && adminData.requiresMFA) {
            setMfaToken(adminData.mfaToken);
            setMfaPin('');
            setMfaError('');
            setShowMFA(true);
            return;
          } else {
            setError(adminData.error || 'Invalid administrator credentials.');
            setIsLoading(false);
            return;
          }
        }

        // 2. Support Login
        const supportUrl = `${config.API_BASE_URL}${config.getEndpoint('SUPPORT_LOGIN')}`;
        const supportRes = await fetch(supportUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-ace-api-key': config.PUBLIC_APP_ID,
          },
          credentials: 'include',
          body: JSON.stringify({ identifier: username, password }),
        });
        const supportData = await supportRes.json();

        if (supportRes.ok && supportData.success && supportData.user) {
          if (Platform.OS !== 'web') {
            setError('Kindly login using the Web Support Portal if the credentials are correct.');
            setIsLoading(false);
            return;
          }
          onLoginSuccess('support', { ...supportData.user, token: supportData.token });
          return;
        } else if (!supportRes.ok && username.toLowerCase().trim() !== 'admin') {
          // 🛡️ [SECURITY HARDENING] (v2.6.238)
          if (supportRes.status === 403) {
            setError(supportData.error || supportData.message || 'Login denied by server.');
            setIsLoading(false);
            return;
          }
        }
      } catch (serverErr) {
        console.warn('Network issue, falling back to local auth if available:', serverErr.message);
      }

      // 🛡️ [LOCAL FALLBACK] (v2.6.170)
      if (username.toLowerCase().trim() === 'admin') {
        setError('Network error. Administrator login requires cloud connectivity for MFA.');
        return;
      }

      let foundUser = players.find(p => {
        const search = username.toLowerCase().trim();
        return (p.email || '').toLowerCase() === search || 
               String(p.id || '').toLowerCase() === search || 
               (p.username || '').toLowerCase() === search;
      });

      if (!foundUser && onRefreshData) {
        setIsSyncing(true);
        const cloudResult = await onRefreshData();
        setIsSyncing(false);
        
        if (cloudResult && cloudResult.players) {
          const search = username.toLowerCase().trim();
          foundUser = cloudResult.players.find(p => 
            (p.email || '').toLowerCase() === search || 
            String(p.id || '').toLowerCase() === search
          );
        }
      }

      if (foundUser) {
        // 🛡️ [WEB ACCESS GUARD] (v2.6.314) Prevent regular mobile users from logging into the web portal
        if (Platform.OS === 'web' && foundUser.role !== 'admin' && foundUser.role !== 'support') {
          setError('User not found.');
          return;
        }

        if (foundUser.role === 'support' && (foundUser.supportStatus === 'terminated' || foundUser.supportStatus === 'inactive' || foundUser.supportStatus === 'suspended')) {
          setError('Access Suspended: Profile deactivated.');
          return;
        }
        if ((foundUser.password || 'password') === password) {
          if (foundUser.role === 'support' && Platform.OS !== 'web') {
            setError('Kindly login using the Web Support Portal if the credentials are correct.');
            return;
          }
          onLoginSuccess(foundUser.role || 'user', foundUser);
        } else {
          setError('Invalid password.');
        }
      } else {
        setError('User not found.');
      }
    } catch (err) {
      console.error("Login fatal error:", err);
      setError("An unexpected error occurred.");
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  };

  const handleStartForgot = () => {
    setForgotStep(1);
    setForgotUser('');
    setForgotFoundUser(null);
    setForgotPhone('');
    setForgotOtp('');
    setForgotNewPassword('');
    setForgotConfirmPassword('');
    setShowForgot(true);
  };

  const handleIdentify = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    const normalize = (s) => String(s || '').trim().toLowerCase();
    const nUser = normalize(forgotUser);

    if (nUser === 'admin') {
      Alert.alert(
        "Security Restriction", 
        "Password reset is not permitted for the system administrator account via this portal. Contact technical support for master account recovery.",
        [{ text: "OK" }]
      );
      return;
    }

    if (!nUser) {
      Alert.alert("Error", "Please enter your username or email address.");
      return;
    }

    if (Platform.OS === 'web') {
      const isTerminated = players?.find(p => 
        (String(p.email || '').toLowerCase() === nUser || String(p.username || '').toLowerCase() === nUser) && 
        p.supportStatus === 'terminated'
      );
      
      if (isTerminated) {
        Alert.alert(
          "Account Suspended",
          "Your employment profile has been deactivated. Password reset is unavailable.",
          [{ text: "OK" }]
        );
        return;
      }

      setIsForgotLoading(true);
      try {
        const res = await fetch(`${config.API_BASE_URL}${config.getEndpoint('SUPPORT_RESET')}`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-ace-api-key': config.PUBLIC_APP_ID
          },
          credentials: 'include',
          body: JSON.stringify({ identifier: nUser })
        });
        
        const data = await res.json();
        if (res.ok) {
          setForgotStep(2);
          if (Platform.OS === 'web') {
            window.alert("Success: Password recovery link has been sent to your registered email.");
          } else {
            Alert.alert("Success", "Mail Sent! Check your registered email inbox.");
          }
        } else {
          Alert.alert("Error", data.message || data.error || "Failed to process request.");
        }
      } catch (e) {
        Alert.alert("Network Error", "Please check your connection and try again.");
      } finally {
        setIsForgotLoading(false);
      }
    } else {
      let foundUser = players.find(p => 
        (p.email || '').toLowerCase() === nUser || 
        String(p.id || '').toLowerCase() === nUser || 
        (p.username || '').toLowerCase() === nUser
      );
      
      if (!foundUser) {
        Alert.alert("User Not Found", "No account found with that username or email.");
        return;
      }
      
      if (foundUser.role === 'support' && (foundUser.supportStatus === 'terminated' || foundUser.supportStatus === 'inactive' || foundUser.supportStatus === 'suspended')) {
        Alert.alert("Account Suspended", "Your profile has been deactivated.");
        return;
      }

      setForgotFoundUser(foundUser);
      setForgotStep('mobile_phone');
    }
  };

  const handleSendMobileOtp = async () => {
    const enteredPhone = forgotPhone.trim();
    if (!enteredPhone) {
      Alert.alert("Error", "Please enter your mobile number.");
      return;
    }
    if (enteredPhone !== (forgotFoundUser?.phone || '')) {
      Alert.alert("Error", "Mobile number does not match our records.");
      return;
    }

    setIsForgotLoading(true);
    try {
      await fetch(`${config.API_BASE_URL}${config.getEndpoint('OTP_SEND')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ace-api-key': config.PUBLIC_APP_ID },
        credentials: 'include',
        body: JSON.stringify({ target: enteredPhone, type: 'phone' })
      });
      await fetch(`${config.API_BASE_URL}${config.getEndpoint('OTP_SEND')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ace-api-key': config.PUBLIC_APP_ID },
        credentials: 'include',
        body: JSON.stringify({ target: forgotFoundUser.email, type: 'email' })
      });
      
      setForgotStep('mobile_otp');
    } catch (e) {
      Alert.alert("Error", "Failed to send OTP.");
    } finally {
      setIsForgotLoading(false);
    }
  };

  const handleVerifyMobileOtp = async () => {
    if (forgotOtp.length !== 6) {
      Alert.alert("Error", "Enter 6-digit OTP");
      return;
    }
    setIsForgotLoading(true);
    try {
      const res = await fetch(`${config.API_BASE_URL}${config.getEndpoint('OTP_VERIFY')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ace-api-key': config.PUBLIC_APP_ID },
        credentials: 'include',
        body: JSON.stringify({ code: forgotOtp, target: forgotPhone, type: 'phone' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setForgotStep('mobile_reset');
      } else {
        Alert.alert("Error", data.error || "Invalid OTP");
      }
    } catch (e) {
      Alert.alert("Error", "Verification failed");
    } finally {
      setIsForgotLoading(false);
    }
  };

  const handleResetSubmit = () => {
    if (!forgotNewPassword) {
      Alert.alert("Error", "Please enter a new password");
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }
    
    onResetPassword(forgotFoundUser.id, forgotNewPassword, players);
    
    Alert.alert(
      "Security Update",
      "Your password has been successfully reset.\\n\\nAll previous active device sessions have been invalidated. Please log in again using your new credentials.",
      [{ text: "Login", onPress: () => setShowForgot(false) }]
    );
  };

  if (Platform.OS === 'web') {
    const { width } = Dimensions.get('window');
    const isMobileWeb = width < 768;

    return (
      <View style={{ 
        flex: 1, 
        flexDirection: isMobileWeb ? 'column' : 'row', 
        height: '100vh', 
        backgroundColor: '#F8FAFC' 
      }}>
        {/* Left Side: Illustration & Branding (Hidden on Mobile Web) */}
        {!isMobileWeb && (
          <View style={{ flex: 1.2, backgroundColor: '#0F172A', position: 'relative', overflow: 'hidden' }}>
            <ImageBackground 
              source={{ uri: "https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?q=80&w=2000&auto=format&fit=crop" }} 
              style={{ ...StyleSheet.absoluteFillObject, opacity: 0.4 }}
              resizeMode="cover"
            />
            <LinearGradient colors={['transparent', 'rgba(15, 23, 42, 0.9)']} style={StyleSheet.absoluteFillObject} />
            
            <View style={{ flex: 1, justifyContent: 'center', padding: 80, zIndex: 10 }}>
              <Image source={require('../assets/icon.png')} style={{ width: 80, height: 80, borderRadius: 20, marginBottom: 32, shadowColor: '#6366F1', shadowRadius: 20, shadowOpacity: 0.5 }} />
              <Text style={{ fontSize: 48, fontWeight: '900', color: '#FFFFFF', letterSpacing: -1, lineHeight: 56 }}>
                The Ultimate Platform for <Text style={{ color: '#6366F1' }}>Sports Excellence.</Text>
              </Text>
              <Text style={{ fontSize: 18, color: '#94A3B8', marginTop: 24, lineHeight: 28, maxWidth: 500 }}>
                Manage tournaments, track player performance, and handle support requests with our state-of-the-art administrative ecosystem.
              </Text>
              
              <View style={{ flexDirection: 'row', marginTop: 48, gap: 24 }}>
                <View>
                  <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#FFF' }}>v{APP_VERSION}</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', textTransform: 'uppercase', letterSpacing: 1 }}>Stability Build</Text>
                </View>
                <View style={{ width: 1, backgroundColor: '#334155' }} />
                <View>
                  <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#FFF' }}>100%</Text>
                  <Text style={{ fontSize: 12, color: '#64748B', textTransform: 'uppercase', letterSpacing: 1 }}>Cloud Uptime</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Right Side: Login Form */}
        <View style={{ 
          flex: 1, 
          justifyContent: 'center', 
          alignItems: 'center', 
          padding: isMobileWeb ? 20 : 40 
        }}>
          <View style={{ width: '100%', maxWidth: 440 }}>
            {isMobileWeb && (
              <View style={{ alignItems: 'center', marginBottom: 32 }}>
                <Image source={require('../assets/icon.png')} style={{ width: 60, height: 60, borderRadius: 15, marginBottom: 16 }} />
                <Text style={{ fontSize: 24, fontWeight: '900', color: '#0F172A' }}>AceTrack Admin</Text>
              </View>
            )}

            <View style={{ marginBottom: isMobileWeb ? 24 : 40 }}>
              <Text style={{ fontSize: isMobileWeb ? 24 : 32, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 }}>Welcome Back</Text>
              <Text style={{ fontSize: 16, color: '#64748B', marginTop: 8 }}>Sign in to the administrative portal</Text>
            </View>

            {error ? (
              <View style={{ backgroundColor: '#FEE2E2', padding: 16, borderRadius: 12, marginBottom: 24, flexDirection: 'row', alignItems: 'center', borderLeftWidth: 4, borderLeftColor: '#EF4444' }}>
                <Ionicons name="alert-circle" size={20} color="#EF4444" style={{ marginRight: 12 }} />
                <Text style={{ color: '#991B1B', fontSize: 14, fontWeight: '600' }}>{error}</Text>
              </View>
            ) : null}

            <View style={{ marginBottom: 24 }}>
              <Text style={styles.webInputLabel}>Username or Email</Text>
              <View style={styles.webInputWrapper}>
                <MaterialIcons name="person-outline" size={20} color="#6366F1" style={{ marginRight: 12 }} />
                <TextInput 
                  style={styles.webInput}
                  placeholder="Username or Email"
                  placeholderTextColor="#94A3B8"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  editable={!isLoading}
                />
              </View>
            </View>
            
            <View style={{ marginBottom: 24 }}>
              <Text style={styles.webInputLabel}>Password</Text>
              <View style={styles.webInputWrapper}>
                <MaterialIcons name="lock-outline" size={20} color="#6366F1" style={{ marginRight: 12 }} />
                <TextInput 
                  style={styles.webInput}
                  placeholder="Enter your password"
                  placeholderTextColor="#94A3B8"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  editable={!isLoading}
                  onSubmitEditing={handleLogin}
                />
              </View>
              <TouchableOpacity 
                onPress={handleStartForgot}
                style={{ alignSelf: 'flex-end', marginTop: 8 }}
              >
                <Text style={{ fontSize: 12, color: '#6366F1', fontWeight: 'bold' }}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.webLoginButton}
              onPress={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.webLoginButtonText}>SECURE LOGIN</Text>
              )}
            </TouchableOpacity>

            <Text style={{ textAlign: 'center', color: '#94A3B8', fontSize: 12, marginTop: isMobileWeb ? 24 : 40, lineHeight: 18 }}>
              This portal is restricted to authorized personnel. All activity is logged and subject to audit under policy SEC-402.
            </Text>
          </View>
        </View>

        {/* Forgot Password Modal */}
        <Modal visible={showForgot} animationType="fade" transparent={true}>
          <View style={styles.webModalOverlay}>
            <View style={styles.webModalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Security Recovery</Text>
                <TouchableOpacity onPress={() => setShowForgot(false)} style={styles.closeBtn}>
                  <Ionicons name="close" size={24} color="#0F172A" />
                </TouchableOpacity>
              </View>

              {forgotStep === 1 && (
                <View style={styles.stepContainer}>
                  <Text style={styles.stepDesc}>Verify your identity to receive a secure recovery link. This must be your registered professional email.</Text>
                  <TextInput 
                    style={styles.modalInput} 
                    placeholder="Username or Email" 
                    value={forgotUser} 
                    onChangeText={setForgotUser}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity style={styles.modalBtn} onPress={handleIdentify} disabled={isForgotLoading}>
                    {isForgotLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalBtnText}>INITIATE RECOVERY</Text>}
                  </TouchableOpacity>
                </View>
              )}

              {forgotStep === 2 && (
                <View style={styles.stepContainer}>
                  <View style={{ alignItems: 'center', marginBottom: 16 }}>
                    <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="mail-unread-outline" size={40} color="#6366F1" />
                    </View>
                  </View>
                  <Text style={[styles.stepDesc, { textAlign: 'center', fontWeight: 'bold', color: '#0F172A', fontSize: 18 }]}>
                    Transmission Sent
                  </Text>
                  <Text style={[styles.stepDesc, { textAlign: 'center' }]}>
                    A secure recovery link has been dispatched to your verified email. Please check your inbox and follow the instructions.
                  </Text>
                  <View style={{ backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, marginTop: 8 }}>
                    <Text style={[styles.stepDesc, { textAlign: 'center', fontSize: 12, color: '#64748B', fontStyle: 'italic', marginBottom: 0 }]}>
                      Link Validity: 60 Minutes
                    </Text>
                  </View>
                  <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#0F172A' }]} onPress={() => { setShowForgot(false); setForgotStep(1); }}>
                    <Text style={styles.modalBtnText}>BACK TO LOGIN</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Modal>

        {/* 🔐 MFA PIN VERIFICATION MODAL (v2.6.170) */}
        <Modal visible={showMFA} animationType="fade" transparent={true}>
          <View style={styles.webModalOverlay}>
            <View style={styles.webModalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Identity Verification</Text>
                <TouchableOpacity onPress={() => { setShowMFA(false); setMfaPin(''); setMfaError(''); }} style={styles.closeBtn}>
                  <Ionicons name="close" size={24} color="#0F172A" />
                </TouchableOpacity>
              </View>

              <View style={styles.stepContainer}>
                <View style={{ alignItems: 'center', marginBottom: 20 }}>
                  <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
                    <MaterialIcons name="verified-user" size={36} color="#6366F1" />
                  </View>
                  <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 }}>
                    Multi-Factor Authentication required.{'\n'}Enter your 6-digit security PIN.
                  </Text>
                </View>

                {mfaError ? (
                  <View style={{ backgroundColor: '#FEE2E2', padding: 12, borderRadius: 10, marginBottom: 16, flexDirection: 'row', alignItems: 'center', borderLeftWidth: 3, borderLeftColor: '#EF4444' }}>
                    <Ionicons name="alert-circle" size={16} color="#EF4444" style={{ marginRight: 8 }} />
                    <Text style={{ color: '#991B1B', fontSize: 13, fontWeight: '600', flex: 1 }}>{mfaError}</Text>
                  </View>
                ) : null}

                <TextInput
                  style={[styles.modalInput, { textAlign: 'center', fontSize: 28, fontWeight: '900', letterSpacing: 12 }]}
                  placeholder="• • • • • •"
                  placeholderTextColor="#CBD5E1"
                  value={mfaPin}
                  onChangeText={(t) => setMfaPin(t.replace(/[^0-9]/g, '').substring(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  secureTextEntry
                  autoFocus
                  onSubmitEditing={async () => {
                    if (mfaPin.length < 6) { setMfaError('PIN must be 6 digits.'); return; }
                    setMfaLoading(true); setMfaError('');
                    try {
                      const resp = await fetch(`${config.API_BASE_URL}${config.getEndpoint('ADMIN_VERIFY')}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-ace-api-key': config.PUBLIC_APP_ID },
                        credentials: 'include',
                        body: JSON.stringify({ mfaToken, pin: mfaPin }),
                      });
                      const result = await resp.json();
                      if (resp.ok && result.success && result.user) {
                        setShowMFA(false); setMfaPin('');
                        onLoginSuccess('admin', { ...result.user, token: result.token });
                      } else {
                        setMfaError(result.error || 'Verification failed.');
                        setMfaPin('');
                      }
                    } catch (e) { setMfaError('Network error. Please try again.'); }
                    finally { setMfaLoading(false); }
                  }}
                />

                <TouchableOpacity
                  style={[styles.modalBtn, { marginTop: 16, opacity: mfaPin.length < 6 ? 0.5 : 1 }]}
                  disabled={mfaLoading || mfaPin.length < 6}
                  onPress={async () => {
                    if (mfaPin.length < 6) { setMfaError('PIN must be 6 digits.'); return; }
                    setMfaLoading(true); setMfaError('');
                    try {
                      const resp = await fetch(`${config.API_BASE_URL}${config.getEndpoint('ADMIN_VERIFY')}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-ace-api-key': config.PUBLIC_APP_ID },
                        credentials: 'include',
                        body: JSON.stringify({ mfaToken, pin: mfaPin }),
                      });
                      const result = await resp.json();
                      if (resp.ok && result.success && result.user) {
                        setShowMFA(false); setMfaPin('');
                        onLoginSuccess('admin', { ...result.user, token: result.token });
                      } else {
                        setMfaError(result.error || 'Verification failed.');
                        setMfaPin('');
                      }
                    } catch (e) { setMfaError('Network error. Please try again.'); }
                    finally { setMfaLoading(false); }
                  }}
                >
                  {mfaLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalBtnText}>VERIFY PIN</Text>}
                </TouchableOpacity>

                <Text style={{ textAlign: 'center', color: '#94A3B8', fontSize: 11, marginTop: 16 }}>
                  Session expires in 5 minutes. Contact technical support if you have lost your PIN.
                </Text>
              </View>
            </View>
          </View>
        </Modal>
      </View>
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
                testID="auth.login.username.input"
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
                testID="auth.login.password.input"
                style={styles.input}
                placeholder="Enter your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                onSubmitEditing={handleLogin}
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

          <TouchableOpacity 
            testID="auth.login.submit.button"
            onPress={handleLogin} 
            style={styles.loginButton} 
            disabled={isLoading}
          >
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
            if (__DEV__) console.log("🔑 LoginScreen: Sign Up pressed");
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
                <Text style={styles.stepDesc}>Enter the username or email address registered with your account.</Text>
                <TextInput 
                  style={styles.modalInput} 
                  placeholder="Username or Email" 
                  value={forgotUser} 
                  onChangeText={setForgotUser}
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.modalBtn} onPress={handleIdentify} disabled={isForgotLoading}>
                  {isForgotLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalBtnText}>Next</Text>}
                </TouchableOpacity>
              </View>
            )}

            {forgotStep === 2 && (
              <View style={styles.stepContainer}>
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <Ionicons name="mail-unread-outline" size={48} color="#6366F1" />
                </View>
                <Text style={[styles.stepDesc, { textAlign: 'center', fontWeight: 'bold', color: '#0F172A' }]}>
                  Check Your Email
                </Text>
                <Text style={[styles.stepDesc, { textAlign: 'center' }]}>
                  A password recovery link has been sent to your registered email address.
                </Text>
                <Text style={[styles.stepDesc, { textAlign: 'center', fontSize: 12, color: '#64748B', fontStyle: 'italic' }]}>
                  Please click the link in the email to set your new password. It will expire in 60 minutes.
                </Text>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#EF4444' }]} onPress={() => { setShowForgot(false); setForgotStep(1); }}>
                  <Text style={styles.modalBtnText}>Finish</Text>
                </TouchableOpacity>
              </View>
            )}

            {forgotStep === 'mobile_phone' && (
              <View style={styles.stepContainer}>
                <Text style={styles.stepDesc}>Please enter your registered mobile number for verification.</Text>
                <TextInput 
                  style={styles.modalInput} 
                  placeholder="+91 9876543210" 
                  value={forgotPhone} 
                  onChangeText={setForgotPhone}
                  keyboardType="phone-pad"
                />
                <TouchableOpacity style={styles.modalBtn} onPress={handleSendMobileOtp} disabled={isForgotLoading}>
                  {isForgotLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalBtnText}>Send OTP</Text>}
                </TouchableOpacity>
              </View>
            )}

            {forgotStep === 'mobile_otp' && (
              <View style={styles.stepContainer}>
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <Ionicons name="shield-checkmark" size={48} color="#6366F1" />
                </View>
                <Text style={[styles.stepDesc, { textAlign: 'center', fontWeight: 'bold', color: '#0F172A' }]}>
                  Verify OTP
                </Text>
                <Text style={[styles.stepDesc, { textAlign: 'center' }]}>
                  Enter the 6-digit verification code sent to your phone and email.
                </Text>
                <TextInput 
                  style={[styles.modalInput, { textAlign: 'center', fontSize: 24, letterSpacing: 8 }]} 
                  placeholder="000000" 
                  value={forgotOtp} 
                  onChangeText={setForgotOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#EF4444' }]} onPress={handleVerifyMobileOtp} disabled={isForgotLoading}>
                  {isForgotLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalBtnText}>Verify OTP</Text>}
                </TouchableOpacity>
              </View>
            )}

            {forgotStep === 'mobile_reset' && (
              <View style={styles.stepContainer}>
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <Ionicons name="key-outline" size={48} color="#10B981" />
                </View>
                <Text style={[styles.stepDesc, { textAlign: 'center', fontWeight: 'bold', color: '#0F172A' }]}>
                  Create New Password
                </Text>
                <Text style={[styles.stepDesc, { textAlign: 'center', marginBottom: 20 }]}>
                  Please choose a strong password. This will log you out of all other active sessions.
                </Text>
                <TextInput 
                  style={[styles.modalInput, { marginBottom: 12 }]} 
                  placeholder="New Password" 
                  value={forgotNewPassword} 
                  onChangeText={setForgotNewPassword}
                  secureTextEntry
                />
                <TextInput 
                  style={styles.modalInput} 
                  placeholder="Confirm New Password" 
                  value={forgotConfirmPassword} 
                  onChangeText={setForgotConfirmPassword}
                  secureTextEntry
                />
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#10B981', marginTop: 16 }]} onPress={handleResetSubmit}>
                  <Text style={styles.modalBtnText}>Reset Password</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* 🔐 MFA PIN VERIFICATION MODAL (v2.6.170) */}
      <Modal visible={showMFA} animationType="fade" transparent={true}>
        <View style={styles.webModalOverlay}>
          <View style={styles.webModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Identity Verification</Text>
              <TouchableOpacity onPress={() => { setShowMFA(false); setMfaPin(''); setMfaError(''); }} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <View style={styles.stepContainer}>
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
                  <MaterialIcons name="verified-user" size={36} color="#6366F1" />
                </View>
                <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20 }}>
                  Multi-Factor Authentication required.{'\n'}Enter your 6-digit security PIN.
                </Text>
              </View>

              {mfaError ? (
                <View style={{ backgroundColor: '#FEE2E2', padding: 12, borderRadius: 10, marginBottom: 16, flexDirection: 'row', alignItems: 'center', borderLeftWidth: 3, borderLeftColor: '#EF4444' }}>
                  <Ionicons name="alert-circle" size={16} color="#EF4444" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#991B1B', fontSize: 13, fontWeight: '600', flex: 1 }}>{mfaError}</Text>
                </View>
              ) : null}

              <TextInput
                style={[styles.modalInput, { textAlign: 'center', fontSize: 28, fontWeight: '900', letterSpacing: 12 }]}
                placeholder="• • • • • •"
                placeholderTextColor="#CBD5E1"
                value={mfaPin}
                onChangeText={(t) => setMfaPin(t.replace(/[^0-9]/g, '').substring(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                secureTextEntry
                autoFocus
                onSubmitEditing={async () => {
                  if (mfaPin.length < 6) { setMfaError('PIN must be 6 digits.'); return; }
                  setMfaLoading(true); setMfaError('');
                  try {
                    const resp = await fetch(`${config.API_BASE_URL}${config.getEndpoint('ADMIN_VERIFY')}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'x-ace-api-key': config.PUBLIC_APP_ID },
                      body: JSON.stringify({ mfaToken, pin: mfaPin }),
                    });
                    const result = await resp.json();
                    if (resp.ok && result.success && result.user) {
                      setShowMFA(false); setMfaPin('');
                      onLoginSuccess('admin', { ...result.user, token: result.token });
                    } else {
                      setMfaError(result.error || 'Verification failed.');
                      setMfaPin('');
                    }
                  } catch (e) { setMfaError('Network error. Please try again.'); }
                  finally { setMfaLoading(false); }
                }}
              />

              <TouchableOpacity
                style={[styles.modalBtn, { marginTop: 16, opacity: mfaPin.length < 6 ? 0.5 : 1 }]}
                disabled={mfaLoading || mfaPin.length < 6}
                onPress={async () => {
                  if (mfaPin.length < 6) { setMfaError('PIN must be 6 digits.'); return; }
                  setMfaLoading(true); setMfaError('');
                  try {
                    const resp = await fetch(`${config.API_BASE_URL}${config.getEndpoint('ADMIN_VERIFY')}`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'x-ace-api-key': config.PUBLIC_APP_ID },
                      body: JSON.stringify({ mfaToken, pin: mfaPin }),
                    });
                    const result = await resp.json();
                    if (resp.ok && result.success && result.user) {
                      setShowMFA(false); setMfaPin('');
                      onLoginSuccess('admin', { ...result.user, token: result.token });
                    } else {
                      setMfaError(result.error || 'Verification failed.');
                      setMfaPin('');
                    }
                  } catch (e) { setMfaError('Network error. Please try again.'); }
                  finally { setMfaLoading(false); }
                }}
              >
                {mfaLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalBtnText}>VERIFY PIN</Text>}
              </TouchableOpacity>

              <Text style={{ textAlign: 'center', color: '#94A3B8', fontSize: 11, marginTop: 16 }}>
                Session expires in 5 minutes. Contact technical support if you have lost your PIN.
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.navy[50] },
  headerImageContainer: { height: height < 700 ? height * 0.22 : height * 0.3, width: '100%' },
  image: { width: '100%', height: '100%' },
  backButton: { position: 'absolute', top: height < 700 ? 30 : 50, left: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0, 0, 0, 0.4)', alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, padding: height < 700 ? 20 : 24, marginTop: -30, backgroundColor: '#FFFFFF', borderTopLeftRadius: 40, borderTopRightRadius: 40, ...shadows.lg },
  welcomeSection: { marginBottom: height < 700 ? 16 : 32 },
  title: { ...typography.display, fontSize: height < 700 ? 24 : 32, color: colors.navy[900], marginBottom: 4 },
  subtitle: { ...typography.body, color: colors.navy[500] },
  form: { gap: height < 700 ? 12 : 20 },
  inputGroup: { gap: height < 700 ? 4 : 8 },
  inputLabel: { ...typography.micro, color: colors.navy[700], marginLeft: 4 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.navy[50], borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.navy[100], paddingHorizontal: 16 },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, height: 56, color: colors.navy[900], fontSize: 16, ...typography.bodyBold },
  forgotPassword: { alignSelf: 'flex-end' },
  forgotPasswordText: { color: colors.primary.base, fontSize: 14, fontWeight: '700' },
  errorText: { color: colors.error, fontSize: 14, textAlign: 'center', marginTop: 4 },
  loginButton: { height: 56, backgroundColor: '#EF4444', borderRadius: borderRadius.lg, alignItems: 'center', justifyContent: 'center', ...shadows.md, marginTop: 12 },
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
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: height < 700 ? 16 : 32, marginBottom: 40 },
  footerText: { color: colors.navy[500], fontSize: 15 },
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
  webModalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(15, 23, 42, 0.7)', 
    justifyContent: 'center', 
    alignItems: 'center',
    // @ts-ignore
    cursor: 'default'
  },
  webModalContent: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 24, 
    padding: 32, 
    width: '90%',
    maxWidth: 440,
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 10 }, 
    shadowOpacity: 0.25, 
    shadowRadius: 20,
    elevation: 10
  }
});

export default LoginScreen;
