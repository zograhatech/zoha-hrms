// Listen for push events
self.addEventListener('push', (event) => {
    let data = { title: 'New Notification', body: 'You have a new message.' };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }
    
    const options = {
        body: data.body || 'You have a new message.',
        icon: data.icon || '/company_logo.png',
        badge: '/company_logo.png',
        data: {
            url: data.data?.url || data.url || '/'
        },
        vibrate: [100, 50, 100],
        actions: [
            { action: 'open', title: 'Open App' }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || 'HRMS Notification', options)
    );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    const urlToOpen = event.notification?.data?.url || '/';
    
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Check if there is already a window open and focus it, or open a new one
            for (let client of windowClients) {
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(urlToOpen);
            }
        })
    );
});
