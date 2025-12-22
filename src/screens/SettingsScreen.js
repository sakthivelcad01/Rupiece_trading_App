import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../context/AlertContext';
import { useTheme } from '../context/ThemeContext';
import { ArrowLeft, Moon, KeyRound, Fingerprint, LogOut, ChevronRight, Shield, Sun } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SettingsScreen({ navigation }) {
    const { logout } = useAuth();
    const { showAlert } = useAlert();
    const { colors, toggleTheme, isDark } = useTheme();

    const [biometricsEnabled, setBiometricsEnabled] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const bio = await AsyncStorage.getItem('biometrics_enabled');
            setBiometricsEnabled(bio === 'true');
        } catch (error) {
            console.error(error);
        }
    };

    const toggleBiometrics = async (value) => {
        try {
            await AsyncStorage.setItem('biometrics_enabled', value.toString());
            setBiometricsEnabled(value);
        } catch (error) {
            console.error(error);
        }
    };

    const handleLogout = () => {
        showAlert(
            "Logout",
            "Are you sure you want to logout?",
            [
                { text: "Cancel", style: "cancel" },
                { text: "Logout", onPress: logout, style: 'destructive' }
            ],
            "warning"
        );
    };

    // Dynamic Styles based on colors
    const styles = getStyles(colors);

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => {
                        if (navigation.canGoBack()) {
                            navigation.goBack();
                        } else {
                            navigation.navigate('Main');
                        }
                    }}
                    style={styles.backButton}
                >
                    <ArrowLeft color={colors.text} size={24} />
                </TouchableOpacity>
                <Text style={styles.screenTitle}>Settings</Text>
            </View>

            <ScrollView style={styles.content}>

                {/* Security Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionHeader}>Security</Text>

                    <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ChangePin')}>
                        <View style={styles.rowLeft}>
                            <View style={[styles.iconBox, { backgroundColor: 'rgba(34, 197, 94, 0.1)' }]}>
                                <KeyRound size={20} color="#22c55e" />
                            </View>
                            <Text style={styles.rowTitle}>Change PIN</Text>
                        </View>
                        <ChevronRight size={20} color={colors.subText} />
                    </TouchableOpacity>

                    <View style={styles.row}>
                        <View style={styles.rowLeft}>
                            <View style={[styles.iconBox, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                                <Fingerprint size={20} color="#3b82f6" />
                            </View>
                            <View>
                                <Text style={styles.rowTitle}>Biometric Unlock</Text>
                                <Text style={styles.rowSubtitle}>Use FaceID / Fingerprint to login</Text>
                            </View>
                        </View>
                        <Switch
                            trackColor={{ false: isDark ? "#333" : "#e5e7eb", true: "#22c55e" }}
                            thumbColor={biometricsEnabled ? "#fff" : "#f4f3f4"}
                            onValueChange={toggleBiometrics}
                            value={biometricsEnabled}
                        />
                    </View>
                </View>

                {/* Appearance Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionHeader}>Appearance</Text>

                    <View style={styles.row}>
                        <View style={styles.rowLeft}>
                            <View style={[styles.iconBox, { backgroundColor: 'rgba(168, 85, 247, 0.1)' }]}>
                                {isDark ? <Moon size={20} color="#a855f7" /> : <Sun size={20} color="#f59e0b" />}
                            </View>
                            <Text style={styles.rowTitle}>{isDark ? "Dark Mode" : "Light Mode"}</Text>
                        </View>
                        <Switch
                            trackColor={{ false: isDark ? "#333" : "#e5e7eb", true: "#22c55e" }}
                            thumbColor={isDark ? "#fff" : "#f4f3f4"}
                            onValueChange={toggleTheme} // Toggle Theme
                            value={isDark}
                        />
                    </View>
                </View>

                {/* Danger Zone */}
                <View style={styles.section}>
                    <TouchableOpacity style={[styles.row, { borderBottomWidth: 0, marginBottom: 0 }]} onPress={handleLogout}>
                        <View style={styles.rowLeft}>
                            <View style={[styles.iconBox, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                                <LogOut size={20} color="#ef4444" />
                            </View>
                            <Text style={[styles.rowTitle, { color: '#ef4444' }]}>Logout</Text>
                        </View>
                    </TouchableOpacity>
                </View>

            </ScrollView>
        </SafeAreaView>
    );
}

const getStyles = (colors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.header
    },
    backButton: { marginRight: 16 },
    screenTitle: { fontSize: 20, fontWeight: 'bold', color: colors.text },
    content: { flex: 1, padding: 20 },
    section: { marginBottom: 32 },
    sectionHeader: { color: colors.subText, fontSize: 13, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 12, marginLeft: 4 },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.card,
        padding: 16,
        marginBottom: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.cardBorder
    },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    iconBox: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center'
    },
    rowTitle: { color: colors.text, fontSize: 16, fontWeight: '500' },
    rowSubtitle: { color: colors.subText, fontSize: 12, marginTop: 2 }
});
