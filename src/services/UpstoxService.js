import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

const BASE_URL = 'https://api.upstox.com/v2';

const getAccessToken = async () => {
    try {
        const docRef = doc(db, "config", "upstox");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data().accessToken;
        }
        console.warn("Upstox Config not found in Firestore");
        return null;
    } catch (error) {
        console.error("Error fetching access token:", error);
        return null;
    }
};

export const UpstoxService = {

    /**
     * Places an order on Upstox.
     * @param {Object} orderDetails 
     * @param {string} orderDetails.quantity - Quantity to trade
     * @param {string} orderDetails.product - 'D' (Delivery) or 'I' (Intraday)
     * @param {string} orderDetails.validity - 'DAY' or 'IOC'
     * @param {number} orderDetails.price - Price (Required for LIMIT/SL-L)
     * @param {string} orderDetails.tag - Optional tag
     * @param {string} orderDetails.instrument_token - Instrument Key
     * @param {string} orderDetails.order_type - 'MARKET', 'LIMIT', 'SL', 'SL-M'
     * @param {string} orderDetails.transaction_type - 'BUY' or 'SELL'
     * @param {number} orderDetails.disclosed_quantity - Optional
     * @param {number} orderDetails.trigger_price - Required for SL/SL-M
     * @param {boolean} orderDetails.is_amo - After Market Order
     */
    placeOrder: async (orderDetails) => {
        try {
            const accessToken = await getAccessToken();
            if (!accessToken) throw new Error("No Access Token Available");

            const url = `${BASE_URL}/order/place`;

            const body = {
                quantity: orderDetails.quantity,
                product: orderDetails.product || 'I', // Default Intraday
                validity: orderDetails.validity || 'DAY',
                price: orderDetails.price || 0,
                tag: orderDetails.tag,
                instrument_token: orderDetails.instrument_token,
                order_type: orderDetails.order_type,
                transaction_type: orderDetails.transaction_type,
                disclosed_quantity: orderDetails.disclosed_quantity || 0,
                trigger_price: orderDetails.trigger_price || 0,
                is_amo: orderDetails.is_amo || false
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(body)
            });

            const json = await response.json();

            if (json.status === 'success') {
                return { success: true, orderId: json.data.order_id, data: json.data };
            } else {
                return { success: false, error: json.errors ? json.errors[0]?.message : "Unknown Upstox Error", details: json };
            }

        } catch (error) {
            console.error("Upstox Place Order Error:", error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Cancels an open order.
     * @param {string} orderId 
     */
    cancelOrder: async (orderId) => {
        try {
            const accessToken = await getAccessToken();
            if (!accessToken) throw new Error("No Access Token Available");

            const url = `${BASE_URL}/order/cancel?order_id=${orderId}`;

            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });

            const json = await response.json();

            if (json.status === 'success') {
                return { success: true, data: json.data };
            } else {
                return { success: false, error: json.errors ? json.errors[0]?.message : "Cancel Failed" };
            }

        } catch (error) {
            console.error("Upstox Cancel Order Error:", error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Modifies an open order.
     * @param {Object} params - { order_id, quantity, price, trigger_price, order_type, validity }
     */
    modifyOrder: async (params) => {
        try {
            const accessToken = await getAccessToken();
            if (!accessToken) throw new Error("No Access Token Available");

            const url = `${BASE_URL}/order/modify`;

            const body = {
                order_id: params.order_id,
                quantity: params.quantity,
                order_type: params.order_type,
                price: params.price,
                trigger_price: params.trigger_price,
                validity: params.validity || 'DAY',
                disclosed_quantity: 0
            };

            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(body)
            });

            const json = await response.json();

            if (json.status === 'success') {
                return { success: true, orderId: json.data.order_id };
            } else {
                return { success: false, error: json.errors ? json.errors[0]?.message : "Modify Failed" };
            }

        } catch (error) {
            console.error("Upstox Modify Order Error:", error);
            return { success: false, error: error.message };
        }
    }
};
