const axios = require('axios');
const querystring = require('querystring');
const { ZoomIntegration, ZoomAppConfig } = require('./zoom.model');
const { encrypt, decrypt } = require('./zoom.crypto');

const ZOOM_OAUTH_ENDPOINT = 'https://zoom.us/oauth/token';
const ZOOM_API_BASE_URL = 'https://api.zoom.us/v2';

/**
 * Helper to get S2S DB config securely
 */
const getZoomDBConfig = async () => {
    const config = await ZoomAppConfig.findOne({});
    if (!config || !config.is_configured || !config.account_id) {
        throw new Error('Zoom S2S Integration is not fully configured (Missing Account ID, Client ID, or Secret).');
    }
    return {
        ACCOUNT_ID: config.account_id,
        CLIENT_ID: config.client_id,
        CLIENT_SECRET: decrypt(config.encrypted_client_secret)
    };
};

/**
 * Fetch a Server-to-Server Access Token
 */
const getServerToServerToken = async () => {
    const { ACCOUNT_ID, CLIENT_ID, CLIENT_SECRET } = await getZoomDBConfig();
    const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    
    try {
        const response = await axios.post(ZOOM_OAUTH_ENDPOINT, querystring.stringify({
            grant_type: 'account_credentials',
            account_id: ACCOUNT_ID
        }), {
            headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { access_token, expires_in } = response.data;
        
        // Calculate expiry date (usually 1 hour)
        const expiresAt = new Date(Date.now() + (expires_in * 1000) - 60000); // 1 min buffer

        // S2S uses a single system-wide integration identity
        await ZoomIntegration.findOneAndUpdate(
            { hr_admin_id: 'system_s2s' },
            {
                hr_admin_id: 'system_s2s',
                zoom_account_id: ACCOUNT_ID,
                encrypted_access_token: encrypt(access_token),
                // S2S doesn't use refresh tokens, we just get a completely new access token
                encrypted_refresh_token: encrypt('s2s_no_refresh_needed'), 
                expires_at: expiresAt,
                is_active: true
            },
            { upsert: true, new: true }
        );

        return access_token;
    } catch (error) {
        console.error('Error getting Zoom S2S OAuth token:', error.response?.data || error.message);
        
        if (error.response?.data?.error === 'invalid_client') {
            throw new Error('Zoom rejected the credentials. Verify your Client ID and Client Secret.');
        } else {
             throw new Error(`Zoom API Error: ${error.response?.data?.reason || error.message}`);
        }
    }
};

/**
 * Get a valid access token (requests a new one if expired for S2S)
 */
const getValidAccessToken = async () => {
    const integration = await ZoomIntegration.findOne({ hr_admin_id: 'system_s2s', is_active: true });

    if (!integration) {
        // If not connected yet but DB is configured, try to fetch one now
        return await getServerToServerToken();
    }

    // Check if token is expired or about to expire
    if (new Date() >= integration.expires_at) {
        // Just fetch a brand new one for S2S
        return await getServerToServerToken();
    }

    return decrypt(integration.encrypted_access_token);
};

/**
 * Generate a configured Axios instance for Zoom API calls
 */
const getZoomApiClient = async () => {
    const token = await getValidAccessToken();
    
    return axios.create({
        baseURL: ZOOM_API_BASE_URL,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
};

module.exports = {
    getServerToServerToken,
    getValidAccessToken,
    getZoomApiClient
};
