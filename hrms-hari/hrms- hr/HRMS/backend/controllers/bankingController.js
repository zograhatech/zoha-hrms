const BankAccount = require('../models/BankAccount');
const BankTransaction = require('../models/BankTransaction');

// ─── ACCOUNTS ──────────────────────────────────────────

const getAccounts = async (req, res) => {
    try {
        const accounts = await BankAccount.find().sort({ account_name: 1 });
        res.json({ success: true, accounts });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const createAccount = async (req, res) => {
    try {
        const { account_name, bank_name, account_number, ifsc_code, branch, account_type, opening_balance } = req.body;
        const newAccount = new BankAccount({
            account_name, bank_name, account_number, ifsc_code, branch, account_type,
            opening_balance, current_balance: opening_balance
        });
        await newAccount.save();
        res.status(201).json({ success: true, account: newAccount });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// ─── TRANSACTIONS ─────────────────────────────────────

const getTransactions = async (req, res) => {
    try {
        const transactions = await BankTransaction.find()
            .populate('account')
            .populate('to_account')
            .sort({ date: -1 });
        res.json({ success: true, transactions });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const createTransaction = async (req, res) => {
    try {
        const { date, account_id, type, amount, ref_no, description, to_account_id } = req.body;
        
        if (!account_id) {
            return res.status(400).json({ success: false, message: 'Please select a bank account' });
        }

        const account = await BankAccount.findById(account_id);
        if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

        const numAmount = Number(amount);
        const newTx = new BankTransaction({
            date, 
            account: account_id, 
            type, 
            amount: numAmount, 
            ref_no, 
            description, 
            to_account: to_account_id || null // Fix: Handle empty string from frontend
        });

        // Update Balance
        if (type === 'Deposit' || type === 'Interest') {
            account.current_balance += numAmount;
        } else if (type === 'Withdrawal' || type === 'Charges') {
            account.current_balance -= numAmount;
        } else if (type === 'Transfer' && to_account_id) {
            const destAccount = await BankAccount.findById(to_account_id);
            if (!destAccount) return res.status(404).json({ success: false, message: 'Destination account not found' });
            
            account.current_balance -= numAmount;
            destAccount.current_balance += numAmount;
            await destAccount.save();
        }

        await newTx.save();
        await account.save();

        res.status(201).json({ success: true, transaction: newTx });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

const getBankingSummary = async (req, res) => {
    try {
        const accounts = await BankAccount.find();
        const totalBalance = accounts.reduce((acc, a) => acc + a.current_balance, 0);
        res.json({ success: true, summary: { totalBalance, accountCount: accounts.length } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    getAccounts,
    createAccount,
    getTransactions,
    createTransaction,
    getBankingSummary
};
