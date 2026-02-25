import { supabase } from '../../supabaseConfig';

let _phase1Enabled = false;
let _isInitialized = false;

export const FeatureFlagService = {
    /**
     * Initialize listener for real-time updates from Supabase
     */
    init: () => {
        if (_isInitialized) return;

        try {
            // Initial Fetch
            supabase
                .from('config')
                .select('phase1Enabled')
                .eq('id', 'app_settings')
                .single()
                .then(({ data }) => {
                    if (data) {
                        _phase1Enabled = !!data.phase1Enabled;
                        console.log("[FeatureFlagService] Initial phase1Enabled:", _phase1Enabled);
                    }
                });

            // Listen for changes
            supabase.channel('config:app_settings')
                .on(
                    'postgres_changes',
                    { event: 'UPDATE', schema: 'public', table: 'config', filter: "id=eq.app_settings" },
                    (payload) => {
                        if (payload.new) {
                            _phase1Enabled = !!payload.new.phase1Enabled;
                            console.log("[FeatureFlagService] Updated phase1Enabled:", _phase1Enabled);
                        }
                    }
                )
                .subscribe();

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
            const { data, error } = await supabase
                .from('config')
                .select('phase1Enabled')
                .eq('id', 'app_settings')
                .single();

            if (data) {
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
