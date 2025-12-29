import React, { createContext, useState, useContext } from 'react';
import { collection, query, where, getDocs, onSnapshot, or } from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../../firebaseConfig';
import { webSocketService } from '../services/WebSocketService';

import AsyncStorage from '@react-native-async-storage/async-storage';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Listen for auth state changes
    React.useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            if (!user) {
                setSelectedAccount(null);
                setAccounts([]);
                setLoading(false);
            }
        });
        return unsubscribe;
    }, []);

    // Fetch Accounts & Restore Selection when User is set
    React.useEffect(() => {
        if (!user || !auth.currentUser) return;

        let unsub = () => { };
        let timer = null;

        const fetchAccounts = async () => {
            try {
                // Query: userId == user.uid OR email == user.email
                const constraints = [where("userId", "==", user.uid)];
                if (user.email) constraints.push(where("email", "==", user.email));

                const q = query(collection(db, "challenges"), or(...constraints));

                // Real-time listener for accounts (with brief delay for Auth sync)
                timer = setTimeout(() => {
                    unsub = onSnapshot(q, async (snapshot) => {
                        const userAccounts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        console.log(`[AuthContext] Accounts fetched: ${userAccounts.length}. UID: ${user.uid}`);
                        setAccounts(userAccounts);

                        // Restore Selection
                        const lastId = await AsyncStorage.getItem(`lastAccount_${user.uid}`);

                        // If we have a currently selected account, update it with live data
                        // If not, try to restore from storage, or default to first

                        setSelectedAccount(prev => {
                            // 1. If we already have a selection, find the updated version of it
                            if (prev) {
                                const found = userAccounts.find(a => a.id === prev.id);
                                return found || userAccounts[0] || null;
                            }

                            // 2. If no selection (first load), try Storage
                            if (lastId) {
                                const found = userAccounts.find(a => a.id === lastId);
                                if (found) return found;
                            }

                            // 3. Fallback to first
                            return userAccounts.length > 0 ? userAccounts[0] : null;
                        });

                        setLoading(false);
                    }, (err) => {
                        console.error("AuthContext: Error fetching accounts", err);
                        setLoading(false);
                    });
                }, 500);

            } catch (err) {
                console.error("AuthContext: Setup Error", err);
                setLoading(false);
            }
        };

        fetchAccounts();
        return () => {
            clearTimeout(timer);
            unsub();
        };
    }, [user]);

    // WebSocket Connection Management (Local Server)
    React.useEffect(() => {
        let pingInterval = null;
        if (user) {
            console.log("[Auth] User logged in, connecting to Market Data Server...");
            webSocketService.connect();

            // Setup diagnostic ping
            pingInterval = setInterval(() => {
                if (webSocketService.isConnected) {
                    webSocketService.send({ type: 'ping' });
                }
            }, 5000);
        } else {
            webSocketService.disconnect();
        }
        return () => {
            if (pingInterval) clearInterval(pingInterval);
        };
    }, [user]);

    const handleSetSelectedAccount = async (account) => {
        setSelectedAccount(account);
        if (user && account) {
            await AsyncStorage.setItem(`lastAccount_${user.uid}`, account.id);
        }
    };

    const login = async (email, password) => {
        setLoading(true);
        setError(null);
        try {
            await signInWithEmailAndPassword(auth, email, password);
            return true;
        } catch (err) {
            let msg = err.message;
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                msg = "Invalid Email or Password";
            } else if (err.code === 'auth/invalid-email') {
                msg = "Invalid Email Address Format";
            } else if (err.code === 'auth/too-many-requests') {
                msg = "Too many failed attempts. Please try again later.";
            } else if (err.code === 'auth/network-request-failed') {
                msg = "Network Error. Please check your internet.";
            }
            setError(msg);
            setLoading(false); // Fix: Ensure loading is stopped on error
            return false;
        } finally {
            // Success case handled by auth listener
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
            setSelectedAccount(null);
            setAccounts([]);
            if (user) await AsyncStorage.removeItem(`lastAccount_${user.uid}`);
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <AuthContext.Provider value={{
            user,
            accounts,
            selectedAccount,
            setSelectedAccount: handleSetSelectedAccount,
            loading,
            error,
            login,
            logout
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
