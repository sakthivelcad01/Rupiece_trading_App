import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const MarketScreen = () => (
    <SafeAreaView style={styles.container}><Text style={styles.text}>Market Screen (F&O)</Text></SafeAreaView>
);

export const TradeScreen = () => (
    <SafeAreaView style={styles.container}><Text style={styles.text}>Trade Screen</Text></SafeAreaView>
);

export const PortfolioScreen = () => (
    <SafeAreaView style={styles.container}><Text style={styles.text}>Portfolio Screen</Text></SafeAreaView>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' },
    text: { color: '#fff', fontSize: 20 }
});
