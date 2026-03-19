import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, Dimensions, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import config from '../config';
import logger from '../utils/logger';

const { height } = Dimensions.get('window');

const LoginScreen = ({ onLoginSuccess, onBack, players, onToggleCloud, isUsingCloud }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    logger.logAction('LOGIN_CLICK', { username });
    setError('');
    
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
    if (username === 'academy' && password === 'academy') {
      if (players.find(p => p.id === 'academy')) {
        onLoginSuccess('academy', players.find(p => p.id === 'academy'));
      } else {
        onLoginSuccess('academy', {
          id: 'academy',
          name: 'Ace Tennis Academy',
          email: 'academy@acetrack.com',
          phone: '+91 9999999999',
          username: 'academy',
          password: 'academy',
          gender: 'Other',
          age: 35,
          skillLevel: 'Expert',
          rating: 2000,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          winRate: '0%',
          tournamentsWon: 0,
          noShows: 0,
          cancellations: 0,
          preferredFormat: 'Both',
          city: 'Bangalore',
          avatar: 'https://ui-avatars.com/api/?name=Demo+Academy&background=random',
          credits: 0,
          cancelledTournamentIds: [],
          role: 'academy',
          isEmailVerified: true,
          isPhoneVerified: true
        });
      }
      return;
    }
    
    const foundUser = players.find(p => {
      const pEmail = (p.email || '').toLowerCase();
      const pId = String(p.id || '').toLowerCase();
      const pUsername = (p.username || '').toLowerCase();
      const search = username.toLowerCase().trim();
      
      return pEmail === search || pId === search || pUsername === search;
    });

    if (foundUser) {
      const userPassword = foundUser.password || 'password';
      if (userPassword === password) {
        if (foundUser.role === 'coach' && !foundUser.isApprovedCoach) {
          setError('Your coach application is pending verification. You will be notified once approved.');
          return;
        }
        onLoginSuccess(foundUser.role || 'user', foundUser);
      } else {
        setError('Invalid password. Please try again.');
      }
    } else {
      setError('Invalid credentials. Please check your username or email.');
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

          <TouchableOpacity style={styles.forgotPassword}>
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

          <TouchableOpacity onPress={handleLogin} style={styles.loginButton}>
            <Text style={styles.loginButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.signUpText}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerImageContainer: {
    height: height * 0.3,
    width: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    padding: 24,
    marginTop: -30,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
  welcomeSection: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 56,
    color: '#0F172A',
    fontSize: 16,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
  },
  forgotPasswordText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  loginButton: {
    height: 56,
    backgroundColor: '#EF4444',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    marginTop: 12,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  devToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  devToggleActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#2563EB',
  },
  devToggleText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  devToggleTextActive: {
    color: '#FFFFFF',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
    marginBottom: 20,
  },
  footerText: {
    color: '#64748B',
    fontSize: 15,
  },
  signUpText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: 'bold',
  },
});

export default LoginScreen;
