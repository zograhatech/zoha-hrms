const Vendor = require('../models/Vendor');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const Item = require('../models/Item');
const StockTransaction = require('../models/StockTransaction');

// ─── VENDORS ──────────────────────────────────────────

const getVendors = async (req, res) => {
    try {
        const vendors = await Vendor.find().sort({ name: 1 });
        res.json({ success: true, vendors });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const createVendor = async (req, res) => {
    try {
        const { name, contact_person, email, phone, address, gstin, opening_balance } = req.body;
        const newVendor = new Vendor({
            name, contact_person, email, phone, address, gstin,
            opening_balance,
            current_balance: opening_balance
        });
        await newVendor.save();
        res.status(201).json({ success: true, vendor: newVendor });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// ─── PURCHASE INVOICES ────────────────────────────────

const getPurchaseInvoices = async (req, res) => {
    try {
        const invoices = await PurchaseInvoice.find()
            .populate('vendor')
            .populate('items.item')
            .sort({ date: -1 });
        res.json({ success: true, invoices });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const createPurchaseInvoice = async (req, res) => {
    try {
        const { bill_no, internal_ref, date, vendor_id, items, tax_percent, notes } = req.body;

        const vendor = await Vendor.findById(vendor_id);
        if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

        let subtotal = 0;
        const processedItems = [];

        for (const line of items) {
            const item = await Item.findById(line.item_id);
            if (!item) throw new Error(`Item not found: ${line.item_id}`);

            const amount = line.quantity * line.rate;
            subtotal += amount;

            processedItems.push({
                item: line.item_id,
                quantity: line.quantity,
                rate: line.rate,
                amount
            });

            // Update Stock (Increase)
            item.current_stock += Number(line.quantity);
            // Optionally update purchase price in Item model
            item.purchase_price = line.rate;
            await item.save();

            // Record Stock Movement
            const stockTx = new StockTransaction({
                date,
                item: line.item_id,
                type: 'Purchase',
                quantity: line.quantity,
                rate: line.rate,
                total_amount: amount,
                ref_no: bill_no || internal_ref,
                narration: `Purchase from ${vendor.name}`
            });
            await stockTx.save();
        }

        const tax_amount = (subtotal * (tax_percent || 0)) / 100;
        const total_amount = subtotal + tax_amount;

        const newInvoice = new PurchaseInvoice({
            bill_no,
            internal_ref,
            date,
            vendor: vendor_id,
            items: processedItems,
            subtotal,
            tax_percent,
            tax_amount,
            total_amount,
            notes
        });

        // Update Vendor Balance (Increase Payable)
        vendor.current_balance += total_amount;

        await newInvoice.save();
        await vendor.save();

        res.status(201).json({ success: true, invoice: newInvoice });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

const getPurchaseSummary = async (req, res) => {
    try {
        const invoices = await PurchaseInvoice.find();
        const totalPurchases = invoices.reduce((acc, inv) => acc + inv.total_amount, 0);
        const totalPaid = invoices.reduce((acc, inv) => acc + (inv.payment_made || 0), 0);
        const totalPayable = totalPurchases - totalPaid;

        res.json({
            success: true,
            summary: {
                totalPurchases,
                totalPaid,
                totalPayable,
                billCount: invoices.length
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const markAsPaid = async (req, res) => {
    try {
        const { id } = req.params;
        const invoice = await PurchaseInvoice.findById(id);
        if (!invoice) return res.status(404).json({ success: false, message: 'Purchase bill not found' });

        if (invoice.payment_status === 'Paid') {
            return res.status(400).json({ success: false, message: 'Bill is already paid' });
        }

        const remainingAmount = invoice.total_amount - (invoice.payment_made || 0);
        invoice.payment_made = invoice.total_amount;
        invoice.payment_status = 'Paid';
        await invoice.save();

        if (invoice.vendor) {
            const vendor = await Vendor.findById(invoice.vendor);
            if (vendor) {
                vendor.current_balance -= remainingAmount;
                await vendor.save();
            }
        }

        res.json({ success: true, message: 'Bill marked as paid' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    getVendors,
    createVendor,
    getPurchaseInvoices,
    createPurchaseInvoice,
    getPurchaseSummary,
    markAsPaid
};
