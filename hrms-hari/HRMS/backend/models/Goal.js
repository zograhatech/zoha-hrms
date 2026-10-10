const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
    employee_id: { type: String, ref: 'Employee', default: null }, // Null if Org/Team goal
    creator_id: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['individual', 'team', 'organization'], 
        default: 'individual' 
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    
    // SMART Configuration
    smart_details: {
        specific: { type: String },
        measurable: { type: String },
        achievable: { type: String },
        relevant: { type: String },
        time_bound: { type: String }
    },

    // KPI Management
    kpis: [{
        name: { type: String, required: true },
        target: { type: Number, required: true },
        current: { type: Number, default: 0 },
        unit: { type: String, default: '%' }, // %, Number, Currency, etc.
        weight: { type: Number, default: 10 }, // 1-100
        last_updated: { type: Date, default: Date.now }
    }],

    // Cascading & Relations
    parent_goal_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Goal', default: null },
    
    // Progress Tracking
    progress: { type: Number, default: 0 }, // 0-100, can be auto-calculated
    status: { 
        type: String, 
        enum: ['draft', 'active', 'on_hold', 'completed', 'cancelled'], 
        default: 'draft' 
    },
    
    start_date: { type: Date, default: Date.now },
    due_date: { type: Date, required: true },
    
    // Reviews & Feedback
    reviews: [{
        reviewer_id: { type: String },
        feedback: { type: String },
        date: { type: Date, default: Date.now },
        rating: { type: Number, min: 1, max: 5 }
    }]
}, { timestamps: true });

// Auto-calculate progress based on KPI weightage
goalSchema.pre('save', function(next) {
    if (this.kpis && this.kpis.length > 0) {
        let totalWeight = 0;
        let weightedProgress = 0;
        
        this.kpis.forEach(kpi => {
            const kpiProgress = Math.min((kpi.current / kpi.target) * 100, 100);
            weightedProgress += (kpiProgress * (kpi.weight || 1));
            totalWeight += (kpi.weight || 1);
        });
        
        if (totalWeight > 0) {
            this.progress = Math.round(weightedProgress / totalWeight);
        }
    }
    next();
});

module.exports = mongoose.models.Goal || mongoose.model('Goal', goalSchema);
