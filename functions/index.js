const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

exports.getMarketQuote = functions.https.onCall(async (data, context) => {
    // Check authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const { symbols } = data; // Expecting comma-separated list of instrument keys e.g. "NSE_EQ|INE002A01018"
    if (!symbols) {
        throw new functions.https.HttpsError('invalid-argument', 'The function must be called with one or more "symbols".');
    }

    try {
        // 1. Get Access Token from Firestore
        const configDoc = await db.collection('config').doc('upstox').get();
        if (!configDoc.exists) {
            throw new functions.https.HttpsError('failed-precondition', 'Upstox configuration not found. Please create config/upstox in Firestore.');
        }
        const { accessToken } = configDoc.data();

        if (!accessToken) {
            throw new functions.https.HttpsError('failed-precondition', 'Upstox Access Token is missing in config.');
        }

        // 2. Call Upstox API
        // https://api.upstox.com/v2/market-quote/quotes?symbol=...
        const response = await axios.get('https://api.upstox.com/v2/market-quote/quotes', {
            params: { symbol: symbols },
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        // 3. Return Data
        return response.data;

    } catch (error) {
        console.error("Upstox API Error:", error.response?.data || error.message);
        // Return a safe error to the client
        throw new functions.https.HttpsError('internal', 'Failed to fetch market data.', error.response?.data);
    }
});

exports.generateAccessToken = functions.https.onCall(async (data, context) => {
    // Check authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // 1. Validate Input
    const { code, redirectUri } = data;
    if (!code || !redirectUri) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing "code" or "redirectUri".');
    }

    try {
        // 2. Get Secrets (Client ID/Secret) from Config
        // Ideally these should be in Firebase Functions Secrets, but for MVP we read from Firestore or Env
        const configDoc = await db.collection('config').doc('upstox_secrets').get();
        if (!configDoc.exists) {
            throw new functions.https.HttpsError('failed-precondition', 'Upstox secrets not found in config/upstox_secrets.');
        }
        const { clientId, clientSecret } = configDoc.data();

        // 3. Exchange Code for Token
        const params = new URLSearchParams();
        params.append('code', code);
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);
        params.append('redirect_uri', redirectUri);
        params.append('grant_type', 'authorization_code');

        const tokenResponse = await axios.post('https://api.upstox.com/v2/login/authorization/token', params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { access_token } = tokenResponse.data;

        // 4. Store Token in Firestore
        await db.collection('config').doc('upstox').set({
            accessToken: access_token,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true, message: 'Token generated and stored successfully.' };

    } catch (error) {
        console.error("Token Generation Error:", error.response?.data || error.message);
        throw new functions.https.HttpsError('internal', 'Failed to generate token.', error.response?.data);
    }
});
