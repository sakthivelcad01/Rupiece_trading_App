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

    // Session Security Logic
    React.useEffect(() => {
        if (!user) return;

        let sessionUnsub = () => { };

        const setupSession = async () => {
            try {
                // 1. Get Local Session ID
                let localSessionId = await AsyncStorage.getItem(`sessionId_${user.uid}`);

                // 2. If no local session (first run or fresh login), create one
                if (!localSessionId) {
                    localSessionId = Date.now().toString() + "_" + Math.random().toString(36).substr(2, 9);
                    await AsyncStorage.setItem(`sessionId_${user.uid}`, localSessionId);

                    // Update Firestore (User Just Logged In)
                    await import('firebase/firestore').then(({ setDoc, doc, serverTimestamp }) => {
                        setDoc(doc(db, "rupiecemain", user.uid), {
                            sessionId: localSessionId,
                            lastLogin: serverTimestamp()
                        }, { merge: true });
                    });
                }

                // 3. Listen to Firestore for Remote Changes
                const docRef = import('firebase/firestore').then(({ doc }) => doc(db, "rupiecemain", user.uid));

                // Note: handling async import inside effect is tricky, assuming db/doc available from imports at top
                // Re-using top-level imports for cleaner code
                const userDocRef = doc(db, "rupiecemain", user.uid);

                sessionUnsub = onSnapshot(userDocRef, async (snapshot) => {
                    if (snapshot.exists()) {
                        const data = snapshot.data();
                        const remoteSessionId = data.sessionId;

                        if (remoteSessionId && remoteSessionId !== localSessionId) {
                            console.log("[Auth] Session Mismatch! Remote:", remoteSessionId, "Local:", localSessionId);
                            // Mismatch! Log out.
                            await logout(true); // Pass true to indicate forced logout
                        }
                    }
                });

            } catch (err) {
                console.error("Session Setup Error:", err);
            }
        };

        setupSession();

        return () => {
            sessionUnsub();
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
            const result = await signInWithEmailAndPassword(auth, email, password);
            const user = result.user;

            // Generate New Session ID
            const newSessionId = Date.now().toString() + "_" + Math.random().toString(36).substr(2, 9);

            // 1. Save Local
            await AsyncStorage.setItem(`sessionId_${user.uid}`, newSessionId);

            // 2. Update Firestore (Force other devices out)
            await import('firebase/firestore').then(({ setDoc, doc, serverTimestamp }) => {
                setDoc(doc(db, "rupiecemain", user.uid), {
                    sessionId: newSessionId,
                    lastLogin: serverTimestamp()
                }, { merge: true });
            });

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
            setLoading(false);
            return false;
        } finally {
            // handled by listener
        }
    };

    const logout = async (isForced = false) => {
        try {
            setLoading(true);

            // Clear Local Session
            if (user) {
                await AsyncStorage.removeItem(`sessionId_${user.uid}`);
                await AsyncStorage.removeItem(`lastAccount_${user.uid}`);
            }

            await signOut(auth);

            setSelectedAccount(null);
            setAccounts([]);
            setError(null);

            if (isForced) {
                // We can't easily show an alert from Context without a Ref or Service
                // But setting Error might show it on Login Screen if redirected?
                // Ideally, use AlertContext if available here, or a simple Alert
                setTimeout(() => {
                    // Simple alert might crash if app is in background, but okay for active use
                    alert("Session Expired: You have been logged out because you logged in on another device.");
                }, 500);
            }

        } catch (e) {
            console.error("Logout Error:", e);
        } finally {
            setLoading(false);
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
