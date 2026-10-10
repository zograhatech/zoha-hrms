import API from '../api/axios';

/**
 * Register Service Worker and Subscribe for Push Notifications
 */
export const subscribeToPushNotifications = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push Notifications not supported by this browser.');
        return;
    }

    try {
        // 1. Register Service Worker
        const registration = await navigator.serviceWorker.register('/sw.js');
        
        // 2. Get Public VAPID Key from backend
        const { data } = await API.get('/notifications/vapid-key');
        const publicKey = data.publicKey;
        
        if (!publicKey) {
            console.error('❌ VAPID Public Key not found. Please ensure VAPID_PUBLIC_KEY is set in your Vercel Environment Variables.');
            return;
        }

        // 3. Request Permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('Push Notification permission denied.');
            return;
        }

        // 4. Subscribe the user
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
        });

        // 5. Send subscription to the backend
        await API.post('/notifications/subscribe', subscription);
        
        console.log('Push Notification subscription successful.');
    } catch (error) {
        console.error('Push Notification registration failed:', error);
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
