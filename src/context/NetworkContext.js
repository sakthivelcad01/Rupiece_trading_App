import React, { createContext, useContext, useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

const NetworkContext = createContext({
    isConnected: true,
    isInternetReachable: true,
});

export const NetworkProvider = ({ children }) => {
    const [networkState, setNetworkState] = useState({
        isConnected: true,
        isInternetReachable: true,
    });

    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(state => {
            setNetworkState({
                isConnected: state.isConnected,
                isInternetReachable: state.isInternetReachable,
            });
        });

        return () => unsubscribe();
    }, []);

    return (
        <NetworkContext.Provider value={networkState}>
            {children}
        </NetworkContext.Provider>
    );
};

export const useNetwork = () => useContext(NetworkContext);
