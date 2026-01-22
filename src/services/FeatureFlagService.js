import { supabase } from './SupabaseService';

let _phase1Enabled = false;
let _isInitialized = false;

export const FeatureFlagService = {
    /**
     * Initialize listener for real-time updates
     */
    init: () => {
        if (_isInitialized) return;

        try {
            // Listen for changes to the 'config' table where key is 'app_settings'
            supabase.channel('public:config:key=eq.app_settings')
                .on(
                    'postgres_changes',
                    { event: 'UPDATE', schema: 'public', table: 'config', filter: "key=eq.app_settings" },
                    (payload) => {
                        const newValue = payload.new.value; // Assuming 'value' column holds the JSON
                        if (newValue) {
                            _phase1Enabled = !!newValue.phase1Enabled;
                            console.log("[FeatureFlagService] Updated phase1Enabled:", _phase1Enabled);
                        }
                    }
                )
                .subscribe();

            // Also do an initial fetch
            FeatureFlagService.checkPhase1EnabledAsync();

            _isInitialized = true;
        } catch (error) {
            console.error("[FeatureFlagService] Init Failed:", error);
        }
    },

    /**
     * Synchronous check (relies on listener having updated the value)
     */
    isPhase1Enabled: () => {
        return _phase1Enabled;
    },

    /**
     * Async check (fetches fresh value if needed)
     */
    checkPhase1EnabledAsync: async () => {
        try {
            const { data, error } = await supabase
                .from('config')
                .select('value')
                .eq('key', 'app_settings')
                .single();

            if (data && data.value) {
                const val = !!data.value.phase1Enabled;
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
