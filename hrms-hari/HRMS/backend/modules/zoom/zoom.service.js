const { getZoomApiClient } = require('./zoom.oauth');
const { ZoomMeeting, ZoomAppConfig } = require('./zoom.model');
const cryptoHelper = require('./zoom.crypto');
const crypto = require('crypto');

const { sendNotification } = require('../../services/notification.service');
const { sendEmail } = require('../../utils/emailService');
const Employee = require('../../models/Employee');

/**
 * Create a new Zoom meeting
 */
const createMeeting = async (meetingDetails, hrAdminId) => {
    const zoomClient = await getZoomApiClient(hrAdminId);

    const zoomPayload = {
        topic: meetingDetails.topic,
        type: meetingDetails.isInstant ? 1 : 2,
        timezone: 'UTC', // Defaulting to UTC for APIs, handled by frontend normally
        settings: {
            host_video: true,
            participant_video: true,
            join_before_host: true,
            jbh_time: 5, // Join 5 minutes before
            mute_upon_entry: true,
            waiting_room: true
        }
    };

    if (!meetingDetails.isInstant) {
        zoomPayload.start_time = new Date(meetingDetails.start_time).toISOString();
        zoomPayload.duration = meetingDetails.duration;
    }

    try {
        const response = await zoomClient.post('/users/me/meetings', zoomPayload);
        const zMeeting = response.data;

        // Save internal reference
        const newMeeting = await ZoomMeeting.create({
            meeting_id: `zm_${crypto.randomBytes(8).toString('hex')}`,
            zoom_meeting_id: zMeeting.id.toString(),
            topic: meetingDetails.topic,
            host_id: meetingDetails.host_id,
            department: meetingDetails.department || 'General',
            start_time: meetingDetails.isInstant ? new Date() : new Date(meetingDetails.start_time),
            duration: meetingDetails.isInstant ? 60 : meetingDetails.duration,
            join_url: zMeeting.join_url,
            start_url: zMeeting.start_url,
            created_by: meetingDetails.host_id,
            status: 'scheduled',
            type: meetingDetails.type || 'general',
            participants: meetingDetails.participantIds || [],
            message: meetingDetails.message
        });

        // Trigger Notifications for participants
        if (newMeeting.participants && newMeeting.participants.length > 0) {
            const employees = await Employee.find({ _id: { $in: newMeeting.participants } });
            
            // 1. In-App Notifications (Real-time + DB)
            for (const emp of employees) {
                await sendNotification({
                    recipient: emp._id,
                    type: 'meeting',
                    title: 'New Zoom Meeting Invite',
                    message: `You have been invited to: ${newMeeting.topic}`,
                    data: {
                        meetingId: newMeeting.meeting_id,
                        link: newMeeting.join_url,
                        topic: newMeeting.topic,
                        message: newMeeting.message
                    }
                });
            }

            // 2. Email Notifications
            for (const emp of employees) {
                await sendEmail({
                    to: emp.email,
                    subject: `Meeting Invite: ${newMeeting.topic}`,
                    html: `
                        <h2>Zoom Meeting Invite</h2>
                        <p>Hi <b>${emp.name}</b>,</p>
                        <p>You have been invited to a Zoom meeting: <b>${newMeeting.topic}</b></p>
                        <p><b>Time:</b> ${newMeeting.start_time.toLocaleString()}</p>
                        <p><b>Link:</b> <a href="${newMeeting.join_url}" style="color: #6366f1; font-weight: bold;">Join Meeting Now</a></p>
                        <p>See you there!</p>
                    `
                });
            }
        }

        return newMeeting;
    } catch (error) {
        console.error('Zoom Create API Error:', error.response?.data || error.message);
        throw new Error('Failed to create Zoom meeting.');
    }
};

/**
 * Get Meeting details internally
 */
const getMeetings = async (filters) => {
    return await ZoomMeeting.find(filters)
        .populate('participants', 'name email profile_image')
        .sort({ start_time: -1 })
        .lean();
};

/**
 * Delete a Zoom Meeting
 */
const deleteMeeting = async (internalMeetingId, hrAdminId) => {
    const meeting = await ZoomMeeting.findOne({ meeting_id: internalMeetingId });
    if (!meeting) throw new Error('Meeting not found.');

    const zoomClient = await getZoomApiClient(hrAdminId);

    try {
        await zoomClient.delete(`/meetings/${meeting.zoom_meeting_id}`);
        meeting.status = 'cancelled';
        await meeting.save();
        return true;
    } catch (error) {
        const errorMsg = error.response?.data?.message || error.message;
        console.error('Zoom Delete API Error:', error.response?.data || error.message);
        // If already deleted, just proceed
        if (error.response?.status === 404) {
            meeting.status = 'cancelled';
            await meeting.save();
            return true;
        }
        throw new Error(`Zoom API Error: ${errorMsg}`);
    }
};

/**
 * Instant Meeting shortcut
 */
const createInstantMeeting = async (hostId, senderObjectId, participantIds = [], topic = 'Instant Meeting') => {
    return await createMeeting({
        topic,
        host_id: hostId,
        senderObjectId,
        participantIds,
        department: 'General',
        isInstant: true,
        type: 'general'
    }); // Assumes system-wide zoom connection
};

/**
 * Get Zoom App Config Status (hides secrets)
 */
const getConfig = async () => {
    const config = await ZoomAppConfig.findOne({});
    if (!config) return { is_configured: false };
    
    return {
        is_configured: config.is_configured,
        account_id: config.account_id,
        client_id: config.client_id ? `${config.client_id.substring(0, 4)}***` : ''
    };
};

/**
 * Save Zoom App Config securely
 */
const saveConfig = async (account_id, client_id, client_secret, webhook_secret) => {
    if (!account_id || !client_id) {
        throw new Error('Please provide Account ID and Client ID.');
    }

    // Only update secrets if they are provided (allowing partial updates)
    const updateData = {
        account_id,
        client_id,
        is_configured: true
    };

    if (client_secret) {
        updateData.encrypted_client_secret = cryptoHelper.encrypt(client_secret);
    }
    if (webhook_secret) {
        updateData.encrypted_webhook_secret = cryptoHelper.encrypt(webhook_secret);
    }

    await ZoomAppConfig.findOneAndUpdate(
        {},
        updateData,
        { upsert: true, new: true }
    );
};

/**
 * End a Zoom Meeting (Terminates live session)
 */
const endMeeting = async (internalMeetingId, hrAdminId) => {
    const meeting = await ZoomMeeting.findOne({ meeting_id: internalMeetingId });
    if (!meeting) throw new Error('Meeting not found.');

    const zoomClient = await getZoomApiClient(hrAdminId);

    try {
        // Zoom API to end meeting
        await zoomClient.put(`/meetings/${meeting.zoom_meeting_id}/status`, {
            action: 'end'
        });
        
        meeting.status = 'ended';
        await meeting.save();
        return true;
    } catch (error) {
        const errorMsg = error.response?.data?.message || error.message;
        console.error('Zoom End API Error:', error.response?.data || error.message);
        // If meeting already ended or not started, we still mark it as ended in DB
        if (error.response?.status === 400 || error.response?.status === 404) {
             meeting.status = 'ended';
             await meeting.save();
             return true;
        }
        throw new Error(`Zoom API Error: ${errorMsg}`);
    }
};

module.exports = {
    createMeeting,
    getMeetings,
    deleteMeeting,
    createInstantMeeting,
    endMeeting,
    getConfig,
    saveConfig
};
