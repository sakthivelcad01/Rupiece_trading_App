import React, { createContext, useState, useContext } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../../supabaseConfig';
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
        // Check initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            console.log("[Auth] Initial Session Check Complete");
            setUser(session?.user ?? null);
            setLoading(false);
        }).catch(err => {
            console.error("[Auth] Session Check Failed:", err.message);
            setLoading(false);
        });

        // SAFETY TIMEOUT: Force loading to false if Supabase hangs
        const timeout = setTimeout(() => {
            console.warn("[Auth] SUPABASE HANG DETECTED. Forcing loading=false.");
            setLoading(false);
        }, 5000); // Increased to 5s for cloud reliability

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            const currentUser = session?.user;
            setUser(currentUser ?? null);

            if (!currentUser) {
                setSelectedAccount(null);
                setAccounts([]);
                setLoading(false);
            }
        });

        return () => {
            subscription.unsubscribe();
            clearTimeout(timeout);
        };
    }, []);

    // Fetch Accounts & Restore Selection when User is set
    React.useEffect(() => {
        if (!user) return;

        let channel = null;

        const fetchAccounts = async () => {
            try {
                let query = supabase
                    .from('challenges')
                    .select('*')
                    .eq('userId', user.id);
                
                if (user.isChallenge && user.challengeAccountId) {
                    query = query.eq('id', user.challengeAccountId);
                }

                const { data: userAccounts, error } = await query;

                if (error) throw error;

                console.log(`[AuthContext] Accounts fetched: ${userAccounts?.length || 0}. UID: ${user.id}`);
                setAccounts(userAccounts || []);

                // Restore Selection
                const lastId = await AsyncStorage.getItem(`lastAccount_${user.id}`);

                setSelectedAccount(prev => {
                    if (prev) {
                        const found = userAccounts?.find(a => a.id === prev.id);
                        return found || userAccounts?.[0] || null;
                    }
                    if (lastId) {
                        const found = userAccounts?.find(a => a.id === lastId);
                        if (found) return found;
                    }
                    return userAccounts?.length > 0 ? userAccounts[0] : null;
                });

                setLoading(false);

                // Real-time Listener
                channel = supabase.channel('public:challenges')
                    .on(
                        'postgres_changes',
                        'postgres_changes',
                        { 
                            event: '*', 
                            schema: 'public', 
                            table: 'challenges', 
                            filter: user.isChallenge && user.challengeAccountId 
                                ? `id=eq.${user.challengeAccountId}` 
                                : `userId=eq.${user.id}` 
                        },
                        (payload) => {
                            // Simplified: Re-fetch on any change to ensure consistency (or handle delta)
                            // For simplicity and correctness with Supabase, re-fetching list or manually updating state.
                            // Implementing Manual State Update for efficiency:
                            if (payload.eventType === 'INSERT') {
                                setAccounts(prev => [...prev, payload.new]);
                            } else if (payload.eventType === 'UPDATE') {
                                setAccounts(prev => prev.map(a => a.id === payload.new.id ? payload.new : a));
                                setSelectedAccount(prev => prev && prev.id === payload.new.id ? payload.new : prev);
                            } else if (payload.eventType === 'DELETE') {
                                setAccounts(prev => prev.filter(a => a.id !== payload.old.id));
                            }
                        }
                    )
                    .subscribe();

            } catch (err) {
                console.error("AuthContext: Fetch Error", err.message);
                setLoading(false);
            }
        };

        fetchAccounts();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, [user]);

    // WebSocket Connection Management
    React.useEffect(() => {
        let pingInterval = null;
        if (user) {
            console.log("[Auth] User logged in, connecting to Market Data Server...");
            webSocketService.connect();

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

    // Session Security Logic (Single Session)
    React.useEffect(() => {
        if (!user) return;

        let channel = null;

        const setupSession = async () => {
            try {
                // 1. Get Local Session ID
                let localSessionId = await AsyncStorage.getItem(`sessionId_${user.id}`);

                // 2. If no local session, create one
                if (!localSessionId) {
                    localSessionId = Date.now().toString() + "_" + Math.random().toString(36).substr(2, 9);
                    await AsyncStorage.setItem(`sessionId_${user.id}`, localSessionId);

                    // Update Supabase Profiles
                    await supabase.from('rupiecemain').upsert({
                        id: user.id,
                        sessionId: localSessionId,
                        lastLogin: new Date().toISOString()
                    });
                }

                // 3. Listen to Profile Changes
                channel = supabase.channel('public:rupiecemain')
                    .on(
                        'postgres_changes',
                        { event: 'UPDATE', schema: 'public', table: 'rupiecemain', filter: `id=eq.${user.id}` },
                        async (payload) => {
                            const newSessionId = payload.new.sessionId;
                            if (newSessionId && newSessionId !== localSessionId) {
                                console.log("[Auth] Session Mismatch! Remote:", newSessionId, "Local:", localSessionId);
                                await logout(true);
                            }
                        }
                    )
                    .subscribe();

            } catch (err) {
                console.error("Session Setup Error:", err);
            }
        };

        setupSession();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, [user]);


    const handleSetSelectedAccount = async (account) => {
        setSelectedAccount(account);
        if (user && account) {
            await AsyncStorage.setItem(`lastAccount_${user.id}`, account.id);
        }
    };

    const login = async (emailOrAccountId, password, isChallenge = false) => {
        setLoading(true);
        setError(null);
        try {
            if (isChallenge) {
                // Challenge Account Login
                const { data, error } = await supabase
                    .from('challenges')
                    .select('*')
                    .eq('accountId', emailOrAccountId)
                    .single();

                if (error || !data || data.password !== password) {
                    throw new Error("Invalid Account ID or Password");
                }

                // For challenge-only login, we fetch the profile of the owner
                const { data: profile } = await supabase.from('rupiecemain').select('*').eq('id', data.userId).single();
                
                setUser({ 
                    id: data.userId, 
                    email: profile?.email || 'challenge-user@rupiece.in', 
                    isChallenge: true,
                    challengeAccountId: data.id 
                });
                setSelectedAccount(data);
                
                await AsyncStorage.setItem(`sessionId_${data.userId}`, "challenge_" + data.id);
                await AsyncStorage.setItem(`lastAccount_${data.userId}`, data.id);
                
                return true;
            } else {
                // Standard Supabase Auth
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: emailOrAccountId,
                    password,
                });

                if (error) throw error;
                const user = data.user;

                // Generate New Session ID
                const newSessionId = Date.now().toString() + "_" + Math.random().toString(36).substr(2, 9);

                // 1. Save Local
                await AsyncStorage.setItem(`sessionId_${user.id}`, newSessionId);

                // 2. Update Supabase Profile (Force other devices out)
                await supabase.from('rupiecemain').upsert({
                    id: user.id,
                    sessionId: newSessionId,
                    lastLogin: new Date().toISOString()
                });

                return true;
            }
        } catch (err) {
            console.error("Login Error", err);
            let msg = err.message;
            if (msg.includes("Invalid login credentials")) {
                msg = "Invalid Email or Password";
            }
            setError(msg);
            setLoading(false);
            return false;
        }
    };

    const logout = async (isForced = false) => {
        try {
            setLoading(true);

            if (user) {
                await AsyncStorage.removeItem(`sessionId_${user.id}`);
                await AsyncStorage.removeItem(`lastAccount_${user.id}`);
            }

            // Unsubscribe all channels? (Supabase handles cleanup on client usually, but explicit is good)
            supabase.getChannels().forEach(ch => supabase.removeChannel(ch));

            await supabase.auth.signOut();

            setSelectedAccount(null);
            setAccounts([]);
            setError(null);

            if (isForced) {
                setTimeout(() => {
                    Alert.alert("Session Expired", "You have been logged out because you logged in on another device.");
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
