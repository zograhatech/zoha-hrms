/**
 * Hosted Realtime Service (Pusher Channels via HTTP REST API)
 * Enables instant sub-50ms event delivery across Vercel Serverless lambdas
 * without requiring persistent server WebSockets.
 * Gracefully falls back to polling when credentials are not configured.
 */

const crypto = require('crypto');
const axios = require('axios');

const isRealtimeEnabled = () => {
    return Boolean(
        process.env.PUSHER_APP_ID &&
        process.env.PUSHER_KEY &&
        process.env.PUSHER_SECRET
    );
};

/**
 * Trigger an event via Pusher HTTP REST API
 * @param {string|string[]} channels - Single channel string or array of channels
 * @param {string} event - Event name
 * @param {object} data - Payload to send
 */
async function triggerRealtime(channels, event, data) {
    if (!isRealtimeEnabled()) {
        return false;
    }

    const appId = process.env.PUSHER_APP_ID;
    const key = process.env.PUSHER_KEY;
    const secret = process.env.PUSHER_SECRET;
    const cluster = process.env.PUSHER_CLUSTER || 'mt1';

    const channelList = Array.isArray(channels) ? channels : [channels];
    const bodyObj = {
        name: event,
        channels: channelList,
        data: typeof data === 'string' ? data : JSON.stringify(data)
    };
    const bodyStr = JSON.stringify(bodyObj);

    const bodyMd5 = crypto.createHash('md5').update(bodyStr).digest('hex');
    const authTimestamp = Math.floor(Date.now() / 1000);
    const authVersion = '1.0';

    const stringToSign = [
        'POST',
        `/apps/${appId}/events`,
        `auth_key=${key}&auth_timestamp=${authTimestamp}&auth_version=${authVersion}&body_md5=${bodyMd5}`
    ].join('\n');

    const authSignature = crypto.createHmac('sha256', secret).update(stringToSign).digest('hex');

    const url = `https://api-${cluster}.pusher.com/apps/${appId}/events?auth_key=${key}&auth_timestamp=${authTimestamp}&auth_version=${authVersion}&body_md5=${bodyMd5}&auth_signature=${authSignature}`;

    try {
        await axios.post(url, bodyObj, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 3000
        });
        return true;
    } catch (err) {
        console.warn(`[RealtimeService] Pusher trigger failed: ${err.message}`);
        return false;
    }
}

module.exports = {
    triggerRealtime,
    isRealtimeEnabled
};
