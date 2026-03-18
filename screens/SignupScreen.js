import React, { useState } from 'react';
import { 
  View, Text, TouchableOpacity, ScrollView, TextInput, 
  StyleSheet, SafeAreaView, Dimensions, Alert, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';

const { width } = Dimensions.get('window');

const SignupScreen = ({ onSignupSuccess, onBack, players, Sport }) => {
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
    certificationUrl: ''
  });
  const [error, setError] = useState('');
  const [usernameStatus, setUsernameStatus] = useState('idle');
  const [usernameSuggestions, setUsernameSuggestions] = useState([]);
  const [isSportsDropdownOpen, setIsSportsDropdownOpen] = useState(false);

  const checkUsername = () => {
    if (!formData.username) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    setTimeout(() => {
      const isTaken = players.some(p => p.id.toLowerCase() === formData.username.toLowerCase());
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

  const handleSignup = () => {
    setError('');
    
    const isAcademy = accountType === 'academy';
    const isCoach = accountType === 'coach';
    const nameValid = isAcademy ? !!formData.academyName : (!!formData.firstName && !!formData.lastName);

    if (!nameValid || !formData.username || !formData.email || !formData.password || !formData.phone) {
      setError('All fields are required.');
      return;
    }

    if (isCoach && (formData.certifiedSports.length === 0)) {
      setError('At least one sport is required for coaches.');
      return;
    }

    if (players.find(p => p.id.toLowerCase() === formData.username.toLowerCase())) {
      setError('Username already taken.');
      return;
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
      city: 'Bangalore',
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(isAcademy ? formData.academyName : `${formData.firstName} ${formData.lastName}`)}&background=random`,
      credits: 0,
      cancelledTournamentIds: [],
      rescheduleCounts: {},
      role: accountType,
      isEmailVerified: false,
      isPhoneVerified: false,
      ...(isCoach && {
        isApprovedCoach: false,
        certifiedSports: formData.certifiedSports,
        govIdUrl: formData.govIdUrl,
        certificationUrl: formData.certificationUrl
      })
    };

    onSignupSuccess(newPlayer);
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
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Academy Name</Text>
            <TextInput 
              style={styles.input}
              placeholder="Elite Sports Center"
              value={formData.academyName}
              onChangeText={(val) => setFormData({...formData, academyName: val})}
            />
          </View>
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
          <TextInput 
            style={styles.input}
            placeholder="john@example.com"
            value={formData.email}
            onChangeText={(val) => setFormData({...formData, email: val})}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Phone Number</Text>
          <TextInput 
            style={styles.input}
            placeholder="+91 9876543210"
            value={formData.phone}
            onChangeText={(val) => setFormData({...formData, phone: val})}
            keyboardType="phone-pad"
          />
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

        {accountType === 'coach' && (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Certified Sports</Text>
              <TouchableOpacity 
                onPress={() => setIsSportsDropdownOpen(!isSportsDropdownOpen)}
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
                  {Object.values(Sport).map(s => {
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

        <TouchableOpacity onPress={handleSignup} style={styles.registerButton}>
          <Text style={styles.registerButtonText}>Register Now</Text>
        </TouchableOpacity>
      </ScrollView>
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
    flex: 1,
    padding: 32,
    justifyContent: 'center',
    gap: 16,
  },
  stepOneSubtitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 8,
  },
  card: {
    width: '100%',
    padding: 24,
    backgroundColor: '#F8FAFC',
    borderWidth: 2,
    borderColor: '#F1F5F9',
    borderRadius: 32,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardIconLight: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
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
    paddingBottom: 40,
    gap: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  inputGroupCol: {
    flex: 1,
    gap: 8,
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
    paddingVertical: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    borderRadius: 12,
    fontSize: 16,
    color: '#0F172A',
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
});

export default SignupScreen;
