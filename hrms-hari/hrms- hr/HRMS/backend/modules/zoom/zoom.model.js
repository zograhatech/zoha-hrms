const mongoose = require('mongoose');

const zoomIntegrationSchema = new mongoose.Schema({
    hr_admin_id: { type: String, required: true }, // Referencing Employee ID or custom admin ID
    zoom_account_id: { type: String },
    encrypted_access_token: { type: String, required: true },
    encrypted_refresh_token: { type: String, required: true },
    expires_at: { type: Date, required: true },
    is_active: { type: Boolean, default: true }
}, { timestamps: true });

const zoomAppConfigSchema = new mongoose.Schema({
    account_id: { type: String, required: true },
    client_id: { type: String, required: true },
    encrypted_client_secret: { type: String, required: true },
    encrypted_webhook_secret: { type: String, required: true },
    is_configured: { type: Boolean, default: true }
}, { timestamps: true });

const zoomMeetingSchema = new mongoose.Schema({
    meeting_id: { type: String, required: true, unique: true }, // Our internal ID
    zoom_meeting_id: { type: String }, // Actual Zoom meeting ID string
    topic: { type: String, required: true },
    host_id: { type: String, required: true }, // HRMS employee ID
    department: { type: String, default: 'General' },
    start_time: { type: Date, required: true },
    duration: { type: Number, required: true }, // in minutes
    join_url: { type: String },
    start_url: { type: String },
    created_by: { type: String, required: true }, // HRMS employee ID
    status: { type: String, enum: ['scheduled', 'started', 'ended', 'cancelled'], default: 'scheduled' },
    type: { type: String, enum: ['interview', 'team', 'hr_consultation', 'training', 'general'], default: 'general' },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }],
    message: { type: String }
}, { timestamps: true });

const zoomParticipantSchema = new mongoose.Schema({
    meeting_id: { type: String, required: true }, // Our internal ID or Zoom's
    employee_id: { type: String },
    participant_uuid: { type: String },
    participant_name: { type: String },
    join_time: { type: Date },
    leave_time: { type: Date },
    duration: { type: Number } // in seconds
}, { timestamps: true });

const ZoomIntegration = mongoose.models.ZoomIntegration || mongoose.model('ZoomIntegration', zoomIntegrationSchema);
const ZoomAppConfig = mongoose.models.ZoomAppConfig || mongoose.model('ZoomAppConfig', zoomAppConfigSchema);
const ZoomMeeting = mongoose.models.ZoomMeeting || mongoose.model('ZoomMeeting', zoomMeetingSchema);
const ZoomParticipant = mongoose.models.ZoomParticipant || mongoose.model('ZoomParticipant', zoomParticipantSchema);

module.exports = {
    ZoomIntegration,
    ZoomAppConfig,
    ZoomMeeting,
    ZoomParticipant
};
