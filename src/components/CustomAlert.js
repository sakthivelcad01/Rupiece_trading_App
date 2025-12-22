import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { AlertCircle, CheckCircle, Info, XCircle } from 'lucide-react-native';

const { width } = Dimensions.get('window');

const CustomAlert = ({ visible, title, message, buttons = [], onClose, type = 'info' }) => {
    if (!visible) return null;

    // Default button if none provided
    const actionButtons = buttons.length > 0 ? buttons : [
        { text: 'OK', onPress: onClose, style: 'default' }
    ];

    const getIcon = () => {
        switch (type) {
            case 'success': return <CheckCircle size={48} color="#22c55e" />;
            case 'error': return <XCircle size={48} color="#ef4444" />;
            case 'warning': return <AlertCircle size={48} color="#f59e0b" />;
            default: return <Info size={48} color="#3b82f6" />;
        }
    };

    return (
        <Modal
            transparent
            animationType="fade"
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.alertContainer}>
                    <View style={styles.iconContainer}>
                        {getIcon()}
                    </View>

                    <Text style={styles.title}>{title}</Text>
                    {message ? <Text style={styles.message}>{message}</Text> : null}

                    <View style={styles.buttonContainer}>
                        {actionButtons.map((btn, index) => (
                            <TouchableOpacity
                                key={index}
                                style={[
                                    styles.button,
                                    btn.style === 'cancel' ? styles.cancelButton : styles.defaultButton,
                                    btn.style === 'destructive' ? styles.destructiveButton : null,
                                    // Add margin if multiple buttons (not last one)
                                    index < actionButtons.length - 1 && styles.buttonSpacer
                                ]}
                                onPress={() => {
                                    if (btn.onPress) btn.onPress();
                                    // Usually context handles closing, but we can call onClose here too if needed logic
                                    // For now, reliance on button handler calling hideAlert is key, OR we wrap it.
                                    // Actually, context wrapper should handle this. Let's assume onPress handles it unless it's just a close.
                                    // We'll rely on the mapped function from context.
                                }}
                            >
                                <Text style={[
                                    styles.buttonText,
                                    btn.style === 'cancel' && styles.cancelText,
                                    btn.style === 'destructive' && styles.destructiveText
                                ]}>
                                    {btn.text}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center'
    },
    alertContainer: {
        width: width * 0.85,
        backgroundColor: '#1a1a1a',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10
    },
    iconContainer: {
        marginBottom: 16
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
        textAlign: 'center'
    },
    message: {
        fontSize: 16,
        color: '#ccc',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22
    },
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        width: '100%'
    },
    button: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
        minWidth: 100,
        alignItems: 'center',
        flex: 1
    },
    buttonSpacer: {
        marginRight: 10
    },
    defaultButton: {
        backgroundColor: '#22c55e'
    },
    cancelButton: {
        backgroundColor: '#333'
    },
    destructiveButton: {
        backgroundColor: '#ef4444'
    },
    buttonText: {
        color: '#000',
        fontWeight: 'bold',
        fontSize: 16
    },
    cancelText: {
        color: '#fff'
    },
    destructiveText: {
        color: '#fff'
    }
});

export default CustomAlert;
