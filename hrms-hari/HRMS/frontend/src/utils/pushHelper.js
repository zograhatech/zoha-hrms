import API from '../api/axios';

/**
 * Checks if browser push notifications are supported and permitted on this device/environment.
 * Returns { supported: boolean, message?: string }
 */
export const checkPushSupport = () => {
    if (typeof window === 'undefined') return { supported: false, message: 'Push not supported' };
    
    // Check basic browser support
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        return { supported: false, message: 'Push notifications not supported on this browser' };
    }

    // iOS Safari check: only supported in standalone (PWA installed to Home Screen) mode on iOS 16.4+
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    if (isIOS && !isStandalone) {
        return { supported: false, message: 'On iOS, install app to Home Screen to enable alerts' };
    }

    return { supported: true };
};

/**
 * Registers the Service Worker on page load with scope '/'
 */
export const registerServiceWorker = async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
    try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        return registration;
    } catch (err) {
        console.error('ServiceWorker registration error:', err);
        return null;
    }
};

/**
 * Returns current push subscription from PushManager if one exists
 */
export const getExistingSubscription = async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        return null;
    }
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        return subscription;
    } catch (err) {
        console.error('Failed to get existing push subscription:', err);
        return null;
    }
};

/**
 * Register Service Worker and Subscribe for Push Notifications upon explicit user action
 */
export const subscribeToPushNotifications = async () => {
    const support = checkPushSupport();
    if (!support.supported) {
        return { success: false, reason: support.message };
    }

    try {
        // 1. Request Permission explicitly from user gesture
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            return { success: false, reason: 'Permission denied by user' };
        }

        // 2. Register Service Worker with scope '/'
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        
        // 3. Get Public VAPID Key from backend
        const { data } = await API.get('/notifications/vapid-key');
        const publicKey = data.publicKey;
        
        if (!publicKey) {
            console.error('❌ VAPID Public Key not found.');
            return { success: false, reason: 'VAPID key not configured' };
        }

        // 4. Subscribe the user
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
        });

        // 5. Send subscription to the backend
        await API.post('/notifications/subscribe', subscription);
        
        return { success: true };
    } catch (error) {
        console.error('Push Notification registration failed:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Helper to convert URL safely for VAPID key
 * @param {string} base64String 
 * @returns {Uint8Array}
 */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
