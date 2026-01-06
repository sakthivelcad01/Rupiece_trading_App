
import { NativeModules } from 'react-native';
import { auth, db } from '../../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

class WebSocketService {
    constructor() {
        this.socket = null;
        this.socketUrl = this.getDevServerURL();
        this.subscriptions = new Set();
        this.subscribers = [];
        this.isConnected = false;
        this.snapshotFetched = false;
        this.reconnectTimer = null;
        this.pendingRequests = new Map(); // requestId -> { resolve, reject, timeout }
        this.authResolve = null; // For Auth Handshake

        // Automatically Send Auth when user logs in if already connected
        onAuthStateChanged(auth, (user) => {
            if (user && this.isConnected) {
                console.log("[WebSocketService] Auth State Changed (Logged In). Relaying Token...");
                this.relayToken();
            }
        });
    }

    async relayToken() {
        try {
            // 1. Get Fresh Firebase ID Token for Server Auth
            if (!auth.currentUser) {
                console.log("[WebSocketService] No User Logged In, cannot relay token.");
                return false;
            }

            const idToken = await auth.currentUser.getIdToken(true);

            // 2. Get Upstox Access Token DB Config (Try/Catch to be robust against Permission Errors)
            let upstoxToken = null;
            try {
                const docRef = doc(db, "config", "upstox");
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    upstoxToken = snap.data().accessToken;
                }
            } catch (fsErr) {
                console.warn("[WebSocketService] Could not fetch Upstox Token from Firestore (Permissions?):", fsErr.message);
                // Continue anyway to authenticate the WebSocket!
            }

            console.log("[WebSocketService] Sending Auth: ID Token + Upstox Token");
            this.send({
                type: 'auth',
                authToken: idToken, // Secure Server-Side Verification
                upstoxToken: upstoxToken, // Relay for Proxy Calls
                uid: auth.currentUser.uid
            });
            return true;

        } catch (e) {
            console.error("[WebSocketService] Token Relay Failed (Critical):", e);
            return false;
        }
    }

    getDevServerURL() {
        // 1. Check for Production/Env Config
        if (process.env.EXPO_PUBLIC_MARKET_DATA_URL) {
            return process.env.EXPO_PUBLIC_MARKET_DATA_URL;
        }

        // 2. Fallback to Local Dev Server Detection
        if (__DEV__ && NativeModules.SourceCode && NativeModules.SourceCode.scriptURL) {
            try {
                const scriptURL = NativeModules.SourceCode.scriptURL;
                const address = scriptURL.split('://')[1].split('/')[0];
                const hostname = address.split(':')[0];
                console.log("[WebSocketService] Detected Host (Dev):", hostname);
                return `ws://${hostname}:3000`;
            } catch (e) {
                console.log("[WebSocketService] Failed to detect host, using localhost");
            }
        }
        return 'ws://localhost:3000';
    }

    async connect() {
        if (this.isConnected) {
            console.log("[WebSocketService] Already connected to", this.socketUrl);
            return;
        }

        console.log("[WebSocketService] Connecting to Local Server at", this.socketUrl, "...");
        try {
            this.socket = new WebSocket(this.socketUrl);

            this.socket.onopen = async () => {
                console.log("[WebSocketService] SUCCESS: Connected to Server at", this.socketUrl);
                // 1. Send Auth / Relay Token
                const authAttempted = await this.relayToken();

                if (authAttempted) {
                    // 2. Wait for Server to Verify Token (Handshake)
                    console.log("[WebSocketService] Waiting for Server Auth Verification...");

                    // Allow up to 10s for auth
                    const authPromise = new Promise(resolve => {
                        this.authResolve = resolve;
                    });

                    // Race a timeout
                    const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(false), 10000));

                    const authSuccess = await Promise.race([authPromise, timeoutPromise]);

                    if (authSuccess) {
                        console.log("[WebSocketService] Connected & Authenticated (Verified).");
                        this.isConnected = true;
                        // 3. Resubscribe to any cached keys
                        this.resubscribe();
                    } else {
                        console.error("[WebSocketService] Auth Handshake Timed Out!");
                        this.socket.close(); // Retry
                    }
                } else {
                    // No User Logged in, treat as Connected (Unauthenticated)
                    console.log("[WebSocketService] Connected (Unauthenticated / No User).");
                    this.isConnected = true;
                    this.resubscribe();
                }
            };

            this.socket.onmessage = (event) => {
                try {
                    // console.log("[WebSocketService] Raw Event Data:", event.data);
                    const data = JSON.parse(event.data);

                    if (data.type === 'pong') {
                        console.log("[WebSocketService] PONG received. Token Available:", data.tokenAvailable);
                        return;
                    }

                    if (data.type === 'auth') {
                        console.log("[WebSocketService] Auth Response:", data);
                        if (data.status === 'success' && this.authResolve) {
                            this.authResolve(true);
                            this.authResolve = null; // Clear
                        }
                        return;
                    }

                    // Handle responses to specific requests
                    if (data.type === 'response' && data.requestId) {
                        const req = this.pendingRequests.get(data.requestId);
                        if (req) {
                            clearTimeout(req.timeout);
                            this.pendingRequests.delete(data.requestId);
                            if (data.error) req.reject(new Error(data.error));
                            else req.resolve(data.data);
                        }
                        return; // This message was a response, no further processing as a feed
                    }

                    // Handle Snapshots or Live Feeds
                    const feedsToProcess = data.feeds || (data.type === 'snapshot' ? data.feeds : null);

                    if (feedsToProcess) {
                        // Ignore empty feeds (heartbeats/idle messages) to prevent REST call floods
                        if (Object.keys(feedsToProcess).length > 0) {
                            // DEBUG: Print one feed to check structure
                            const keys = Object.keys(feedsToProcess);
                            if (keys.length > 0) {
                                console.log("[WebSocketService] Raw Feed Sample:", JSON.stringify(feedsToProcess[keys[0]]));
                            }

                            const normalized = {};
                            Object.entries(feedsToProcess).forEach(([key, feed]) => {
                                normalized[key] = this.normalizeFeed(feed);
                            });
                            this.notifySubscribers(normalized);
                        }
                    } else {
                        console.log("[WebSocketService] Unhandled Message:", JSON.stringify(data));
                    }
                } catch (e) {
                    console.error("[WebSocketService] JSON Parse Error:", e);
                }
            };
            // ... rest of connect ...
            this.socket.onerror = (e) => {
                console.log("[WebSocketService] Error:", JSON.stringify(e));
            };

            this.socket.onclose = () => {
                console.log("[WebSocketService] Closed. Reconnecting...");
                this.isConnected = false;
                this.scheduleReconnect();
            };

        } catch (e) {
            console.error("[WebSocketService] Init Error:", e);
            this.scheduleReconnect();
        }
    }

    // Helper to convert Upstox Feed Protobuf object to Standard Quote format
    normalizeFeed(feed) {
        let ltp = 0;
        let close = 0;
        let change = 0;

        // Extract LTPC (Last Traded Price & Close)
        // Feed can be oneOf: ltpc, fullFeed, firstLevelWithGreeks
        let ltpc = null;

        if (feed.ltpc) {
            ltpc = feed.ltpc;
        } else if (feed.fullFeed) {
            if (feed.fullFeed.marketFF && feed.fullFeed.marketFF.ltpc) {
                ltpc = feed.fullFeed.marketFF.ltpc;
            } else if (feed.fullFeed.indexFF && feed.fullFeed.indexFF.ltpc) {
                ltpc = feed.fullFeed.indexFF.ltpc;
            }
        } else if (feed.firstLevelWithGreeks && feed.firstLevelWithGreeks.ltpc) {
            ltpc = feed.firstLevelWithGreeks.ltpc;
        }

        if (ltpc) {
            ltp = Number(ltpc.ltp) || 0;
            close = Number(ltpc.cp) || 0; // cp is Closing Price
            if (close === 0) {
                console.log("[WebSocketDebug] Zero Close found. LTPC keys:", Object.keys(ltpc));
            }
        }

        if (ltp && close) {
            change = ltp - close;
        }

        // Return structure matching MarketService.getQuotes
        return {
            last_price: ltp,
            net_change: change,
            ohlc: {
                close: close
            }
        };
    }

    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.isConnected = false;
    }

    scheduleReconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    }

    waitForConnection(timeout = 10000) {
        if (this.isConnected) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const interval = setInterval(() => {
                if (this.isConnected) {
                    clearInterval(interval);
                    resolve();
                }
                if (Date.now() - start > timeout) {
                    clearInterval(interval);
                    reject(new Error("Connection Timeout"));
                }
            }, 100);
        });
    }

    /**
     * Sends a request to the server and waits for a response.
     * @param {Object} payload 
     * @param {number} timeoutMs 
     * @returns {Promise<any>}
     */
    async request(payload, timeoutMs = 10000) {
        try {
            await this.waitForConnection();
        } catch (e) {
            return Promise.reject(new Error("WebSocket not connected: " + e.message));
        }

        const requestId = Math.random().toString(36).substring(7);
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Request ${payload.type} timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            this.pendingRequests.set(requestId, { resolve, reject, timeout });
            this.send({ ...payload, requestId });
        });
    }

    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        }
    }

    subscribe(keys) {
        keys.forEach(k => this.subscriptions.add(k));
        console.log("[WebSocketService] Subscribing:", keys);
        this.send({
            type: 'subscribe',
            keys: keys
        });
    }

    unsubscribe(keys) {
        // Server doesn't strictly need unsub for broadcast mode, but good practice
        keys.forEach(k => this.subscriptions.delete(k));
    }

    resubscribe() {
        if (this.subscriptions.size > 0) {
            this.subscribe(Array.from(this.subscriptions));
        }
    }

    onUpdate(callback) {
        this.subscribers.push(callback);
        return () => {
            this.subscribers = this.subscribers.filter(cb => cb !== callback);
        };
    }

    notifySubscribers(data) {
        this.subscribers.forEach(cb => cb(data));
    }
}

export const webSocketService = new WebSocketService();
