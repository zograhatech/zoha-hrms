const SalesInvoice = require('../models/SalesInvoice');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const Payroll = require('../models/Payroll');
const Item = require('../models/Item');
const BankAccount = require('../models/BankAccount');

const getFinancialOverview = async (req, res) => {
    try {
        const { year = new Date().getFullYear() } = req.query;
        
        // 1. Fetch all data for the year
        const sales = await SalesInvoice.find({
            date: { 
                $gte: new Date(`${year}-01-01`), 
                $lte: new Date(`${year}-12-31`) 
            }
        });

        const purchases = await PurchaseInvoice.find({
            date: { 
                $gte: new Date(`${year}-01-01`), 
                $lte: new Date(`${year}-12-31`) 
            }
        });

        const payrolls = await Payroll.find({ year: parseInt(year), status: 'paid' });

        // 2. Prepare monthly stats
        const monthlyStats = Array.from({ length: 12 }, (_, i) => ({
            month: new Date(0, i).toLocaleString('default', { month: 'short' }),
            revenue: 0,
            expense: 0,
            payroll: 0,
            profit: 0
        }));

        sales.forEach(inv => {
            const m = new Date(inv.date).getMonth();
            monthlyStats[m].revenue += inv.total_amount;
        });

        purchases.forEach(inv => {
            const m = new Date(inv.date).getMonth();
            monthlyStats[m].expense += inv.total_amount;
        });

        payrolls.forEach(p => {
            const m = p.month - 1; // 1-indexed in model
            const payrollCost = p.net_salary + (p.employer_pf || 0) + (p.employer_esi || 0);
            monthlyStats[m].payroll += payrollCost;
            monthlyStats[m].expense += payrollCost;
        });

        monthlyStats.forEach(s => {
            s.profit = s.revenue - s.expense;
        });

        // 3. Asset & Liability Summary
        const inventoryItems = await Item.find();
        const inventoryValue = inventoryItems.reduce((acc, item) => acc + (item.current_stock * (item.purchase_price || 0)), 0);

        const bankAccounts = await BankAccount.find();
        const totalCash = bankAccounts.reduce((acc, a) => acc + a.current_balance, 0);

        res.json({
            success: true,
            year,
            monthlyStats,
            summary: {
                totalRevenue: monthlyStats.reduce((acc, s) => acc + s.revenue, 0),
                totalExpense: monthlyStats.reduce((acc, s) => acc + s.expense, 0),
                totalPayroll: monthlyStats.reduce((acc, s) => acc + s.payroll, 0),
                netProfit: monthlyStats.reduce((acc, s) => acc + s.profit, 0),
                inventoryValue,
                totalCash
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    getFinancialOverview
};
