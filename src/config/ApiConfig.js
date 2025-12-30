import { Platform, NativeModules } from 'react-native';

const getBaseUrl = () => {
    // 1. Check for Production/Env Config
    if (process.env.EXPO_PUBLIC_MARKET_DATA_URL) {
        return process.env.EXPO_PUBLIC_MARKET_DATA_URL;
    }

    // 2. Android Emulator Special Case
    // 'localhost' on Android refers to the device itself. The host machine is 10.0.2.2
    // We only use this if we are SURE we are on emulator and not a physical device, 
    // but usually NativeModules check covers physical devices better.
    // However, a simple fallback for emulators is often needed.

    // 3. Dynamic Host Detection
    if (__DEV__ && NativeModules.SourceCode && NativeModules.SourceCode.scriptURL) {
        try {
            const scriptURL = NativeModules.SourceCode.scriptURL;
            const address = scriptURL.split('://')[1].split('/')[0];
            const hostname = address.split(':')[0];
            console.log("[ApiConfig] Detected Host:", hostname);
            return hostname;
        } catch (e) { }
    }

    return 'localhost';
};

const BASE_URL_OR_HOST = getBaseUrl();
const PORT = 3000;

// Helper to determine if input is full URL or just a Host
const isFullUrl = (url) => url.includes('://');

let apiUrl, wsUrl;

if (isFullUrl(BASE_URL_OR_HOST)) {
    // It's a full URL (likely from Env Var)
    // E.g. "wss://sakthivel-03.hf.space" or "https://sakthivel-03.hf.space"

    // Standardize to base (remove protocol) to construct both
    const noProto = BASE_URL_OR_HOST.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '');

    // Determine strict protocol if needed or just swap
    // Secure by default for external, Unsecure for local?
    // Let's blindly swap protocols based on what was provided or force secure if 'hf.space'

    const isSecure = BASE_URL_OR_HOST.includes('wss://') || BASE_URL_OR_HOST.includes('https://') || BASE_URL_OR_HOST.includes('.hf.space');

    apiUrl = isSecure ? `https://${noProto}` : `http://${noProto}`;
    wsUrl = isSecure ? `wss://${noProto}` : `ws://${noProto}`;

} else {
    // It's just a Hostname (localhost, 10.0.2.2, 192.168.x.x)
    const host = BASE_URL_OR_HOST;
    const isLocalAndroid = host === 'localhost' || host === '127.0.0.1';

    const targetHost = isLocalAndroid && Platform.OS === 'android' ? '10.0.2.2' : host;

    apiUrl = `http://${targetHost}:${PORT}`;
    wsUrl = `ws://${targetHost}:${PORT}`;
}

export const API_URL = apiUrl;
export const WS_URL = wsUrl;

console.log(`[ApiConfig] Configured API: ${API_URL}, WS: ${WS_URL}`);
