import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Modal } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons'; // Assuming Ionicons or similar is available via Lucide or similar? Lucide is in package.json

// Lucide Icons
import { Fingerprint, ScanFace, Lock } from 'lucide-react-native';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login, loading, error } = useAuth();
    const [isBiometricSupported, setIsBiometricSupported] = useState(false);
    
    const [loginMode, setLoginMode] = useState('email'); // 'email' or 'account'

    React.useEffect(() => {
        checkBiometrics();
    }, []);

    const checkBiometrics = async () => {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setIsBiometricSupported(compatible && enrolled);
    };

    const handleLogin = async () => {
        if (!email || !password) return;
        const isChallenge = loginMode === 'account';
        const success = await login(email, password, isChallenge);
        
        if (success && email && password && !isChallenge) {
            await SecureStore.setItemAsync('secure_email', email);
            await SecureStore.setItemAsync('secure_password', password);
        }
    };

    const handleBiometricAuth = async () => {
        try {
            const savedEmail = await SecureStore.getItemAsync('secure_email');
            const savedPassword = await SecureStore.getItemAsync('secure_password');

            if (!savedEmail || !savedPassword) {
                Alert.alert('No Credentials Found', 'Please login with password once to enable biometrics.');
                return;
            }

            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Login to Rupiece',
                fallbackLabel: 'Use Password',
            });

            if (result.success) {
                setEmail(savedEmail); // Visual feedback
                setLoginMode('email');
                await login(savedEmail, savedPassword, false);
            }
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Biometric authentication failed.');
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.keyboardView}
            >
                <View style={styles.header}>
                    <Text style={styles.title}>Rupiece</Text>
                    <Text style={styles.subtitle}>exactly what you want</Text>
                </View>

                {/* Mode Toggle */}
                <View style={styles.toggleContainer}>
                    <TouchableOpacity 
                        onPress={() => setLoginMode('email')}
                        style={[styles.toggleButton, loginMode === 'email' && styles.toggleActive]}
                    >
                        <Text style={[styles.toggleText, loginMode === 'email' && styles.toggleTextActive]}>EMAIL</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={() => setLoginMode('account')}
                        style={[styles.toggleButton, loginMode === 'account' && styles.toggleActive]}
                    >
                        <Text style={[styles.toggleText, loginMode === 'account' && styles.toggleTextActive]}>ACCOUNT ID</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.form}>
                    <Text style={styles.label}>{loginMode === 'email' ? 'Email Address' : 'Account ID'}</Text>
                    <TextInput
                        style={styles.input}
                        placeholder={loginMode === 'email' ? "Enter Email" : "ACC-XXXX-XXXX"}
                        placeholderTextColor="#666"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType={loginMode === 'email' ? "email-address" : "default"}
                    />

                    <Text style={styles.label}>Password</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Enter Password"
                        placeholderTextColor="#666"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                    />

                    {error && <Text style={styles.errorText}>{error}</Text>}

                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleLogin}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#000" />
                        ) : (
                            <Text style={styles.buttonText}>LOGIN</Text>
                        )}
                    </TouchableOpacity>

                    {isBiometricSupported && loginMode === 'email' && (
                        <TouchableOpacity style={styles.bioButton} onPress={handleBiometricAuth}>
                            <Fingerprint size={28} color="#22c55e" />
                            <Text style={styles.bioText}>Tap to Unlock</Text>
                        </TouchableOpacity>
                    )}
                </View>
                <Text style={{ textAlign: 'center', color: '#333', marginTop: 20, fontSize: 10 }}>v1.0.1 (OTA Verified)</Text>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    keyboardView: {
        flex: 1,
        justifyContent: 'center',
        padding: 24,
    },
    header: {
        marginBottom: 30,
        alignItems: 'center',
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#888',
    },
    toggleContainer: {
        flexDirection: 'row',
        backgroundColor: '#1a1a1a',
        padding: 4,
        borderRadius: 12,
        marginBottom: 30,
        borderWidth: 1,
        borderColor: '#333',
    },
    toggleButton: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 8,
    },
    toggleActive: {
        backgroundColor: '#333',
    },
    toggleText: {
        color: '#666',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 1,
    },
    toggleTextActive: {
        color: '#fff',
    },
    form: {
        width: '100%',
    },
    label: {
        color: '#888',
        marginBottom: 8,
        marginLeft: 4,
        fontSize: 12,
        textTransform: 'uppercase',
    },
    input: {
        backgroundColor: '#1a1a1a',
        color: '#fff',
        padding: 16,
        borderRadius: 12,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#333',
        fontSize: 16,
    },
    button: {
        backgroundColor: '#22c55e', // Profit Green
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 10,
    },
    bioButton: {
        marginTop: 30,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    bioText: {
        color: '#22c55e',
        fontSize: 14,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    buttonText: {
        color: '#000',
        fontWeight: 'bold',
        fontSize: 16,
    },
    errorText: {
        color: '#ef4444',
        textAlign: 'center',
        marginBottom: 10,
    }
});
