const Ledger = require('../models/Ledger');
const Transaction = require('../models/Transaction');

// ─── LEDGERS ──────────────────────────────────────────

const getLedgers = async (req, res) => {
    try {
        const ledgers = await Ledger.find().sort({ name: 1 });
        res.json({ success: true, ledgers });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const createLedger = async (req, res) => {
    try {
        const { name, group, opening_balance, description } = req.body;
        const ledger = await Ledger.create({
            name,
            group,
            opening_balance: opening_balance || 0,
            current_balance: opening_balance || 0,
            description
        });
        res.status(201).json({ success: true, ledger });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// ─── TRANSACTIONS ──────────────────────────────────────

const getTransactions = async (req, res) => {
    try {
        const transactions = await Transaction.find()
            .populate('debit_ledger', 'name')
            .populate('credit_ledger', 'name')
            .sort({ date: -1 });
        res.json({ success: true, transactions });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const createTransaction = async (req, res) => {
    const session = await Ledger.startSession();
    session.startTransaction();
    try {
        const { date, type, ref_no, debit_ledger, credit_ledger, amount, narration } = req.body;

        // 1. Create Transaction
        const transaction = await Transaction.create([{
            date, type, ref_no, debit_ledger, credit_ledger, amount, narration
        }], { session });

        // 2. Fetch both ledgers to check their group for correct balance updates
        const drLedger = await Ledger.findById(debit_ledger).session(session);
        const crLedger = await Ledger.findById(credit_ledger).session(session);

        // Standard Accounting Rules:
        // Asset/Expense: Debit increases (+), Credit decreases (-)
        // Liability/Equity/Income: Debit decreases (-), Credit increases (+)

        // Update Debit Ledger
        const drInc = ['Assets', 'Expenses'].includes(drLedger.group) ? amount : -amount;
        drLedger.current_balance += drInc;
        await drLedger.save({ session });

        // Update Credit Ledger
        const crInc = ['Assets', 'Expenses'].includes(crLedger.group) ? -amount : amount;
        crLedger.current_balance += crInc;
        await crLedger.save({ session });

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({ success: true, transaction: transaction[0] });
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        res.status(400).json({ success: false, message: err.message });
    }
};

const updateLedger = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, group, opening_balance, description } = req.body;
        
        const oldLedger = await Ledger.findById(id);
        const diff = (opening_balance || 0) - (oldLedger.opening_balance || 0);

        const ledger = await Ledger.findByIdAndUpdate(id, {
            name, 
            group, 
            opening_balance, 
            $inc: { current_balance: diff },
            description
        }, { new: true });
        
        res.json({ success: true, ledger });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

const deleteLedger = async (req, res) => {
    try {
        const { id } = req.params;
        // Check if ledger has transactions
        const hasTransactions = await Transaction.findOne({
            $or: [{ debit_ledger: id }, { credit_ledger: id }]
        });
        if (hasTransactions) {
            return res.status(400).json({ success: false, message: 'Cannot delete ledger with transactions' });
        }
        await Ledger.findByIdAndDelete(id);
        res.json({ success: true, message: 'Ledger deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const getBalanceSheet = async (req, res) => {
    try {
        const ledgers = await Ledger.find();
        const assets = ledgers.filter(l => l.group === 'Assets');
        const liabilities = ledgers.filter(l => l.group === 'Liabilities');
        const equity = ledgers.filter(l => l.group === 'Equity');

        const totalAssets = assets.reduce((sum, l) => sum + l.current_balance, 0);
        const totalLiabilities = liabilities.reduce((sum, l) => sum + l.current_balance, 0);
        const totalEquity = equity.reduce((sum, l) => sum + l.current_balance, 0);

        res.json({
            success: true,
            data: {
                assets,
                liabilities,
                equity,
                summary: {
                    totalAssets,
                    totalLiabilities,
                    totalEquity,
                    difference: totalAssets - (totalLiabilities + totalEquity)
                }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = {
    getLedgers,
    createLedger,
    updateLedger,
    deleteLedger,
    getTransactions,
    createTransaction,
    getBalanceSheet
};
