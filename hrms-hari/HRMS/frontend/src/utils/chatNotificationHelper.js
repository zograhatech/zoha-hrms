/**
 * Chat Notification Helper
 * Handles sound, desktop Notification API, and notification preferences.
 */

// Play a subtle modern chime using Web Audio API (no external file needed)
export const playNotificationSound = () => {
    try {
        const prefs = getNotificationPreferences();
        if (!prefs.sound) return;

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
    } catch (_) {
        // Fallback to audio element if Web Audio API fails
        try {
            const audio = new Audio('/notification.mp3');
            audio.volume = 0.3;
            audio.play().catch(() => {});
        } catch (e) {}
    }
};

// Notification Preferences
export const getNotificationPreferences = () => {
    try {
        const stored = localStorage.getItem('hrms_notif_prefs');
        if (stored) return JSON.parse(stored);
    } catch (_) {}
    return {
        inApp: true,
        desktop: true,
        sound: true
    };
};

export const saveNotificationPreferences = (prefs) => {
    try {
        localStorage.setItem('hrms_notif_prefs', JSON.stringify(prefs));
    } catch (_) {}
};

// Desktop Notification API check and request
export const checkDesktopNotificationSupport = () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        return { supported: false, permission: 'unsupported' };
    }
    return { supported: true, permission: Notification.permission };
};

export const requestDesktopNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        return 'unsupported';
    }
    try {
        const perm = await Notification.requestPermission();
        return perm;
    } catch (_) {
        return Notification.permission;
    }
};

export const showDesktopNotification = (title, body, conversationId, onClick) => {
    const prefs = getNotificationPreferences();
    if (!prefs.desktop) return null;

    if (typeof window === 'undefined' || !('Notification' in window)) return null;
    if (Notification.permission !== 'granted') return null;

    // Only trigger desktop alert if tab is currently in background or hidden
    if (document.visibilityState === 'visible') return null;

    try {
        const notif = new Notification(title || 'Zograha HRMS Message', {
            body: body || 'New message received',
            icon: '/favicon.ico',
            tag: conversationId ? `conv_${conversationId}` : undefined,
            renotify: true
        });

        notif.onclick = () => {
            window.focus();
            if (onClick) onClick();
            notif.close();
        };

        return notif;
    } catch (e) {
        console.warn('Desktop notification display failed:', e);
        return null;
    }
};

// Document title unread counter
let originalTitle = typeof document !== 'undefined' ? document.title : 'Zograha Technologies';
export const updateDocumentTitleUnread = (count) => {
    if (typeof document === 'undefined') return;
    if (!originalTitle || originalTitle.startsWith('(')) {
        originalTitle = 'Zograha Technologies HRMS';
    }
    if (count > 0) {
        document.title = `(${count > 99 ? '99+' : count}) ${originalTitle}`;
    } else {
        document.title = originalTitle;
    }
};
