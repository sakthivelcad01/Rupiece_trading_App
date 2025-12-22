import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LayoutDashboard, ArrowRightLeft, Briefcase, User, TrendingUp } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext';

import MarketScreen from '../screens/MarketScreen';
import FuturesScreen from '../screens/FuturesScreen';
import TradeScreen from '../screens/TradeScreen';
import PnLScreen from '../screens/PnLScreen';
import AccountScreen from '../screens/AccountScreen';

const Tab = createBottomTabNavigator();

export default function AppTabs() {
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useTheme();

    // Base height of the tab bar content itself (icons + labels)
    const TAB_CONTENT_HEIGHT = 60;

    const bottomPadding = insets.bottom > 0 ? insets.bottom : 10;
    const totalHeight = TAB_CONTENT_HEIGHT + bottomPadding;

    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: colors.tabBar,
                    borderTopColor: colors.tabBorder,
                    height: totalHeight,
                    paddingBottom: bottomPadding,
                    paddingTop: 10,
                    borderTopWidth: 1,
                    elevation: 5,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: -2 },
                    shadowOpacity: 0.1, // Softer shadow in light mode
                    shadowRadius: 4,
                },
                tabBarActiveTintColor: colors.success, // Green
                tabBarInactiveTintColor: isDark ? '#888' : '#9ca3af',
                tabBarLabelStyle: {
                    fontSize: 10,
                    fontWeight: '600',
                    marginTop: 4
                }
            }}
        >
            <Tab.Screen
                name="Market"
                component={MarketScreen}
                options={{
                    tabBarIcon: ({ color }) => <LayoutDashboard color={color} size={24} />,
                    tabBarLabel: "Indices"
                }}
            />

            <Tab.Screen
                name="Futures"
                component={FuturesScreen}
                options={{
                    tabBarIcon: ({ color }) => <TrendingUp color={color} size={24} />,
                    tabBarLabel: "Futures"
                }}
            />
            <Tab.Screen
                name="Trade"
                component={TradeScreen}
                options={{
                    tabBarIcon: ({ color }) => <ArrowRightLeft color={color} size={24} />,
                    tabBarLabel: "Trade"
                }}
            />
            <Tab.Screen
                name="Portfolio"
                component={PnLScreen}
                options={{
                    tabBarIcon: ({ color }) => <Briefcase color={color} size={24} />,
                    tabBarLabel: "Portfolio"
                }}
            />
            <Tab.Screen
                name="Account"
                component={AccountScreen}
                options={{
                    tabBarIcon: ({ color }) => <User color={color} size={24} />,
                    tabBarLabel: "Account"
                }}
            />
        </Tab.Navigator>
    );
}
