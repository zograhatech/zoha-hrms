const SalesInvoice = require('../models/SalesInvoice');
const PurchaseInvoice = require('../models/PurchaseInvoice');

const getGSTSummary = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let query = {};
        if (startDate && endDate) {
            query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }

        const sales = await SalesInvoice.find(query);
        const purchases = await PurchaseInvoice.find(query);

        const outputGST = sales.reduce((acc, inv) => acc + (inv.tax_amount || 0), 0);
        const inputGST = purchases.reduce((acc, inv) => acc + (inv.tax_amount || 0), 0);
        const netGST = outputGST - inputGST;

        // Group by tax rates (e.g. 5%, 12%, 18%, 28%)
        const salesByRate = {};
        sales.forEach(inv => {
            const rate = inv.tax_percent || 0;
            if (!salesByRate[rate]) salesByRate[rate] = { taxable: 0, tax: 0 };
            salesByRate[rate].taxable += inv.subtotal;
            salesByRate[rate].tax += inv.tax_amount;
        });

        const purchaseByRate = {};
        purchases.forEach(inv => {
            const rate = inv.tax_percent || 0;
            if (!purchaseByRate[rate]) purchaseByRate[rate] = { taxable: 0, tax: 0 };
            purchaseByRate[rate].taxable += inv.subtotal;
            purchaseByRate[rate].tax += inv.tax_amount;
        });

        res.json({
            success: true,
            summary: {
                totalSalesTaxable: sales.reduce((acc, inv) => acc + inv.subtotal, 0),
                totalPurchaseTaxable: purchases.reduce((acc, inv) => acc + inv.subtotal, 0),
                outputGST,
                inputGST,
                netGST,
                salesByRate,
                purchaseByRate
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    getGSTSummary
};
