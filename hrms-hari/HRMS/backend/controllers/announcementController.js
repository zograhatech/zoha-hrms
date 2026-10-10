const Announcement = require('../models/Announcement');

exports.createAnnouncement = async (req, res) => {
    try {
        const { title, content, priority, expires_at } = req.body;
        const announcement = await Announcement.create({
            title,
            content,
            priority,
            expires_at,
            created_by: req.user._id
        });

        res.status(201).json({
            success: true,
            announcement
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error creating announcement',
            error: error.message
        });
    }
};

exports.getActiveAnnouncements = async (req, res) => {
    try {
        const announcements = await Announcement.find({
            is_active: true,
            $or: [
                { expires_at: { $exists: false } },
                { expires_at: null },
                { expires_at: { $gte: new Date() } }
            ]
        })
            .populate('created_by', 'name')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            announcements
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching announcements',
            error: error.message
        });
    }
};

exports.deleteAnnouncement = async (req, res) => {
    try {
        await Announcement.findByIdAndUpdate(req.params.id, { is_active: false });
        res.status(200).json({
            success: true,
            message: 'Announcement deactivated successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deactivating announcement',
            error: error.message
        });
    }
};
