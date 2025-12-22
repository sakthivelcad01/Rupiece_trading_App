import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Vibration } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Delete, Lock, ArrowLeft } from 'lucide-react-native';
import { useAlert } from '../context/AlertContext';

const PIN_KEY = 'user_app_pin';

export default function ChangePinScreen({ navigation }) {
    const [pin, setPin] = useState('');
    const [status, setStatus] = useState('VERIFY_OLD'); // VERIFY_OLD, SET_NEW, CONFIRM_NEW
    const [newPinTemp, setNewPinTemp] = useState('');
    const { showAlert } = useAlert();

    const handlePress = (num) => {
        if (pin.length < 6) {
            const currentPin = pin + num;
            setPin(currentPin);
            if (currentPin.length === 6) {
                handleSubmit(currentPin);
            }
        }
    };

    const handleDelete = () => {
        setPin(pin.slice(0, -1));
    };

    const handleSubmit = async (enteredPin) => {
        if (status === 'VERIFY_OLD') {
            try {
                const storedPin = await SecureStore.getItemAsync(PIN_KEY);
                if (storedPin && enteredPin === storedPin) {
                    setStatus('SET_NEW');
                    setPin('');
                } else {
                    Vibration.vibrate();
                    setPin('');
                    showAlert("Incorrect PIN", "The old PIN you entered is incorrect.", [], "error");
                }
            } catch (error) {
                console.error(error);
                showAlert("Error", "Could not verify PIN.", [], "error");
            }
        } else if (status === 'SET_NEW') {
            setNewPinTemp(enteredPin);
            setPin('');
            setStatus('CONFIRM_NEW');
        } else if (status === 'CONFIRM_NEW') {
            if (enteredPin === newPinTemp) {
                try {
                    await SecureStore.setItemAsync(PIN_KEY, enteredPin);
                    showAlert("Success", "Your PIN has been updated.", [
                        { text: "OK", onPress: () => navigation.goBack() }
                    ], "success");
                } catch (error) {
                    showAlert("Error", "Could not save new PIN.", [], "error");
                }
            } else {
                Vibration.vibrate();
                setPin('');
                setNewPinTemp('');
                setStatus('SET_NEW');
                showAlert("Mismatch", "New PINs did not match. Please try again.", [], "error");
            }
        }
    };

    const getTitle = () => {
        switch (status) {
            case 'VERIFY_OLD': return 'Enter Old PIN';
            case 'SET_NEW': return 'Enter New PIN';
            case 'CONFIRM_NEW': return 'Confirm New PIN';
            default: return 'Change PIN';
        }
    };

    const renderDot = (index) => {
        const filled = index < pin.length;
        return (
            <View key={index} style={[styles.dot, filled && styles.dotFilled]} />
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8 }}>
                    <ArrowLeft color="#fff" size={24} />
                </TouchableOpacity>
            </View>

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
                    <View style={styles.keyEmpty} />
                    <TouchableOpacity style={styles.key} onPress={() => handlePress('0')}>
                        <Text style={styles.keyText}>0</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.keyEmpty} onPress={handleDelete}>
                        <Delete size={28} color="#fff" />
                    </TouchableOpacity>
                </View>
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
    header: {
        padding: 16
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
