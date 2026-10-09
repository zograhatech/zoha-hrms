const Setting = require('../models/Setting');

const checkSubscription = (requiredPlan = 'free') => {
    return async (req, res, next) => {
        // Feature Restricted logic removed - all features are now accessible to all plans
        return next();
    };
};

module.exports = checkSubscription;
