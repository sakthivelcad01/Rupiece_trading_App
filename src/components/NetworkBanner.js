import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useNetwork } from '../context/NetworkContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff } from 'lucide-react-native';

export default function NetworkBanner() {
    const { isConnected, isInternetReachable } = useNetwork();
    const insets = useSafeAreaInsets();

    // Sometimes isInternetReachable is null initially, so we can treat null as true effectively to avoid false positives on startup
    const isOffline = isConnected === false || isInternetReachable === false;

    // Animation height: 0 to ~50
    const heightAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(heightAnim, {
            toValue: isOffline ? 40 + insets.top : 0,
            duration: 300,
            useNativeDriver: false, // height is not supported by native driver
        }).start();
    }, [isOffline, insets.top]);

    if (!isOffline && heightAnim._value === 0) return null;

    return (
        <Animated.View style={[styles.container, { height: heightAnim, paddingTop: insets.top }]}>
            <View style={styles.content}>
                <WifiOff size={16} color="#fff" />
                <Text style={styles.text}>No Internet Connection</Text>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#ef4444',
        overflow: 'hidden',
        width: '100%',
        position: 'absolute',
        top: 0,
        zIndex: 9999, // Ensure it's above everything
    },
    content: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        paddingBottom: 4 // Adjust for visual centering
    },
    text: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14
    }
});
