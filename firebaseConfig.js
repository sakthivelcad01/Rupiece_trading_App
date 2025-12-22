import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyBJRtNPUHp3ekcsHOxWd7M2SmD3H2FDdEw",
  authDomain: "rupiece-ecactly-what-you-want.firebaseapp.com",
  projectId: "rupiece-ecactly-what-you-want",
  storageBucket: "rupiece-ecactly-what-you-want.firebasestorage.app",
  messagingSenderId: "788489947271",
  appId: "1:788489947271:web:75c3adf0f86fa5555f9022"
};

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
});
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});
// Initialize functions with default region (or change to 'asia-south1' if likely)
// Explicitly passing an empty string or correct region sometimes fixes internal access issues in some SDK versions
export const functions = getFunctions(app); 
