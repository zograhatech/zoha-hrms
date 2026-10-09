const Asset = require('../models/Asset');

exports.getAssets = async (req, res) => {
    try {
        const query = req.user.role === 'employee' ? { assigned_to: req.user.id } : {};
        const assets = await Asset.find(query).sort({ createdAt: -1 });
        res.json({ success: true, assets });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.createAsset = async (req, res) => {
    try {
        const asset = await Asset.create(req.body);
        res.status(201).json({ success: true, message: 'Asset created', asset });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateAsset = async (req, res) => {
    try {
        const asset = await Asset.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, message: 'Asset updated', asset });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteAsset = async (req, res) => {
    try {
        await Asset.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Asset deleted' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
