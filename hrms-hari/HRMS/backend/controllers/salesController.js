const Customer = require('../models/Customer');
const SalesInvoice = require('../models/SalesInvoice');
const Item = require('../models/Item');
const StockTransaction = require('../models/StockTransaction');

// ─── CUSTOMERS ────────────────────────────────────────

const getCustomers = async (req, res) => {
    try {
        const customers = await Customer.find().sort({ name: 1 });
        res.json({ success: true, customers });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const createCustomer = async (req, res) => {
    try {
        const { name, email, phone, address, gstin, opening_balance } = req.body;
        const newCustomer = new Customer({
            name, email, phone, address, gstin, 
            opening_balance, 
            current_balance: opening_balance 
        });
        await newCustomer.save();
        res.status(201).json({ success: true, customer: newCustomer });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// ─── SALES INVOICES ───────────────────────────────────

const getInvoices = async (req, res) => {
    try {
        const invoices = await SalesInvoice.find()
            .populate('customer')
            .populate('items.item')
            .sort({ date: -1 });
        res.json({ success: true, invoices });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const createInvoice = async (req, res) => {
    try {
        const { invoice_no, date, customer_id, customer_name, customer_gst, items, tax_percent, notes } = req.body;
        
        let customer = null;
        if (customer_id) {
            customer = await Customer.findById(customer_id);
            if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
        }

        let subtotal = 0;
        const processedItems = [];

        for (const line of items) {
            const item = await Item.findById(line.item_id);
            if (!item) throw new Error(`Item not found: ${line.item_id}`);
            
            if (item.current_stock < line.quantity) {
                throw new Error(`Insufficient stock for ${item.name}. Available: ${item.current_stock}`);
            }

            const amount = line.quantity * line.rate;
            subtotal += amount;

            processedItems.push({
                item: line.item_id,
                quantity: line.quantity,
                rate: line.rate,
                amount
            });

            // Update Stock
            item.current_stock -= line.quantity;
            await item.save();

            // Record Stock Movement
            const stockTx = new StockTransaction({
                date,
                item: line.item_id,
                type: 'Sales',
                quantity: line.quantity,
                rate: line.rate,
                total_amount: amount,
                ref_no: invoice_no,
                narration: `Sale to ${customer ? customer.name : customer_name}`
            });
            await stockTx.save();
        }

        const tax_amount = (subtotal * (tax_percent || 0)) / 100;
        const total_amount = subtotal + tax_amount;

        const newInvoice = new SalesInvoice({
            invoice_no,
            date,
            customer: customer_id || null,
            customer_name: customer ? customer.name : customer_name,
            customer_gst: customer ? customer.gstin : customer_gst,
            items: processedItems,
            subtotal,
            tax_percent,
            tax_amount,
            total_amount,
            notes
        });

        // Update Customer Balance (Increase Receivable) if existing customer
        if (customer) {
            customer.current_balance += total_amount;
            await customer.save();
        }
        
        await newInvoice.save();

        res.status(201).json({ success: true, invoice: newInvoice });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

const getSalesSummary = async (req, res) => {
    try {
        const invoices = await SalesInvoice.find();
        const totalSales = invoices.reduce((acc, inv) => acc + inv.total_amount, 0);
        const totalReceived = invoices.reduce((acc, inv) => acc + (inv.payment_received || 0), 0);
        const totalPending = totalSales - totalReceived;

        res.json({
            success: true,
            summary: {
                totalSales,
                totalReceived,
                totalPending,
                invoiceCount: invoices.length
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const markAsPaid = async (req, res) => {
    try {
        const { id } = req.params;
        const invoice = await SalesInvoice.findById(id);
        if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

        if (invoice.payment_status === 'Paid') {
            return res.status(400).json({ success: false, message: 'Invoice is already paid' });
        }

        const remainingAmount = invoice.total_amount - (invoice.payment_received || 0);
        invoice.payment_received = invoice.total_amount;
        invoice.payment_status = 'Paid';
        await invoice.save();

        if (invoice.customer) {
            const customer = await Customer.findById(invoice.customer);
            if (customer) {
                customer.current_balance -= remainingAmount;
                await customer.save();
            }
        }

        res.json({ success: true, message: 'Invoice marked as paid' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    getCustomers,
    createCustomer,
    getInvoices,
    createInvoice,
    getSalesSummary,
    markAsPaid
};
