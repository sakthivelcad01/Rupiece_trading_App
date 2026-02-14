import React from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { Alert } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import ChartScreen from './src/screens/ChartScreen';

import { ErrorBoundary } from './src/components/ErrorBoundary';

import { AppState, View, StyleSheet, LogBox } from 'react-native';
import LockScreen from './src/screens/LockScreen';

// Ignore development warnings
LogBox.ignoreLogs([
  "The action 'GO_BACK' was not handled",
  "Non-serializable values were found in the navigation state",
]);
import { AlertProvider } from './src/context/AlertContext';
import { NetworkProvider } from './src/context/NetworkContext';
import NetworkBanner from './src/components/NetworkBanner';
import AppTabs from './src/navigation/AppTabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useOrderMonitor } from './src/hooks/useOrderMonitor';

const Stack = createNativeStackNavigator();

function NavigationRoot() {
  const { user, loading, logout } = useAuth();
  const [isLocked, setIsLocked] = React.useState(true);
  const appState = React.useRef(AppState.currentState);

  // Start Execution Monitor (Background)
  useOrderMonitor();

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App came to foreground -> Lock it (if user is logged in)
        if (user) {
          setIsLocked(true);
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [user]);

  // If loading auth state, show nothing or splash (usually handled by native splash)
  if (loading) return null;

  return (
    <View style={{ flex: 1 }}>
      <NetworkBanner />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!user ? (
            <Stack.Screen name="Login" component={LoginScreen} />
          ) : (
            <>
              <Stack.Screen name="Main" component={AppTabs} />
              <Stack.Screen name="Chart" component={ChartScreen} />
              <Stack.Screen name="Settings" component={require('./src/screens/SettingsScreen').default} />
              <Stack.Screen name="ChangePin" component={require('./src/screens/ChangePinScreen').default} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>

      {user && isLocked && (
        <View style={StyleSheet.absoluteFill}>
          <LockScreen onUnlock={() => setIsLocked(false)} onLogout={logout} />
        </View>
      )}

      <StatusBar style="light" />
    </View>
  );
}


import { ThemeProvider } from './src/context/ThemeContext';

export default function App() {
  console.log("[App] Mounting...");
  React.useEffect(() => {
    console.log("[App] Effect running...");
    async function checkUpdates() {
      try {
        if (__DEV__) return; // Don't check in dev mode
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          Alert.alert(
            "Update Available",
            "A new version is ready. Restart to apply?",
            [
              { text: "Later" },
              { text: "Restart", onPress: () => Updates.reloadAsync() }
            ]
          );
        }
      } catch (e) {
        console.log("Update Check Error:", e);
      }
    }
    checkUpdates();
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AlertProvider>
          <AuthProvider>
            <ThemeProvider>
              <NetworkProvider>
                <NavigationRoot />
              </NetworkProvider>
            </ThemeProvider>
          </AuthProvider>
        </AlertProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
