import { db } from '../../firebaseConfig';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

let _phase1Enabled = false;
let _isInitialized = false;

export const FeatureFlagService = {
    /**
     * Initialize listener for real-time updates
     */
    init: () => {
        if (_isInitialized) return;

        try {
            const docRef = doc(db, 'config', 'app_settings');
            // Real-time listener
            onSnapshot(docRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    _phase1Enabled = !!data.phase1Enabled;
                    console.log("[FeatureFlagService] Updated phase1Enabled:", _phase1Enabled);
                } else {
                    console.log("[FeatureFlagService] Config doc missing, defaulting to false");
                    _phase1Enabled = false;
                }
            }, (error) => {
                console.error("[FeatureFlagService] Listener Error:", error);
            });
            _isInitialized = true;
        } catch (error) {
            console.error("[FeatureFlagService] Init Failed:", error);
        }
    },

    /**
     * Synchronous check (relies on listener having updated the value)
     * For critical checks, use checkAsync
     */
    isPhase1Enabled: () => {
        return _phase1Enabled;
    },

    /**
     * Async check (fetches fresh value if needed, reliable for one-off checks)
     */
    checkPhase1EnabledAsync: async () => {
        try {
            const docRef = doc(db, 'config', 'app_settings');
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const val = !!docSnap.data().phase1Enabled;
                _phase1Enabled = val; // update local cache too
                return val;
            }
            return false;
        } catch (error) {
            console.error("[FeatureFlagService] Async Check Failed:", error);
            return false;
        }
    }
};

// Auto-init on import (or call in App.js)
FeatureFlagService.init();
