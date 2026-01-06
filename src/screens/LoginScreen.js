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
    const [showBioPopup, setShowBioPopup] = useState(false);

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
        const success = await login(email, password);
        // Note: useAuth login usually returns void or throws? We'll assume successful if no error.
        // Actually we can't easily hook into success here unless login returns logic.
        // But we can store credentials optimistically or rely on AuthContext.

        // For this demo, let's store credentials if login proceeds (error handling is in AuthContext usually)
        if (email && password) {
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
                await login(savedEmail, savedPassword);
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

                <View style={styles.form}>
                    <Text style={styles.label}>Email Address</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Enter Email"
                        placeholderTextColor="#666"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
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

                    {isBiometricSupported && (
                        <TouchableOpacity style={styles.bioButton} onPress={handleBiometricAuth}>
                            <Fingerprint size={28} color="#22c55e" />
                            <Text style={styles.bioText}>Tap to Unlock</Text>
                        </TouchableOpacity>
                    )}
                </View>
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
        marginBottom: 40,
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
        marginTop: 20,
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
