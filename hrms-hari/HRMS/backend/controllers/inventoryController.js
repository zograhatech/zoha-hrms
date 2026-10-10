const Item = require('../models/Item');
const StockTransaction = require('../models/StockTransaction');

// ─── ITEMS ────────────────────────────────────────────

const getItems = async (req, res) => {
    try {
        const items = await Item.find().sort({ name: 1 });
        res.json({ success: true, items });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const createItem = async (req, res) => {
    try {
        const { name, group, unit, opening_stock, purchase_price, selling_price, low_stock_threshold, description } = req.body;
        const newItem = new Item({
            name, group, unit, 
            opening_stock, 
            current_stock: opening_stock, 
            purchase_price, 
            selling_price, 
            low_stock_threshold, 
            description
        });
        await newItem.save();
        res.status(201).json({ success: true, item: newItem });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// ─── STOCK TRANSACTIONS ────────────────────────────────

const getStockTransactions = async (req, res) => {
    try {
        const transactions = await StockTransaction.find()
            .populate('item')
            .sort({ date: -1 });
        res.json({ success: true, transactions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const createStockTransaction = async (req, res) => {
    try {
        const { date, item_id, type, quantity, rate, ref_no, narration } = req.body;
        
        const item = await Item.findById(item_id);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        const total_amount = quantity * rate;
        
        const newTx = new StockTransaction({
            date,
            item: item_id,
            type,
            quantity,
            rate,
            total_amount,
            ref_no,
            narration
        });

        // Update current stock
        // Purchase/Return Inward adds to stock, Sales/Return Outward subtracts
        if (type === 'Purchase' || (type === 'Adjustment' && quantity > 0)) {
            item.current_stock += Number(quantity);
        } else if (type === 'Sales' || (type === 'Adjustment' && quantity < 0)) {
            item.current_stock -= Math.abs(Number(quantity));
        }

        await newTx.save();
        await item.save();

        res.status(201).json({ success: true, transaction: newTx });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

const getInventorySummary = async (req, res) => {
    try {
        const items = await Item.find();
        const totalItems = items.length;
        const totalValue = items.reduce((acc, item) => acc + (item.current_stock * item.purchase_price), 0);
        const lowStockItems = items.filter(item => item.current_stock <= item.low_stock_threshold);
        
        res.json({
            success: true,
            summary: {
                totalItems,
                totalValue,
                lowStockCount: lowStockItems.length,
                lowStockItems
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    getItems,
    createItem,
    getStockTransactions,
    createStockTransaction,
    getInventorySummary
};
