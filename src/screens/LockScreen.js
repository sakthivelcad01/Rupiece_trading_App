import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Vibration } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Delete, Fingerprint, Lock } from 'lucide-react-native';
import { useAlert } from '../context/AlertContext';

const PIN_KEY = 'user_app_pin';

export default function LockScreen({ onUnlock, onLogout }) {
    const [pin, setPin] = useState('');
    const [status, setStatus] = useState('CHECKING'); // CHECKING, SETUP, UNLOCK, CONFIRM_SETUP
    const [tempPin, setTempPin] = useState(''); // For confirming PIN during setup
    const [biometricAvailable, setBiometricAvailable] = useState(false);
    const { showAlert } = useAlert();

    useEffect(() => {
        checkPinStatus();
        checkBiometrics();
    }, []);

    const checkPinStatus = async () => {
        try {
            const savedPin = await SecureStore.getItemAsync(PIN_KEY);
            if (savedPin) {
                setStatus('UNLOCK');
                // Prompt biometrics immediately if available
                authenticateBiometric();
            } else {
                setStatus('SETUP');
            }
        } catch (e) {
            console.error("Error checking PIN", e);
            setStatus('SETUP'); // Fallback
        }
    };

    const checkBiometrics = async () => {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();

        // Check user preference
        const enabledPref = await import('@react-native-async-storage/async-storage').then(mod => mod.default.getItem('biometrics_enabled'));
        const isEnabled = enabledPref === 'true';

        setBiometricAvailable(hasHardware && isEnrolled && isEnabled);
    };

    const authenticateBiometric = async () => {
        const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Unlock App',
            fallbackLabel: 'Use PIN',
        });

        if (result.success) {
            onUnlock();
        }
    };

    const handlePress = (num) => {
        if (pin.length < 6) {
            const newPin = pin + num;
            setPin(newPin);

            // Auto-submit when 6 digits reached
            if (newPin.length === 6) {
                handlePinSubmit(newPin);
            }
        }
    };

    const handleDelete = () => {
        setPin(pin.slice(0, -1));
    };

    const handlePinSubmit = async (enteredPin) => {
        if (status === 'UNLOCK') {
            const savedPin = await SecureStore.getItemAsync(PIN_KEY);
            if (enteredPin === savedPin) {
                onUnlock();
            } else {
                Vibration.vibrate();
                setPin('');
                showAlert("Incorrect PIN", "Please try again.", [], "error");
            }
        } else if (status === 'SETUP') {
            setTempPin(enteredPin);
            setPin('');
            setStatus('CONFIRM_SETUP');
        } else if (status === 'CONFIRM_SETUP') {
            if (enteredPin === tempPin) {
                await SecureStore.setItemAsync(PIN_KEY, enteredPin);
                showAlert("Success", "PIN Set Successfully!", [{ text: "OK", onPress: onUnlock }], "success");
            } else {
                Vibration.vibrate();
                setPin('');
                setTempPin('');
                setStatus('SETUP');
                showAlert("PIN Mismatch", "PINs did not match. Try again.", [], "error");
            }
        }
    };

    const handleForgotPin = () => {
        showAlert(
            "Forgot PIN?",
            "To reset your PIN, you must login again with your email and password.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Logout & Reset",
                    style: "destructive",
                    onPress: async () => {
                        await SecureStore.deleteItemAsync(PIN_KEY);
                        if (onLogout) onLogout();
                    }
                }
            ],
            "warning"
        );
    };

    const getTitle = () => {
        switch (status) {
            case 'SETUP': return 'Set a 6-Digit PIN';
            case 'CONFIRM_SETUP': return 'Confirm your PIN';
            default: return 'Enter App PIN';
        }
    };

    const renderDot = (index) => {
        const filled = index < pin.length;
        return (
            <View key={index} style={[styles.dot, filled && styles.dotFilled]} />
        );
    };

    if (status === 'CHECKING') return <View style={styles.container} />;

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <View style={styles.iconContainer}>
                    <Lock size={40} color="#22c55e" />
                </View>
                <Text style={styles.title}>{getTitle()}</Text>

                <View style={styles.dotsContainer}>
                    {[0, 1, 2, 3, 4, 5].map(renderDot)}
                </View>
            </View>

            <View style={styles.keypad}>
                <View style={styles.row}>
                    {[1, 2, 3].map(n => (
                        <TouchableOpacity key={n} style={styles.key} onPress={() => handlePress(n.toString())}>
                            <Text style={styles.keyText}>{n}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <View style={styles.row}>
                    {[4, 5, 6].map(n => (
                        <TouchableOpacity key={n} style={styles.key} onPress={() => handlePress(n.toString())}>
                            <Text style={styles.keyText}>{n}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <View style={styles.row}>
                    {[7, 8, 9].map(n => (
                        <TouchableOpacity key={n} style={styles.key} onPress={() => handlePress(n.toString())}>
                            <Text style={styles.keyText}>{n}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <View style={styles.row}>
                    <View style={styles.keyEmpty}>
                        {status === 'UNLOCK' && biometricAvailable && (
                            <TouchableOpacity onPress={authenticateBiometric}>
                                <Fingerprint size={32} color="#22c55e" />
                            </TouchableOpacity>
                        )}
                    </View>
                    <TouchableOpacity style={styles.key} onPress={() => handlePress('0')}>
                        <Text style={styles.keyText}>0</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.keyEmpty} onPress={handleDelete}>
                        <Delete size={28} color="#fff" />
                    </TouchableOpacity>
                </View>

                {status === 'UNLOCK' && (
                    <TouchableOpacity style={{ alignItems: 'center', marginTop: 24 }} onPress={handleForgotPin}>
                        <Text style={{ color: '#22c55e', fontSize: 14, fontWeight: 'bold' }}>Forgot PIN?</Text>
                    </TouchableOpacity>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
        justifyContent: 'space-between'
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingBottom: 50
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 32
    },
    dotsContainer: {
        flexDirection: 'row',
        gap: 16
    },
    dot: {
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#333',
        backgroundColor: 'transparent'
    },
    dotFilled: {
        backgroundColor: '#22c55e',
        borderColor: '#22c55e'
    },
    keypad: {
        padding: 32,
        paddingBottom: 50
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 24
    },
    key: {
        width: 75,
        height: 75,
        borderRadius: 37.5,
        backgroundColor: '#1a1a1a',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333'
    },
    keyText: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff'
    },
    keyEmpty: {
        width: 75,
        height: 75,
        justifyContent: 'center',
        alignItems: 'center'
    }
});
