module.exports = (req, res) => {
    res.json({
        success: true,
        message: '🚀 Standalone test endpoint is working!',
        timestamp: new Date().toISOString()
    });
};
