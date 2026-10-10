const zoomService = require('./zoom.service');
const oauthService = require('./zoom.oauth');

// --- S2S OAuth doesn't need authorize and callback routes. They are removed. ---

// @route   POST /api/zoom/meetings
const createMeeting = async (req, res) => {
    try {
        const meetingData = {
            ...req.body,
            host_id: req.user.id,
            senderObjectId: req.user._id // The actual MongoDB _id for proper referencing
        };
        // Use user's ID as hrAdminId if they connected their own Zoom, otherwise fallback to system default in service
        const meeting = await zoomService.createMeeting(meetingData, req.user.id);
        res.status(201).json({ success: true, meeting });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @route   GET /api/zoom/meetings
const getMeetings = async (req, res) => {
    try {
        const { type, department, status } = req.query;
        let filters = {};
        if (type) filters.type = type;
        if (department) filters.department = department;
        if (status) filters.status = status;
        
        // Filter: only show meetings where the user is the host OR in the participants list
        // Exception: hr_manager might need to see all, but let's restrict to participants/host for now per request.
        if (req.user && req.user.role !== 'hr_manager') {
            filters.$or = [
                { host_id: req.user.id },
                { participants: req.user._id }
            ];
        }

        const meetings = await zoomService.getMeetings(filters);
        res.json({ success: true, meetings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @route   DELETE /api/zoom/meetings/:id
const deleteMeeting = async (req, res) => {
    try {
        await zoomService.deleteMeeting(req.params.id, req.user.id);
        res.json({ success: true, message: 'Meeting cancelled successfully' });
    } catch (error) {
        console.error('[ZoomController] Delete Error:', error.message);
        res.status(500).json({ success: false, message: error.message || 'Failed to cancel meeting' });
    }
};

// @route   POST /api/zoom/instant
const createInstantMeeting = async (req, res) => {
    try {
        const { topic, participantIds } = req.body;
        const meeting = await zoomService.createInstantMeeting(
            req.user.id, 
            req.user._id, 
            participantIds || [], 
            topic
        );
        res.status(201).json({ success: true, meeting });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @route   GET /api/zoom/config
const getConfig = async (req, res) => {
    try {
        const config = await zoomService.getConfig();
        res.json({ success: true, config });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @route   POST /api/zoom/config
const saveConfig = async (req, res) => {
    try {
        const { account_id, client_id, client_secret, webhook_secret } = req.body;
        await zoomService.saveConfig(account_id, client_id, client_secret, webhook_secret);
        
        // S2S auth token is generated immediately upon config save
        await oauthService.getServerToServerToken();
        
        res.json({ success: true, message: 'Zoom S2S configuration saved and connected successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @route   PATCH /api/zoom/meetings/:id/end
const endMeeting = async (req, res) => {
    try {
        await zoomService.endMeeting(req.params.id, req.user.id);
        res.json({ success: true, message: 'Meeting ended successfully' });
    } catch (error) {
        console.error('[ZoomController] End Error:', error.message);
        res.status(500).json({ success: false, message: error.message || 'Failed to end meeting' });
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
