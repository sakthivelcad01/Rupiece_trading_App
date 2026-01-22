import React, { createContext, useState, useContext } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../services/SupabaseService';
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
        // Check current session first
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
            if (!session?.user) {
                setLoading(false);
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            const currentUser = session?.user ?? null;
            setUser(currentUser);

            if (!currentUser) {
                setSelectedAccount(null);
                setAccounts([]);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    // Fetch Accounts & Restore Selection when User is set
    React.useEffect(() => {
        if (!user) return;

        let channel = null;

        const fetchAccounts = async () => {
            try {
                // Initial Fetch
                const { data: userAccounts, error: fetchError } = await supabase
                    .from('accounts')
                    .select('*')
                    .eq('userId', user.id);

                if (fetchError) throw fetchError;

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

                // Real-time listener for "accounts" table changes for this user
                // Subscribe to changes where userId matches
                channel = supabase.channel(`public:accounts:userId=eq.${user.id}`)
                    .on(
                        'postgres_changes',
                        { event: '*', schema: 'public', table: 'accounts', filter: `userId=eq.${user.id}` },
                        (payload) => {
                            console.log('Account change received!', payload);
                            // Re-fetch to be safe and simple, or handle merge logic
                            // For simplicity, re-fetching entire list is robust
                            refreshAccounts();
                        }
                    )
                    .subscribe();

            } catch (err) {
                console.error("AuthContext: Setup Error", err);
                setLoading(false);
            }
        };

        const refreshAccounts = async () => {
            const { data: userAccounts } = await supabase
                .from('accounts')
                .select('*')
                .eq('userId', user.id);
            if (userAccounts) {
                setAccounts(userAccounts);
                // logic to maintain selected account could go here if needed
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

        let sessionChannel = null;

        const setupSession = async () => {
            try {
                // 1. Get Local Session ID
                let localSessionId = await AsyncStorage.getItem(`sessionId_${user.id}`);

                // 2. If no local session, create one
                if (!localSessionId) {
                    localSessionId = Date.now().toString() + "_" + Math.random().toString(36).substr(2, 9);
                    await AsyncStorage.setItem(`sessionId_${user.id}`, localSessionId);

                    // Update Supabase Profiles
                    await supabase.from('profiles').upsert({
                        id: user.id,
                        sessionId: localSessionId,
                        lastLogin: new Date().toISOString()
                    });
                }

                // 3. Listen to Profile Changes
                sessionChannel = supabase.channel(`public:profiles:${user.id}`)
                    .on(
                        'postgres_changes',
                        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
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
            if (sessionChannel) supabase.removeChannel(sessionChannel);
        };
    }, [user]);


    const handleSetSelectedAccount = async (account) => {
        setSelectedAccount(account);
        if (user && account) {
            await AsyncStorage.setItem(`lastAccount_${user.id}`, account.id);
        }
    };

    const login = async (email, password) => {
        setLoading(true);
        setError(null);
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            const user = data.user;

            // Generate New Session ID
            const newSessionId = Date.now().toString() + "_" + Math.random().toString(36).substr(2, 9);

            // 1. Save Local
            await AsyncStorage.setItem(`sessionId_${user.id}`, newSessionId);

            // 2. Update Supabase Profile (Force other devices out)
            await supabase.from('profiles').upsert({
                id: user.id,
                sessionId: newSessionId,
                lastLogin: new Date().toISOString()
            });

            return true;
        } catch (err) {
            console.error("Login Error", err);
            let msg = err.message;
            if (msg.includes("Invalid login credentials")) msg = "Invalid Email or Password";
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
