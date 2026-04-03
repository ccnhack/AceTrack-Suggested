import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth,
  initializeAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  onAuthStateChanged as firebaseOnAuthStateChanged,
  GoogleAuthProvider,
  signInWithCredential,
  browserLocalPersistence
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAEBVorVssOXB0CCStIVg0Nd7mmXpjeh4A",
  authDomain: "acetrack-ad98e.firebaseapp.com",
  projectId: "acetrack-ad98e",
  storageBucket: "acetrack-ad98e.firebasestorage.app",
  messagingSenderId: "45583316683",
  appId: "1:45583316683:web:1529124dd94c07c1398d4e",
  measurementId: "G-ZLVSZPQ4D2"
};

let app;
let auth;

/**
 * Initialize Firebase (call once at app startup)
 */
export const initializeFirebase = () => {
  if (getApps().length > 0) {
    app = getApp();
    try {
      auth = getAuth(app);
    } catch (e) {
      if (Platform.OS === 'web') {
        auth = initializeAuth(app, { persistence: browserLocalPersistence });
      } else {
        const { getReactNativePersistence } = require('firebase/auth');
        auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
      }
    }
  } else {
    app = initializeApp(firebaseConfig);
    if (Platform.OS === 'web') {
      auth = initializeAuth(app, { persistence: browserLocalPersistence });
      console.log('🔥 Firebase initialized with browserLocalPersistence');
    } else {
      const { getReactNativePersistence } = require('firebase/auth');
      auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
      console.log('🔥 Firebase initialized with AsyncStorage persistence');
    }
  }
  return { app, auth };
};

/**
 * Sign up with email and password
 */
export const signUpWithEmail = async (email, password) => {
  const { auth } = initializeFirebase();
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    return { uid: credential.user.uid, email: credential.user.email };
  } catch (error) {
    console.error('🔥 Firebase signUp Error:', error.message);
    throw error;
  }
};

/**
 * Sign in with email and password
 */
export const signInWithEmail = async (email, password) => {
  const { auth } = initializeFirebase();
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const token = await credential.user.getIdToken();
    return { uid: credential.user.uid, email: credential.user.email, token };
  } catch (error) {
    console.error('🔥 Firebase signIn Error:', error.message);
    throw error;
  }
};

/**
 * Sign in with Google (Stub for further implementation with AuthSession)
 */
export const signInWithGoogle = async () => {
  console.log('🔥 Firebase Google sign-in: Requires expo-auth-session setup');
  return { error: 'Google Sign-In requires further native configuration' };
};

/**
 * Sign out
 */
export const signOut = async () => {
  const { auth } = initializeFirebase();
  try {
    await firebaseSignOut(auth);
    console.log('🔥 Signed out');
  } catch (error) {
    console.error('🔥 Sign out Error:', error.message);
  }
};

/**
 * Get current user
 */
export const getCurrentUser = () => {
  const { auth } = initializeFirebase();
  return auth?.currentUser;
};

/**
 * Get ID token for API requests
 */
export const getIdToken = async () => {
  const { auth } = initializeFirebase();
  if (auth?.currentUser) {
    return auth.currentUser.getIdToken();
  }
  return null;
};

/**
 * Listen for auth state changes
 */
export const onAuthStateChanged = (callback) => {
  const { auth } = initializeFirebase();
  if (auth) {
    return firebaseOnAuthStateChanged(auth, callback);
  }
  return () => {};
};

export default {
  initializeFirebase,
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  getCurrentUser,
  getIdToken,
  onAuthStateChanged,
  firebaseConfig,
};
