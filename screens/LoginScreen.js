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
  const [forgotStep, setForgotStep] = useState(1); // 1: ID, 2: Done
  const [forgotUser, setForgotUser] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isForgotLoading, setIsForgotLoading] = useState(false);


  // 🔐 MFA States (v2.6.170)
  const [showMFA, setShowMFA] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [mfaPin, setMfaPin] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

  const handleLogin = async (e) => {
    // 🛡️ UI GUARD: Block login if recovery modal is open or already loading
    if (showForgot || isLoading || isForgotLoading) return;
    
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();

    logger.logAction('LOGIN_CLICK', { username });
    setError('');
    setIsLoading(true);

    try {
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // Web Login: Server-side authentication (v2.6.170)
      // NO credentials are stored in client code — all validation happens on the server
        try {
          const loginUrl = `${config.API_BASE_URL}/api/v1/admin/login`;
          // 🛡️ DIAGNOSTIC ALERT
          if (Platform.OS === 'web') console.log(`🚀 [DEBUG] Calling Admin Login: ${loginUrl}`);

          // Step 1: Try admin login first
          const adminResponse = await fetch(loginUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-ace-api-key': config.ACE_API_KEY,
            },
            body: JSON.stringify({ identifier: username, password }),
          }).catch(err => {
             if (Platform.OS === 'web') alert(`❌ Browser Blocked Request: ${err.message}\nURL: ${loginUrl}`);
             throw err;
          });
          const adminResult = await adminResponse.json();

          if (adminResponse.ok && adminResult.success && adminResult.requiresMFA) {
            // Admin credentials valid — show MFA PIN modal
            setMfaToken(adminResult.mfaToken);
            setMfaPin('');
            setMfaError('');
            setShowMFA(true);
            setIsLoading(false);
            setIsSyncing(false);
            return;
          }

          // Step 2: Try support login
          const supportResponse = await fetch(`${config.API_BASE_URL}/api/v1/support/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-ace-api-key': config.ACE_API_KEY,
            },
            body: JSON.stringify({ identifier: username, password }),
          });
          const supportResult = await supportResponse.json();

          if (supportResponse.ok && supportResult.success && supportResult.user) {
            onLoginSuccess('support', supportResult.user);
            return;
          }

          // Both failed — show the most relevant error
          setError(supportResult.error || adminResult.error || 'Access Denied. This portal is for AceTrack Administrators and Support Staff only.');
          setIsLoading(false);
          return;
        } catch (networkErr) {
          console.warn('Server login failed:', networkErr.message);
          setError('Unable to reach the server. Please check your connection and try again.');
          setIsLoading(false);
          return;
        } finally {
          setIsSyncing(false);
        }
      }

      // Mobile Admin Login — server-side (v2.6.170)
      // No hardcoded credentials in client code

      // Demo Academy Login - Removed for security (v2.6.171)

      
      let foundUser = players.find(p => {
        const pEmail = (p.email || '').toLowerCase();
        const pId = String(p.id || '').toLowerCase();
        const pUsername = (p.username || '').toLowerCase();
        const pName = (p.name || '').toLowerCase();
        const search = username.toLowerCase().trim();
        return pEmail === search || pId === search || pUsername === search || pName === search;
      });

      // ROBUSTNESS: If user not found locally OR password doesn't match local record, 
      // try to refresh data from cloud to ensure we have the absolute latest master record.
      const localPasswordMatch = foundUser && (foundUser.password || 'password') === password;
      
      if ((!foundUser || !localPasswordMatch) && onRefreshData) {
        console.log(`🔍 User "${username}" not found in ${players.length} local players. IDs: [${players.slice(0, 10).map(p => p.id).join(', ')}]. Attempting cloud refresh...`);
        logger.logAction('LOGIN_CLOUD_REFRESH_START', { username, localPlayerCount: players.length });
        setIsSyncing(true);
        const cloudResult = await onRefreshData();
        setIsSyncing(false);
        
        logger.logAction('LOGIN_CLOUD_REFRESH_RESULT', { 
          hasResult: !!cloudResult, 
          type: typeof cloudResult, 
          hasPlayers: !!(cloudResult && cloudResult.players),
          playerCount: cloudResult?.players?.length || 0,
          version: cloudResult?.version
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
        if (foundUser.role === 'support' && foundUser.supportStatus === 'terminated') {
          setError('Access Suspended: Your employment profile has been deactivated.');
          return;
        }

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

  const handleIdentify = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    const normalize = (s) => String(s || '').trim().toLowerCase();
    const nUser = normalize(forgotUser);

    // 🛡️ ADMIN GUARD (v2.6.131): Strictly block resets for the system administrator
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

    // 🛡️ TERMINATION GUARD
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
      const res = await fetch(`${config.API_BASE_URL}/api/v1/support/password-reset/request`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-ace-api-key': config.ACE_API_KEY
        },
        body: JSON.stringify({ identifier: nUser })
      });
      
      const data = await res.json();
      if (res.ok) {
        setForgotStep(2); // Success step: Show check email instruction
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
  };

  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1, flexDirection: 'row', height: '100vh', backgroundColor: '#F8FAFC' }}>
        {/* Left Side: Illustration & Branding */}
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

        {/* Right Side: Login Form */}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <View style={{ width: '100%', maxWidth: 440 }}>
            <View style={{ marginBottom: 40 }}>
              <Text style={{ fontSize: 32, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 }}>Welcome Back</Text>
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

            <Text style={{ textAlign: 'center', color: '#94A3B8', fontSize: 12, marginTop: 40, lineHeight: 18 }}>
              This portal is restricted to authorized personnel. All activity is logged and subject to audit under policy SEC-402.
            </Text>
          </View>
        </View>

        {/* Forgot Password Modal */}
        {/* 🔐 MFA PIN VERIFICATION MODAL (v2.6.170) */}
        <Modal visible={showMFA} animationType="fade" transparent={true}>
          <View style={styles.webModalOverlay}>
            <View style={[styles.webModalContent, { maxWidth: 400 }]}>
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
                      const resp = await fetch(`${config.API_BASE_URL}/api/v1/admin/verify-pin`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-ace-api-key': config.ACE_API_KEY },
                        body: JSON.stringify({ mfaToken, pin: mfaPin }),
                      });
                      const result = await resp.json();
                      if (resp.ok && result.success && result.user) {
                        setShowMFA(false); setMfaPin('');
                        onLoginSuccess('admin', result.user);
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
                      const resp = await fetch(`${config.API_BASE_URL}/api/v1/admin/verify-pin`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-ace-api-key': config.ACE_API_KEY },
                        body: JSON.stringify({ mfaToken, pin: mfaPin }),
                      });
                      const result = await resp.json();
                      if (resp.ok && result.success && result.user) {
                        setShowMFA(false); setMfaPin('');
                        onLoginSuccess('admin', result.user);
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
                <Text style={styles.stepDesc}>Enter the username or email address registered with your account.</Text>
                <TextInput 
                  style={styles.modalInput} 
                  placeholder="Username or Email" 
                  value={forgotUser} 
                  onChangeText={setForgotUser}
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.modalBtn} onPress={handleIdentify} disabled={isForgotLoading}>
                  {isForgotLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalBtnText}>Send Reset Link</Text>}
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
    width: 440, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 10 }, 
    shadowOpacity: 0.25, 
    shadowRadius: 20,
    elevation: 10
  }
});

export default LoginScreen;
