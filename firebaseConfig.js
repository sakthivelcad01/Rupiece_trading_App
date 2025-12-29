import { initializeApp } from 'firebase/app';
import { getFunctions } from 'firebase/functions';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
  browserLocalPersistence
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
});

// Platform-specific persistence
export const auth = initializeAuth(app, {
  persistence: Platform.OS === 'web'
    ? browserLocalPersistence
    : getReactNativePersistence(ReactNativeAsyncStorage)
});
// Initialize functions with default region (or change to 'asia-south1' if likely)
// Explicitly passing an empty string or correct region sometimes fixes internal access issues in some SDK versions
export const functions = getFunctions(app); 
