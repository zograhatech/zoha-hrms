const mongoose = require('mongoose');

const copilotSessionSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true },
    intent: { type: String, default: null },
    step: { type: Number, default: 0 },
    data: { type: Object, default: {} },
    history: { type: Array, default: [] },
    loggedInEmployeeId: { type: String, default: null },
    last_active: { type: Date, default: Date.now, index: { expires: '1h' } } // Auto-delete after 1 hour of inactivity
}, { timestamps: true });

module.exports = mongoose.models.CopilotSession || mongoose.model('CopilotSession', copilotSessionSchema);
