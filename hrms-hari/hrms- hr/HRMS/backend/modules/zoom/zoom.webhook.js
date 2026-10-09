const crypto = require('crypto');
const { ZoomMeeting, ZoomParticipant, ZoomAppConfig } = require('./zoom.model');
const { decrypt } = require('./zoom.crypto');

/**
 * Endpoint to receive Zoom Server-To-Server Webhooks
 */
const handleWebhook = async (req, res) => {
    try {
        const { event, payload } = req.body;

        // Fetch config once
        const config = await ZoomAppConfig.findOne({});
        
        // If config is missing but it's just a validation ping, we still need to respond.
        // We will try to pull the secret, but if it doesn't exist, we will use a blank string 
        // just to keep the server from crashing with a 500 error so Zoom can at least hit the endpoint.
        let ZOOM_WEBHOOK_SECRET_TOKEN = '';
        if (config && config.encrypted_webhook_secret) {
            ZOOM_WEBHOOK_SECRET_TOKEN = decrypt(config.encrypted_webhook_secret);
        }

        if (!ZOOM_WEBHOOK_SECRET_TOKEN && event !== 'endpoint.url_validation') {
            return res.status(500).send('Zoom integration is not configured.');
        }

        // Zoom Endpoint URL Validation
        if (event === 'endpoint.url_validation') {
            const hashForValidate = crypto.createHmac('sha256', ZOOM_WEBHOOK_SECRET_TOKEN)
                .update(payload.plainToken)
                .digest('hex');

            return res.status(200).json({
                plainToken: payload.plainToken,
                encryptedToken: hashForValidate
            });
        }

        // Verify webhook signature
        const signature = req.headers['x-zm-signature'];
        const requestTimestamp = req.headers['x-zm-request-timestamp'];
        const message = `v0:${requestTimestamp}:${JSON.stringify(req.body)}`;

        const hashForVerify = crypto.createHmac('sha256', ZOOM_WEBHOOK_SECRET_TOKEN)
            .update(message)
            .digest('hex');

        const signatureString = `v0=${hashForVerify}`;

        if (signature !== signatureString) {
            return res.status(401).send('Unauthorized request to Zoom Webhook.');
        }

        // Handle Events
        const meetingId = payload.object?.id?.toString();

        switch (event) {
            case 'meeting.started':
                await ZoomMeeting.findOneAndUpdate(
                    { zoom_meeting_id: meetingId },
                    { status: 'started' }
                );
                break;

            case 'meeting.ended':
                await ZoomMeeting.findOneAndUpdate(
                    { zoom_meeting_id: meetingId },
                    { status: 'ended' }
                );
                break;

            case 'meeting.participant_joined':
                await ZoomParticipant.create({
                    meeting_id: meetingId,
                    participant_uuid: payload.object.participant.user_id,
                    participant_name: payload.object.participant.user_name,
                    join_time: new Date(payload.object.participant.join_time)
                });
                break;

            case 'meeting.participant_left':
                await ZoomParticipant.findOneAndUpdate(
                    { 
                        meeting_id: meetingId, 
                        participant_uuid: payload.object.participant.user_id,
                        leave_time: { $exists: false } // ensure we update the active log
                    },
                    { leave_time: new Date(payload.object.participant.leave_time) },
                    { sort: { join_time: -1 } }
                );
                break;
        }

        res.status(200).send('Webhook Received');
    } catch (error) {
        console.error('Zoom Webhook Error:', error);
        res.status(500).send('Server Error');
    }
};

module.exports = {
    handleWebhook
};
