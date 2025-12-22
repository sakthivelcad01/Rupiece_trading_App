import React, { createContext, useContext, useState, useCallback } from 'react';
import CustomAlert from '../components/CustomAlert';

const AlertContext = createContext();

export const AlertProvider = ({ children }) => {
    const [alertConfig, setAlertConfig] = useState({
        visible: false,
        title: '',
        message: '',
        buttons: [],
        type: 'info' // success, error, warning, info
    });

    const showAlert = useCallback((title, message, buttons = [], type = 'info') => {
        let finalTitle = title;
        let finalMessage = message;
        let finalButtons = buttons;
        let finalType = type;

        // Safety check: if title is an object (incorrect usage), extract/stringify it
        if (typeof title === 'object' && title !== null) {
            console.warn('showAlert called with object instead of arguments:', title);
            const config = title;
            finalTitle = config.title || 'Alert';
            finalMessage = config.message || JSON.stringify(config);
            finalButtons = config.buttons || [];
            finalType = config.type || 'info';
        }

        // Wrap buttons to ensure they close modal if not explicit
        const wrappedButtons = finalButtons.length > 0 ? finalButtons.map(btn => ({
            ...btn,
            onPress: () => {
                if (btn.onPress) btn.onPress();
                hideAlert();
            }
        })) : [
            { text: 'OK', onPress: hideAlert, style: 'default' }
        ];

        setAlertConfig({
            visible: true,
            title: finalTitle,
            message: finalMessage,
            buttons: wrappedButtons,
            type: finalType
        });
    }, []);

    const hideAlert = useCallback(() => {
        setAlertConfig(prev => ({ ...prev, visible: false }));
    }, []);

    return (
        <AlertContext.Provider value={{ showAlert, hideAlert }}>
            {children}
            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                buttons={alertConfig.buttons}
                type={alertConfig.type}
                onClose={hideAlert}
            />
        </AlertContext.Provider>
    );
};

export const useAlert = () => {
    const context = useContext(AlertContext);
    if (!context) {
        throw new Error("useAlert must be used within an AlertProvider");
    }
    return context;
};
