import React, { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  SafeAreaView, Dimensions, ActivityIndicator, Alert, Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import logger from '../utils/logger';
import config from '../config';

const { width, height } = Dimensions.get('window');

const SupportSetupScreen = ({ route, navigation }) => {
  const { token } = route.params || {};
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState('loading'); // loading, valid, invalid, success
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      setError('No setup token provided. Please check your invitation link.');
      return;
    }
    verifyToken();
  }, [token]);

  const verifyToken = async () => {
    try {
      const res = await fetch(`${config.API_BASE_URL}/api/support/invite/click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      
      const data = await res.json();
      if (res.ok) {
        setEmail(data.email);
        setStatus('valid');
      } else {
        setError(data.error || 'This setup link is invalid or has expired.');
        setStatus('invalid');
      }
    } catch (err) {
      setError('Failed to connect to the server.');
      setStatus('invalid');
    }
  };

  const handleSetup = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch(`${config.API_BASE_URL}/api/support/invite/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });
      
      const data = await res.json();
      if (res.ok) {
        setStatus('success');
      } else {
        setError(data.error || 'Failed to establish account.');
      }
    } catch (err) {
      setError('A network error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  if (status === 'invalid') {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle" size={48} color="#EF4444" />
          <Text style={styles.errorTitle}>Invalid Link</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.backBtnText}>Return to Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (status === 'success') {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.successCard}>
          <Ionicons name="checkmark-circle" size={56} color="#10B981" />
          <Text style={styles.successTitle}>Account Ready</Text>
          <Text style={styles.successText}>Your employee account has been created securely. You can now log in to the Support Dashboard.</Text>
          <TouchableOpacity style={styles.loginBtn} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginBtnText}>Go to Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#F8FAFC', '#F1F5F9']} style={styles.gradient}>
        <View style={styles.formCard}>
          <View style={styles.header}>
            <View style={styles.iconBg}>
              <Ionicons name="shield-checkmark" size={32} color="#4F46E5" />
            </View>
            <Text style={styles.title}>AceTrack Support</Text>
            <Text style={styles.subtitle}>Secure Employee Onboarding</Text>
          </View>

          <View style={styles.emailBadge}>
            <Text style={styles.emailLabel}>REGISTERED EMAIL</Text>
            <Text style={styles.emailValue}>{email}</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Create Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#94A3B8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="At least 8 characters"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirm Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#94A3B8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Repeat password"
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            </View>
          </View>

          {error ? <Text style={styles.errorMsg}>{error}</Text> : null}

          <TouchableOpacity 
            style={[styles.submitBtn, (isSubmitting || password.length < 8) && styles.disabledBtn]} 
            onPress={handleSetup}
            disabled={isSubmitting || password.length < 8}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitBtnText}>Finalize Account</Text>
            )}
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  gradient: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 20 },
  formCard: {
    backgroundColor: '#FFF',
    width: Platform.OS === 'web' ? 400 : '100%',
    padding: 32,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  header: { alignItems: 'center', marginBottom: 32 },
  iconBg: {
    width: 64, height: 64, backgroundColor: '#EEF2FF',
    borderRadius: 16, justifyContent: 'center', alignItems: 'center',
    marginBottom: 16
  },
  title: { fontSize: 24, fontWeight: '800', color: '#1E293B' },
  subtitle: { fontSize: 14, color: '#64748B', marginTop: 4 },
  emailBadge: {
    backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12,
    borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 24
  },
  emailLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 1 },
  emailValue: { fontSize: 16, fontWeight: '600', color: '#1E293B', marginTop: 4 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 8 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF',
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 12
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#1E293B' },
  errorMsg: { color: '#EF4444', fontSize: 13, marginBottom: 16, textAlign: 'center' },
  submitBtn: {
    backgroundColor: '#4F46E5', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 8
  },
  disabledBtn: { backgroundColor: '#94A3B8' },
  submitBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  errorCard: { alignItems: 'center', padding: 32, backgroundColor: '#FFF', borderRadius: 24, width: 400, shadowOpacity: 0.1 },
  errorTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B', marginTop: 16 },
  errorText: { textAlign: 'center', color: '#64748B', marginTop: 8, lineHeight: 22 },
  backBtn: { marginTop: 24, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: '#F1F5F9', borderRadius: 8 },
  backBtnText: { color: '#475569', fontWeight: '700' },
  successCard: { alignItems: 'center', padding: 40, backgroundColor: '#FFF', borderRadius: 24, width: 400, borderTopWidth: 4, borderTopColor: '#10B981' },
  successTitle: { fontSize: 24, fontWeight: '800', color: '#1E293B', marginTop: 16 },
  successText: { textAlign: 'center', color: '#64748B', marginTop: 12, lineHeight: 24 },
  loginBtn: { marginTop: 32, width: '100%', backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  loginBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' }
});

export default SupportSetupScreen;
