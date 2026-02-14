import { db } from '../../firebaseConfig';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';

let _phase1Enabled = false;
let _isInitialized = false;

export const FeatureFlagService = {
    /**
     * Initialize listener for real-time updates from Firestore
     */
    init: () => {
        if (_isInitialized) return;

        try {
            // Listen for changes to the 'config/app_settings' document
            onSnapshot(doc(db, "config", "app_settings"), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    _phase1Enabled = !!data.phase1Enabled;
                    console.log("[FeatureFlagService] Updated phase1Enabled:", _phase1Enabled);
                }
            }, (error) => {
                console.error("[FeatureFlagService] Snapshot Error:", error);
            });

            _isInitialized = true;
        } catch (error) {
            console.error("[FeatureFlagService] Init Failed:", error);
        }
    },

    /**
     * Synchronous check
     */
    isPhase1Enabled: () => {
        return _phase1Enabled;
    },

    /**
     * Async check
     */
    checkPhase1EnabledAsync: async () => {
        try {
            const docRef = doc(db, "config", "app_settings");
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                const val = !!data.phase1Enabled;
                _phase1Enabled = val;
                return val;
            }
            return false;
        } catch (error) {
            console.error("[FeatureFlagService] Async Check Failed:", error);
            return false;
        }
    }
};

// Auto-init on import
FeatureFlagService.init();
