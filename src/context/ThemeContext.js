import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';

const ThemeContext = createContext();

export const lightTheme = {
    dark: false,
    colors: {
        background: '#ffffff',
        card: '#f3f4f6',
        cardBorder: '#e5e7eb', // lighter border for cards
        header: '#ffffff',
        text: '#111827',
        subText: '#6b7280',
        border: '#e5e7eb',
        primary: '#5B7CFA',
        success: '#22c55e', // Green
        danger: '#ef4444',  // Red
        warning: '#f59e0b',
        tabBar: '#ffffff',
        tabBorder: '#e5e7eb',
        inputBg: '#f9fafb',
        activeItem: 'rgba(91, 124, 250, 0.1)', // Light blue tint
        quoteText: '#1f2937'
    }
};

export const darkTheme = {
    dark: true,
    colors: {
        background: '#0a0a0a',
        card: '#1a1a1a',
        cardBorder: '#333333',
        header: '#111111', // Slightly lighter than bg
        text: '#ffffff',
        subText: '#9ca3af',
        border: '#333333',
        primary: '#5B7CFA',
        success: '#22c55e',
        danger: '#ef4444',
        warning: '#f59e0b',
        tabBar: '#1a1a1a',
        tabBorder: '#333333',
        inputBg: '#111111',
        activeItem: 'rgba(91, 124, 250, 0.1)',
        quoteText: '#ffffff'
    }
};

export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(darkTheme); // Default to Dark
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadTheme();
    }, []);

    const loadTheme = async () => {
        try {
            const storedTheme = await AsyncStorage.getItem('app_theme');
            if (storedTheme === 'light') {
                setTheme(lightTheme);
            } else {
                setTheme(darkTheme);
            }
        } catch (e) {
            console.error("Failed to load theme", e);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleTheme = async () => {
        const newTheme = theme.dark ? lightTheme : darkTheme;
        setTheme(newTheme);
        try {
            await AsyncStorage.setItem('app_theme', newTheme.dark ? 'dark' : 'light');
        } catch (e) {
            console.error("Failed to save theme", e);
        }
    };

    const colors = theme.colors;

    return (
        <ThemeContext.Provider value={{ theme, colors, toggleTheme, isDark: theme.dark }}>
            {children}
            {/* Control Status Bar Globally based on Theme */}
            <StatusBar style={theme.dark ? "light" : "dark"} backgroundColor={colors.header} />
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
