import React, { useState } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, TextInput, 
  StyleSheet, SafeAreaView, Dimensions, Alert, Image, Modal, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import logger from '../utils/logger';
import { useAuth } from '../context/AuthContext';
import { usePlayers } from '../context/PlayerContext';
import { useSync } from '../context/SyncContext';
import config from '../config';
import { Sport } from '../types';

const { width, height } = Dimensions.get('window');

const SignupScreen = ({ navigation }) => {
  const { onLogin: onSignupSuccess, setViewingLanding, onRegisterUser } = useAuth();
  const { players, setPlayers } = usePlayers();
  const { isUsingCloud, onToggleCloud } = useSync();

  const onBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      setViewingLanding(true);
    }
  };
  
  React.useEffect(() => {
    // DIAGNOSTIC LOGGING
    console.log(`📱 [DIAGNOSTIC] SignupScreen Dimensions: ${JSON.stringify({
      window: { width: Dimensions.get('window').width, height: Dimensions.get('window').height },
      screen: { width: Dimensions.get('screen').width, height: Dimensions.get('screen').height },
      platform: Platform.OS,
      isShortScreen: Dimensions.get('window').height < 750
    })}`);
  }, []);

  const isShortScreen = height < 700;
  const [step, setStep] = useState(1);
  const [accountType, setAccountType] = useState('user');
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    academyName: '',
    username: '',
    email: '',
    password: '',
    phone: '',
    gender: 'Male',
    certifiedSports: [],
    govIdUrl: '',
    certificationUrl: '',
    city: '',
    state: '',
    managedSports: [],
    referralCode: 'ACE-'
  });
  const [error, setError] = useState('');
  const [usernameStatus, setUsernameStatus] = useState('idle');
  const [usernameSuggestions, setUsernameSuggestions] = useState([]);
  const [isSportsDropdownOpen, setIsSportsDropdownOpen] = useState(false);
  const [sportsSearchQuery, setSportsSearchQuery] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [newlyCreatedUser, setNewlyCreatedUser] = useState(null);
  
  // 🔐 VERIFICATION STATE (v2.6.68 Change)
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [verificationModal, setVerificationModal] = useState({ visible: false, type: '', target: '', code: '' });
  const [isVerifying, setIsVerifying] = useState(false);

  const handleReferralCodeChange = (text) => {
    let val = String(text || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
    
    // Always start with ACE-
    if (!val.startsWith('ACE-')) {
      val = 'ACE-' + val.replace(/^ACE-?/, '');
    }

    // Insert second hyphen after 5 characters of the second segment (index 9)
    // Format: ACE-XXXXX-XXXX (total 14)
    if (val.length > 9 && val[9] !== '-') {
      val = val.slice(0, 9) + '-' + val.slice(9);
    }

    // Max length 14
    if (val.length > 14) val = val.slice(0, 14);

    setFormData({ ...formData, referralCode: val });
  };

  const checkUsername = () => {
    if (!formData.username) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    setTimeout(() => {
      const isTaken = players.some(p => p && p.id && String(p.id).toLowerCase() === String(formData.username || '').toLowerCase());
      if (isTaken) {
        setUsernameStatus('taken');
        setUsernameSuggestions([
          `${formData.username}123`,
          `${formData.username}_1`,
          `${formData.username}play`
        ]);
      } else {
        setUsernameStatus('available');
      }
    }, 400);
  };

  const handlePickDocument = async (field) => {
    logger.logAction('PICK_DOCUMENT', { field });
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
      });
      
      if (!result.canceled) {
        setFormData({ ...formData, [field]: result.assets[0].uri });
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const handleOTPRequest = async (type) => {
    const target = type === 'email' ? formData.email : formData.phone;
    if (!target) {
      setError(`Please enter your ${type} first`);
      return;
    }
    
    setIsVerifying(true);
    try {
      // Base URL from your config (assuming you have one, or just hardcode for simulation)
      const response = await fetch(`${config.API_BASE_URL}${config.getEndpoint('OTP_SEND')}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-ace-api-key': config.PUBLIC_APP_ID
        },
        body: JSON.stringify({ target, type })
      });
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success) {
        setVerificationModal({ visible: true, type, target, code: '' });
      } else {
        setError(data.error || 'Failed to send verification code');
      }
    } catch (err) {
      console.error('OTP Send Error:', err.message);
      // Fallback for simulation if network fails or server not yet updated
      setVerificationModal({ visible: true, type, target, code: '' });
      Alert.alert('Testing Mode', 'Server connection issues. Proceeding with hardcoded OTP (123456) for now.', [{ text: 'OK' }]);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleOTPVerify = async () => {
    if (verificationModal.code.length !== 6) return;
    
    setIsVerifying(true);
    try {
      const response = await fetch(`${config.API_BASE_URL}${config.getEndpoint('OTP_VERIFY')}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-ace-api-key': config.PUBLIC_APP_ID
        },
        body: JSON.stringify({ 
          target: verificationModal.target, 
          type: verificationModal.type, 
          code: verificationModal.code 
        })
      });
      
      if (!response.ok) {
        // Hardcoded fallback if server is down/deploying
        if (verificationModal.code === '123456') {
          if (verificationModal.type === 'email') setIsEmailVerified(true);
          else setIsPhoneVerified(true);
          setVerificationModal({ ...verificationModal, visible: false });
          Alert.alert('Verified (Offline)', `Success!`);
          return;
        }
        throw new Error(`Server returned ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success) {
        if (verificationModal.type === 'email') setIsEmailVerified(true);
        else setIsPhoneVerified(true);
        setVerificationModal({ ...verificationModal, visible: false });
        Alert.alert('Verified', `${verificationModal.type === 'email' ? 'Email' : 'Phone'} verified successfully!`);
      } else {
        Alert.alert('Error', 'Invalid verification code. Use 123456 for testing.');
      }
    } catch (err) {
      console.error('OTP Verify Error:', err.message);
      // Support testing mode fallback
      if (verificationModal.code === '123456') {
        if (verificationModal.type === 'email') setIsEmailVerified(true);
        else setIsPhoneVerified(true);
        setVerificationModal({ ...verificationModal, visible: false });
        Alert.alert('Verified (Simulation)', 'Success!');
      } else {
        Alert.alert('Error', 'Verification failed. Please try again.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSignup = () => {
    logger.logAction('SIGNUP_CLICK', { accountType });
    setError('');
    
    const isAcademy = accountType === 'academy';
    const isCoach = accountType === 'coach';
    const nameValid = isAcademy ? !!formData.academyName : (!!formData.firstName && !!formData.lastName);

    if (!nameValid || !formData.username || !formData.email || !formData.password || !formData.phone) {
      setError('All basic fields are required.');
      return;
    }

    if (!isEmailVerified || !isPhoneVerified) {
      setError('Please verify your email and phone number before registering.');
      return;
    }

    if (isAcademy && (!formData.city || !formData.state)) {
      setError('City and State are required for Academy registration.');
      return;
    }

    if (isCoach && (formData.certifiedSports.length === 0)) {
      setError('At least one sport is required for coaches.');
      return;
    }

    if (players.find(p => p && p.id && String(p.id).toLowerCase() === String(formData.username || '').toLowerCase())) {
      setError('Username already taken.');
      return;
    }

    if (players.find(p => p && p.email && String(p.email).toLowerCase() === String(formData.email || '').toLowerCase())) {
      setError('Email address already registered.');
      return;
    }

    if (players.find(p => p.phone === formData.phone)) {
      setError('Mobile number already registered.');
      return;
    }

    let referrerId = null;
    if (formData.referralCode && formData.referralCode.trim() !== '' && formData.referralCode !== 'ACE-') {
      const referrer = players.find(p => p && p.referralCode && String(p.referralCode).toUpperCase() === String(formData.referralCode || '').trim().toUpperCase());
      if (!referrer) {
        setError('Invalid referral code. Please check or leave blank.');
        return;
      }
      referrerId = referrer.id;
    }

    const newPlayer = {
      id: formData.username,
      name: isAcademy ? formData.academyName : `${formData.firstName} ${formData.lastName}`,
      email: formData.email,
      phone: formData.phone,
      gender: (!isAcademy && !isCoach) ? formData.gender : undefined,
      password: formData.password,
      skillLevel: 'Beginner',
      rating: isAcademy || isCoach ? 2000 : 1000,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      noShows: 0,
      cancellations: 0,
      preferredFormat: 'Singles',
      city: isAcademy ? formData.city : 'Bangalore',
      state: isAcademy ? formData.state : 'Karnataka',
      avatar: '',
      credits: 0,
      cancelledTournamentIds: [],
      rescheduleCounts: {},
      role: accountType,
      isEmailVerified: isEmailVerified,
      isPhoneVerified: isPhoneVerified,
      referredBy: referrerId,
      referralCode: `ACE-${formData.username.substring(0, 5).toUpperCase()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`,
      walletHistory: referrerId ? [
        {
          id: `ref-pending-${formData.username}`,
          amount: 100,
          type: 'credit',
          description: 'Referral Reward (Pending - Play 1 Tournament)',
          date: new Date().toISOString(),
          status: 'Pending'
        }
      ] : [],
      ...(isCoach && {
        isApprovedCoach: false,
        certifiedSports: formData.certifiedSports,
        govIdUrl: formData.govIdUrl,
        certificationUrl: formData.certificationUrl
      }),
      ...(isAcademy && {
        managedSports: formData.managedSports
      })
    };

    // If there's a referrer, also add a pending entry to their history
    if (referrerId && setPlayers) {
      setPlayers(prev => prev.map(p => {
        if (p.id === referrerId) {
          const pendingEntry = {
            id: `bonus-pending-${formData.username}`,
            amount: 100,
            type: 'credit',
            description: `Referral Bonus: ${formData.username} (Pending Participation)`,
            date: new Date().toISOString(),
            status: 'Pending'
          };
          return {
            ...p,
            walletHistory: [pendingEntry, ...(p.walletHistory || [])]
          };
        }
        return p;
      }));
    }

    setIsRegistering(true);
    
    // 🛡️ PERSISTENCE GUARD (v2.6.117): Ensure user is actually saved to cloud/local
    const success = onRegisterUser(newPlayer, players);
    
    if (success) {
      setNewlyCreatedUser(newPlayer);
      setShowSuccessModal(true);
    } else {
      setError('Failed to record account locally. Please try again.');
    }
    setIsRegistering(false);
  };

  if (step === 1) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#475569" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Account</Text>
        </View>

        <View style={styles.stepOneContent}>
          <Text style={styles.stepOneSubtitle}>I want to join as</Text>
          
          <TouchableOpacity 
            onPress={() => { setAccountType('user'); setStep(2); }}
            style={styles.card}
          >
            <View style={[styles.cardIcon, { backgroundColor: '#EF4444' }]}>
              <Ionicons name="person" size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.cardTitle}>Individual</Text>
            <Text style={styles.cardDescription}>Discover arenas, track rankings, and join elite tournaments.</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => { setAccountType('academy'); setStep(2); }}
            style={[styles.card, { backgroundColor: '#0F172A' }]}
          >
            <View style={styles.cardIconLight}>
              <Ionicons name="business" size={20} color="#EF4444" />
            </View>
            <Text style={[styles.cardTitle, { color: '#FFFFFF' }]}>Academy</Text>
            <Text style={[styles.cardDescription, { color: '#94A3B8' }]}>Host your own events, manage participants, and lead the circuit.</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => { setAccountType('coach'); setStep(2); }}
            style={[styles.card, { backgroundColor: '#EFF6FF', borderColor: '#DBEAFE' }]}
          >
            <View style={[styles.cardIcon, { backgroundColor: '#3B82F6' }]}>
              <Ionicons name="book" size={20} color="#FFFFFF" />
            </View>
            <Text style={[styles.cardTitle, { color: '#1E3A8A' }]}>Coach</Text>
            <Text style={[styles.cardDescription, { color: '#3B82F6' }]}>Evaluate players, manage matches, and track performance.</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setStep(1)} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#475569" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {accountType === 'academy' ? 'Academy Sign Up' : accountType === 'coach' ? 'Coach Sign Up' : 'Player Details'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.formContent} showsVerticalScrollIndicator={false}>
        {(accountType === 'user' || accountType === 'coach') ? (
          <>
            <View style={styles.row}>
              <View style={styles.inputGroupCol}>
                <Text style={styles.inputLabel}>First Name</Text>
                <TextInput 
                  style={styles.input}
                  placeholder="John"
                  value={formData.firstName}
                  onChangeText={(val) => setFormData({...formData, firstName: val})}
                />
              </View>
              <View style={styles.inputGroupCol}>
                <Text style={styles.inputLabel}>Last Name</Text>
                <TextInput 
                  style={styles.input}
                  placeholder="Doe"
                  value={formData.lastName}
                  onChangeText={(val) => setFormData({...formData, lastName: val})}
                />
              </View>
            </View>
            {accountType === 'user' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Gender</Text>
                <View style={styles.genderContainer}>
                  {['Male', 'Female'].map(g => (
                    <TouchableOpacity 
                      key={g}
                      style={[styles.genderButton, formData.gender === g && styles.genderButtonActive]}
                      onPress={() => setFormData({...formData, gender: g})}
                    >
                      <Text style={[styles.genderButtonText, formData.gender === g && styles.genderButtonTextActive]}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </>
        ) : (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Academy Name</Text>
              <TextInput 
                style={styles.input}
                placeholder="Elite Sports Center"
                value={formData.academyName}
                onChangeText={(val) => setFormData({...formData, academyName: val})}
              />
            </View>
            <View style={styles.row}>
              <View style={styles.inputGroupCol}>
                <Text style={styles.inputLabel}>City</Text>
                <TextInput 
                  style={styles.input}
                  placeholder="Bangalore"
                  value={formData.city}
                  onChangeText={(val) => setFormData({...formData, city: val})}
                />
              </View>
              <View style={styles.inputGroupCol}>
                <Text style={styles.inputLabel}>State</Text>
                <TextInput 
                  style={styles.input}
                  placeholder="Karnataka"
                  value={formData.state}
                  onChangeText={(val) => setFormData({...formData, state: val})}
                />
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Managed Sports</Text>
              <TouchableOpacity 
                onPress={() => {
                  setIsSportsDropdownOpen(!isSportsDropdownOpen);
                  if (isSportsDropdownOpen) setSportsSearchQuery('');
                }}
                style={styles.dropdownButton}
              >
                <Text style={styles.dropdownButtonText}>
                  {formData.managedSports.length > 0 
                    ? formData.managedSports.join(', ') 
                    : 'Select Sports (Multi)'}
                </Text>
                <Ionicons name={isSportsDropdownOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#94A3B8" />
              </TouchableOpacity>
              
              {isSportsDropdownOpen && (
                <View style={styles.dropdownList}>
                  <TextInput
                    style={[styles.input, { borderWidth: 0, borderBottomWidth: 1, borderRadius: 0, paddingVertical: 10 }]}
                    placeholder="Search sports..."
                    value={sportsSearchQuery}
                    onChangeText={setSportsSearchQuery}
                    autoCapitalize="none"
                  />
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled={true}>
                    {Object.values(Sport)
                      .filter(s => s.toLowerCase().includes(sportsSearchQuery.toLowerCase()))
                      .map(s => {
                      const isSelected = formData.managedSports.includes(s);
                      return (
                        <TouchableOpacity
                          key={s}
                          onPress={() => {
                            const newSports = isSelected
                              ? formData.managedSports.filter(sport => sport !== s)
                              : [...formData.managedSports, s];
                            setFormData({ ...formData, managedSports: newSports });
                          }}
                          style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                        >
                          <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextActive]}>{s}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>
          </>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Username</Text>
          <View>
            <TextInput 
              style={[
                styles.input, 
                usernameStatus === 'taken' && styles.inputError,
                usernameStatus === 'available' && styles.inputSuccess
              ]}
              placeholder="johndoe123"
              value={formData.username}
              onChangeText={(val) => setFormData({...formData, username: val})}
              onBlur={checkUsername}
              autoCapitalize="none"
            />
            {usernameStatus === 'checking' && <Text style={styles.statusText}>Checking...</Text>}
            {usernameStatus === 'available' && <Text style={[styles.statusText, {color: '#22C55E'}]}>Available</Text>}
            {usernameStatus === 'taken' && <Text style={[styles.statusText, {color: '#EF4444'}]}>Taken</Text>}
          </View>
          {usernameStatus === 'taken' && usernameSuggestions.length > 0 && (
            <View style={styles.suggestions}>
              <Text style={styles.suggestionLabel}>Suggestions: </Text>
              {usernameSuggestions.map(s => (
                <TouchableOpacity key={s} onPress={() => { setFormData({...formData, username: s}); setUsernameStatus('available'); }}>
                  <Text style={styles.suggestionItem}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Email Address</Text>
          <View style={styles.inputWithAction}>
            <TextInput 
              style={[styles.input, { flex: 1 }, isEmailVerified && styles.inputSuccess]}
              placeholder="john@example.com"
              value={formData.email}
              onChangeText={(val) => { setFormData({...formData, email: val}); setIsEmailVerified(false); }}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!isEmailVerified}
            />
            {!isEmailVerified ? (
              <TouchableOpacity 
                style={styles.fieldActionBtn} 
                onPress={() => handleOTPRequest('email')}
                disabled={isVerifying}
              >
                <Text style={styles.fieldActionText}>Validate</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
              </View>
            )}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Phone Number</Text>
          <View style={styles.inputWithAction}>
            <TextInput 
              style={[styles.input, { flex: 1 }, isPhoneVerified && styles.inputSuccess]}
              placeholder="+91 9876543210"
              value={formData.phone}
              onChangeText={(val) => { setFormData({...formData, phone: val}); setIsPhoneVerified(false); }}
              keyboardType="phone-pad"
              editable={!isPhoneVerified}
            />
            {!isPhoneVerified ? (
              <TouchableOpacity 
                style={styles.fieldActionBtn} 
                onPress={() => handleOTPRequest('phone')}
                disabled={isVerifying}
              >
                <Text style={styles.fieldActionText}>Validate</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
              </View>
            )}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Password</Text>
          <TextInput 
            style={styles.input}
            placeholder="••••••••"
            value={formData.password}
            onChangeText={(val) => setFormData({...formData, password: val})}
            secureTextEntry
          />
        </View>

        {accountType === 'user' && (
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Referral Code (Optional)</Text>
            <TextInput 
              style={styles.input}
              placeholder="ACE-XXXXX-XXXX"
              value={formData.referralCode}
              onChangeText={handleReferralCodeChange}
              autoCapitalize="characters"
              maxLength={14}
            />
          </View>
        )}

        {accountType === 'coach' && (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Certified Sports</Text>
              <TouchableOpacity 
                onPress={() => {
                  setIsSportsDropdownOpen(!isSportsDropdownOpen);
                  if (isSportsDropdownOpen) setSportsSearchQuery('');
                }}
                style={styles.dropdownButton}
              >
                <Text style={styles.dropdownButtonText}>
                  {formData.certifiedSports.length > 0 
                    ? formData.certifiedSports.join(', ') 
                    : 'Select Sports'}
                </Text>
                <Ionicons name={isSportsDropdownOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#94A3B8" />
              </TouchableOpacity>
              
              {isSportsDropdownOpen && (
                <View style={styles.dropdownList}>
                  <TextInput
                    style={[styles.input, { borderWidth: 0, borderBottomWidth: 1, borderRadius: 0, paddingVertical: 10 }]}
                    placeholder="Search sports..."
                    value={sportsSearchQuery}
                    onChangeText={setSportsSearchQuery}
                    autoCapitalize="none"
                  />
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled={true}>
                    {Object.values(Sport)
                      .filter(s => s.toLowerCase().includes(sportsSearchQuery.toLowerCase()))
                      .map(s => {
                      const isSelected = formData.certifiedSports.includes(s);
                      return (
                        <TouchableOpacity
                          key={s}
                          onPress={() => {
                            const newSports = isSelected
                              ? formData.certifiedSports.filter(sport => sport !== s)
                              : [...formData.certifiedSports, s];
                            setFormData({ ...formData, certifiedSports: newSports });
                          }}
                          style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                        >
                          <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextActive]}>{s}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Govt ID (PDF/Image)</Text>
              <TouchableOpacity 
                onPress={() => handlePickDocument('govIdUrl')}
                style={[styles.dropdownButton, formData.govIdUrl ? {borderColor: '#10B981'} : {}]}
              >
                <Text style={[styles.dropdownButtonText, formData.govIdUrl ? {color: '#10B981'} : {}]}>
                  {formData.govIdUrl ? 'File Selected ✓' : 'Upload Gov ID'}
                </Text>
                <Ionicons name="cloud-upload-outline" size={16} color={formData.govIdUrl ? '#10B981' : "#94A3B8"} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Certification (PDF/Image)</Text>
              <TouchableOpacity 
                onPress={() => handlePickDocument('certificationUrl')}
                style={[styles.dropdownButton, formData.certificationUrl ? {borderColor: '#10B981'} : {}]}
              >
                <Text style={[styles.dropdownButtonText, formData.certificationUrl ? {color: '#10B981'} : {}]}>
                  {formData.certificationUrl ? 'File Selected ✓' : 'Upload Certificate'}
                </Text>
                <Ionicons name="cloud-upload-outline" size={16} color={formData.certificationUrl ? '#10B981' : "#94A3B8"} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        


        <TouchableOpacity 
          onPress={handleSignup} 
          style={[styles.registerButton, (isRegistering || usernameStatus === 'checking') && styles.disabledButton]}
          disabled={isRegistering || usernameStatus === 'checking'}
        >
          <Text style={styles.registerButtonText}>{isRegistering ? 'Creating Account...' : 'Register Now'}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Registration Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.successModalContent}>
            <View style={styles.successIconContainer}>
              <Ionicons name="checkmark-circle" size={50} color="#22C55E" />
            </View>
            <Text style={styles.successTitle}>Registration Successful!</Text>
            <Text style={styles.successDescription}>
              Welcome to AceTrack! Your account has been created successfully. You can now login to access all features.
            </Text>
            <TouchableOpacity 
              style={styles.goToLoginButton}
              onPress={() => {
                setShowSuccessModal(false);
                if (newlyCreatedUser) onSignupSuccess(newlyCreatedUser);
              }}
            >
              <Text style={styles.goToLoginText}>Go to Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 🔐 OTP VERIFICATION MODAL (v2.6.68 Change) */}
      <Modal
        visible={verificationModal.visible}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.successModalContent, { paddingBottom: 30 }]}>
            <View style={[styles.successIconContainer, { backgroundColor: '#F0F9FF' }]}>
              <Ionicons name="shield-checkmark" size={40} color="#3B82F6" />
            </View>
            <Text style={styles.successTitle}>Verify {verificationModal.type === 'email' ? 'Email' : 'Phone'}</Text>
            <Text style={styles.successDescription}>
              Enter the 6-digit code sent to{"\n"}
              <Text style={{ fontWeight: 'bold', color: '#0F172A' }}>{verificationModal.target}</Text>
            </Text>
            
            <TextInput
              style={styles.otpInput}
              placeholder="000000"
              value={verificationModal.code}
              onChangeText={(val) => setVerificationModal({ ...verificationModal, code: val })}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />

            <View style={{ width: '100%', gap: 12 }}>
              <TouchableOpacity 
                style={[styles.goToLoginButton, verificationModal.code.length !== 6 && styles.disabledButton]}
                onPress={handleOTPVerify}
                disabled={verificationModal.code.length !== 6 || isVerifying}
              >
                <Text style={styles.goToLoginText}>{isVerifying ? 'Verifying...' : 'Verify & Continue'}</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={{ paddingVertical: 10, alignItems: 'center' }}
                onPress={() => setVerificationModal({ ...verificationModal, visible: false })}
              >
                <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backButton: {
    padding: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  stepOneContent: {
    paddingHorizontal: 32,
    paddingTop: height < 700 ? 5 : 10,
    paddingBottom: height < 700 ? 20 : 40,
    justifyContent: 'flex-start',
    gap: height < 700 ? 10 : 16,
  },
  stepOneSubtitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: height < 700 ? 4 : 8,
  },
  card: {
    width: '100%',
    padding: height < 700 ? 16 : 24,
    backgroundColor: '#F8FAFC',
    borderWidth: 2,
    borderColor: '#F1F5F9',
    borderRadius: 32,
  },
  cardIcon: {
    width: height < 700 ? 28 : 40,
    height: height < 700 ? 28 : 40,
    borderRadius: height < 700 ? 8 : 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: height < 700 ? 8 : 12,
  },
  cardIconLight: {
    width: height < 700 ? 28 : 40,
    height: height < 700 ? 28 : 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: height < 700 ? 8 : 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: height < 700 ? 8 : 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1E293B',
    textTransform: 'uppercase',
  },
  cardDescription: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  formContent: {
    paddingHorizontal: 32,
    paddingBottom: height < 700 ? 20 : 40,
    gap: height < 700 ? 12 : 20,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
  },
  inputGroup: {
    gap: height < 700 ? 4 : 8,
  },
  inputGroupCol: {
    flex: 1,
    gap: height < 700 ? 4 : 8,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingLeft: 4,
  },
  input: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: height < 700 ? 10 : 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 12,
    fontSize: 14,
    color: '#0F172A',
  },
  inputWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fieldActionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0F172A',
    borderRadius: 12,
  },
  fieldActionText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  verifiedBadge: {
    padding: 8,
  },
  otpInput: {
    width: '100%',
    textAlign: 'center',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 8,
    color: '#3B82F6',
    paddingVertical: 20,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    marginBottom: 24,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  inputSuccess: {
    borderColor: '#22C55E',
  },
  statusText: {
    position: 'absolute',
    right: 16,
    top: 16,
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94A3B8',
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  suggestionLabel: {
    fontSize: 10,
    color: '#64748B',
  },
  suggestionItem: {
    fontSize: 10,
    color: '#3B82F6',
    marginLeft: 8,
    textDecorationLine: 'underline',
  },
  genderContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  genderButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 12,
    alignItems: 'center',
  },
  genderButtonActive: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  genderButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  genderButtonTextActive: {
    color: '#FFFFFF',
  },
  dropdownButton: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownButtonText: {
    fontSize: 14,
    color: '#0F172A',
  },
  dropdownList: {
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  dropdownItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  dropdownItemActive: {
    backgroundColor: '#3B82F6',
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
  },
  dropdownItemTextActive: {
    color: '#FFFFFF',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  registerButton: {
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
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  disabledButton: {
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successModalContent: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  successIconContainer: {
    width: 80,
    height: 80,
    backgroundColor: '#F0FDF4',
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    marginBottom: 12,
    textAlign: 'center',
  },
  successDescription: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  goToLoginButton: {
    width: '100%',
    backgroundColor: '#EF4444',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  goToLoginText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
    textTransform: 'uppercase',
  },
  devToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    marginTop: 8,
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
  cloudBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    marginBottom: 16,
    marginTop: 8,
  },
  cloudBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#059669',
    textTransform: 'uppercase',
  },
});

export default SignupScreen;
