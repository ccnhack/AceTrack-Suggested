import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, Dimensions, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { height } = Dimensions.get('window');

const LoginScreen = ({ onLoginSuccess, onBack, players }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    setError('');
    
    // Admin Login logic
    if (username === 'admin' && password === 'Password@123') {
      const adminUser = players.find(p => p.id === 'admin_sys');
      if (adminUser) {
        onLoginSuccess('admin', adminUser);
      } else {
        onLoginSuccess('admin', {
          id: 'admin_sys',
          name: 'System Admin',
          email: 'admin@acetrack.com',
          phone: '0000000000',
          skillLevel: 'Advanced',
          rating: 9999,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          noShows: 0,
          cancellations: 0,
          preferredFormat: 'Both',
          city: 'Bangalore',
          avatar: 'https://ui-avatars.com/api/?name=System+Admin&background=random',
          credits: 0,
          cancelledTournamentIds: [],
          role: 'admin'
        });
      }
      return;
    } 

    if (username.toLowerCase() === 'academy' && password === 'password') {
      const academyUser = players.find(p => p.id === 'academy_1');
      if (academyUser) {
        onLoginSuccess('academy', academyUser);
      } else {
        onLoginSuccess('academy', {
          id: 'academy_1',
          name: 'Ace Academy',
          email: 'academy@acetrack.com',
          phone: '1234567890',
          skillLevel: 'Advanced',
          rating: 2000,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
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
    
    const foundUser = players.find(p => 
      p.email.toLowerCase() === username.toLowerCase() ||
      p.id === username
    );

    if (foundUser && (foundUser.password || 'password') === password) {
      if (foundUser.role === 'coach' && !foundUser.isApprovedCoach) {
        setError('Your coach application is pending verification. You will be notified once approved.');
        return;
      }
      onLoginSuccess(foundUser.role || 'user', foundUser);
    } else {
      setError('Invalid credentials. Please check your username and password.');
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
        <Text style={styles.title}>Login</Text>
        <View style={styles.accentBar} />

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username / Email</Text>
            <TextInput 
              style={styles.input}
              placeholder="Enter your username or email" 
              placeholderTextColor="#94A3B8"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput 
              style={styles.input}
              placeholder="••••••••" 
              placeholderTextColor="#94A3B8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity onPress={handleLogin} style={styles.loginButton}>
            <Text style={styles.loginButtonText}>Continue</Text>
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
    minHeight: 200,
  },
  image: {
    width: '100%',
    height: '100%',
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 24,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(10px)',
  },
  content: {
    flex: 1,
    padding: 32,
    paddingBottom: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
  },
  accentBar: {
    width: 40,
    height: 4,
    backgroundColor: '#EF4444',
    borderRadius: 2,
    marginBottom: 32,
  },
  form: {
    gap: 24,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 16,
    fontSize: 16,
    fontWeight: '500',
    color: '#0F172A',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  loginButton: {
    width: '100%',
    paddingVertical: 16,
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
});

export default LoginScreen;
