import { useState, useEffect, useCallback } from 'react';
import API from '../../api/axios';
import {
    FiPlus, FiUsers, FiFileText, FiTrendingUp, 
    FiCheckCircle, FiX, FiSearch, 
    FiPlusCircle, FiTrash2, FiShoppingBag, FiDownload, FiChevronDown,
    FiActivity, FiUserPlus
} from 'react-icons/fi';
import { FaRupeeSign } from 'react-icons/fa6';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/dateFormatter';
import DateInput from '../../components/DateInput';

export default function SalesManagement() {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [customers, setCustomers] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [items, setItems] = useState([]); // Stock items for selection
    const [summary, setSummary] = useState(null);
    const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, customers, invoices

    const [showCustomerForm, setShowCustomerForm] = useState(false);
    const [showInvoiceForm, setShowInvoiceForm] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);

    const [customerForm, setCustomerForm] = useState({
        name: '', email: '', phone: '', address: '', gstin: '', opening_balance: 0
    });

    const [invoiceForm, setInvoiceForm] = useState({
        invoice_no: `INV-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString().split('T')[0],
        customer_id: '',
        is_manual: false,
        customer_name: '',
        customer_gst: '',
        tax_percent: 18,
        notes: '',
        line_items: [{ item_id: '', quantity: 1, rate: 0 }]
    });

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [cRes, iRes, sRes, stockRes] = await Promise.all([
                API.get('/sales/customers'),
                API.get('/sales/invoices'),
                API.get('/sales/summary'),
                API.get('/inventory/items')
            ]);
            setCustomers(cRes.data.customers || []);
            setInvoices(iRes.data.invoices || []);
            setSummary(sRes.data.summary || null);
            setItems(stockRes.data.items || []);
        } catch (err) {
            showToast('Failed to load sales data', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        const handleClickOutside = () => setShowExportMenu(false);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const handleCustomerSubmit = async (e) => {
        e.preventDefault();
        try {
            await API.post('/sales/customers', customerForm);
            showToast('Customer added successfully', 'success');
            setShowCustomerForm(false);
            setCustomerForm({ name: '', email: '', phone: '', address: '', gstin: '', opening_balance: 0 });
            loadData();
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to add customer', 'error');
        }
    };

    const addLineItem = () => {
        setInvoiceForm({
            ...invoiceForm,
            line_items: [...invoiceForm.line_items, { item_id: '', quantity: 1, rate: 0 }]
        });
    };

    const removeLineItem = (index) => {
        const list = [...invoiceForm.line_items];
        list.splice(index, 1);
        setInvoiceForm({ ...invoiceForm, line_items: list });
    };

    const updateLineItem = (index, field, value) => {
        const list = [...invoiceForm.line_items];
        list[index][field] = value;
        
        // Auto-fill rate if item selected
        if (field === 'item_id') {
            const selectedItem = items.find(i => i._id === value);
            if (selectedItem) list[index].rate = selectedItem.selling_price;
        }

        setInvoiceForm({ ...invoiceForm, line_items: list });
    };

    const calculateInvoiceTotal = () => {
        const subtotal = invoiceForm.line_items.reduce((acc, l) => acc + (l.quantity * l.rate), 0);
        const tax = (subtotal * invoiceForm.tax_percent) / 100;
        return subtotal + tax;
    };

    const handleInvoiceSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...invoiceForm,
                items: invoiceForm.line_items
            };
            await API.post('/sales/invoices', payload);
            showToast('Invoice generated successfully', 'success');
            setShowInvoiceForm(false);
            setInvoiceForm({
                invoice_no: `INV-${Date.now().toString().slice(-6)}`,
                date: new Date().toISOString().split('T')[0],
                customer_id: '', 
                is_manual: false,
                customer_name: '',
                customer_gst: '',
                tax_percent: 18, notes: '',
                line_items: [{ item_id: '', quantity: 1, rate: 0 }]
            });
            loadData();
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to generate invoice', 'error');
        }
    };

    const handleMarkAsPaid = async (id) => {
        if (!window.confirm('Mark this invoice as fully paid?')) return;
        try {
            await API.put(`/sales/invoices/${id}/pay`);
            showToast('Invoice marked as paid', 'success');
            loadData();
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to update payment status', 'error');
        }
    };
    const handleExport = (type = activeTab) => {
        let csvContent = "\uFEFF"; // BOM for Excel
        let fileName = "";
        const today = new Date().toISOString().split('T')[0];
        const exportType = (type === 'dashboard') ? 'invoices' : type;

        if (exportType === 'invoices') {
            const headers = ["Inv #", "Date", "Customer", "Subtotal", "Tax %", "Tax Amount", "Total Amount", "Status", "Received"];
            const rows = invoices.map(inv => {
                const subtotal = inv.items?.reduce((acc, item) => acc + (item.quantity * item.rate), 0) || 0;
                return [
                    inv.invoice_no,
                    formatDate(inv.date),
                    `"${(inv.customer?.name || inv.customer_name || "Walk-in").replace(/"/g, '""')}"`,
                    subtotal,
                    inv.tax_percent,
                    inv.tax_amount,
                    inv.total_amount,
                    inv.payment_status,
                    inv.payment_received
                ];
            });
            csvContent += [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
            fileName = `Sales_Invoices_${today}.csv`;
        } else if (exportType === 'customers') {
            const headers = ["Customer Name", "Email", "Phone", "GSTIN", "Balance", "Address"];
            const rows = customers.map(c => [
                `"${c.name.replace(/"/g, '""')}"`,
                c.email || "",
                c.phone || "",
                c.gstin || "",
                c.current_balance,
                `"${(c.address || "").replace(/"/g, '""')}"`
            ]);
            csvContent += [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
            fileName = `Customers_List_${today}.csv`;
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast(`Exported ${exportType} successfully`, 'success');
        setShowExportMenu(false);
    };

    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;

    return (
        <div className="sales-management">
            <div className="page-header">
                <div>
                    <div className="page-title"><FiShoppingBag style={{ marginRight: 8, verticalAlign: 'middle' }} /> Sales Management</div>
                    <div className="page-subtitle">Manage customers, generate invoices, and track revenue</div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative' }}>
                        <button 
                            className="btn btn-outline" 
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowExportMenu(!showExportMenu);
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                        >
                            <FiDownload /> <span>Export</span> <FiChevronDown />
                        </button>
                        {showExportMenu && (
                            <div className="dropdown-menu export-menu">
                                <button className="dropdown-item" onClick={() => handleExport('invoices')}>
                                    <FiFileText size={14} /> Invoices
                                </button>
                                <button className="dropdown-item" onClick={() => handleExport('customers')}>
                                    <FiUsers size={14} /> Customers
                                </button>
                            </div>
                        )}
                    </div>
                    <button className="btn btn-outline" onClick={() => setShowCustomerForm(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <FiUserPlus /> <span>New Customer</span>
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowInvoiceForm(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <FiPlus /> <span>New Invoice</span>
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs-container" style={{ marginBottom: 24, borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 24 }}>
                {['Dashboard', 'Invoices', 'Customers'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab.toLowerCase())}
                        style={{
                            padding: '12px 4px',
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === tab.toLowerCase() ? '2px solid var(--accent-primary)' : '2px solid transparent',
                            color: activeTab === tab.toLowerCase() ? 'var(--accent-primary)' : 'var(--text-muted)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            transition: 'var(--transition)'
                        }}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {activeTab === 'dashboard' && (
                <div>
                    <div className="grid-3" style={{ marginBottom: 24 }}>
                        <div className="card stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}><FiTrendingUp /></div>
                            <div className="stat-info">
                                <div className="stat-label">Total Revenue</div>
                                <div className="stat-value">₹{(summary?.totalSales || 0).toLocaleString('en-IN')}</div>
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}><FaRupeeSign /></div>
                            <div className="stat-info">
                                <div className="stat-label">Payments Received</div>
                                <div className="stat-value">₹{(summary?.totalReceived || 0).toLocaleString('en-IN')}</div>
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}><FiFileText /></div>
                            <div className="stat-info">
                                <div className="stat-label">Outstanding (Receivable)</div>
                                <div className="stat-value">₹{(summary?.totalPending || 0).toLocaleString('en-IN')}</div>
                            </div>
                        </div>
                    </div>

                    <div className="grid-2">
                        <div className="card">
                            <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}><FiTrendingUp /> Recent Invoices</h3>
                            <div className="list-container">
                                {invoices.slice(0, 5).map(inv => (
                                    <div key={inv._id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{inv.customer?.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{inv.invoice_no} · {formatDate(inv.date)}</div>
                                        </div>
                                        <div style={{ fontWeight: 700 }}>
                                            ₹{inv.total_amount.toLocaleString('en-IN')}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="card">
                            <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}><FiUsers /> Top Customers</h3>
                            <div className="list-container">
                                {customers.slice(0, 5).map(c => (
                                    <div key={c._id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 500 }}>{c.name}</span>
                                        <span style={{ fontWeight: 700, color: c.current_balance > 0 ? '#ef4444' : 'var(--accent-green)' }}>
                                            ₹{c.current_balance.toLocaleString('en-IN')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'invoices' && (
                <div className="card" style={{ padding: 0 }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Inv #</th>
                                <th>Date</th>
                                <th>Customer</th>
                                <th>Total Amount</th>
                                <th>Tax</th>
                                <th>Status</th>
                                <th>Payment</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.map(inv => (
                                <tr key={inv._id}>
                                    <td style={{ fontWeight: 700 }}>{inv.invoice_no}</td>
                                    <td>{formatDate(inv.date)}</td>
                                    <td style={{ fontWeight: 600 }}>{inv.customer?.name}</td>
                                    <td style={{ fontWeight: 700 }}>₹{inv.total_amount.toLocaleString('en-IN')}</td>
                                    <td>₹{inv.tax_amount.toLocaleString('en-IN')} ({inv.tax_percent}%)</td>
                                    <td><span className={`badge badge-${inv.payment_status === 'Paid' ? 'success' : inv.payment_status === 'Unpaid' ? 'danger' : 'warning'}`}>{inv.payment_status}</span></td>
                                    <td>₹{inv.payment_received.toLocaleString('en-IN')}</td>
                                    <td>
                                        {inv.payment_status !== 'Paid' && (
                                            <button 
                                                className="btn btn-sm btn-outline" 
                                                style={{ color: 'var(--accent-green)', borderColor: 'var(--accent-green)', padding: '4px 8px', fontSize: '0.7rem' }}
                                                onClick={() => handleMarkAsPaid(inv._id)}
                                            >
                                                <FiCheckCircle style={{ marginRight: 4 }} /> Mark Paid
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'customers' && (
                <div className="card" style={{ padding: 0 }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Customer Name</th>
                                <th>Contact</th>
                                <th>Address</th>
                                <th>GSTIN</th>
                                <th>Outstanding Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {customers.map(c => (
                                <tr key={c._id}>
                                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                                    <td>
                                        <div style={{ fontSize: '0.85rem' }}>{c.phone}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.email}</div>
                                    </td>
                                    <td style={{ fontSize: '0.8rem', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.address}</td>
                                    <td style={{ fontFamily: 'monospace' }}>{c.gstin || '—'}</td>
                                    <td style={{ fontWeight: 700, color: c.current_balance > 0 ? '#ef4444' : 'var(--accent-green)' }}>
                                        ₹{c.current_balance.toLocaleString('en-IN')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modals */}
            {showCustomerForm && (
                <div className="modal-overlay" onClick={() => setShowCustomerForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Add New Customer</h3>
                            <button className="modal-close" onClick={() => setShowCustomerForm(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleCustomerSubmit}>
                            <div className="modal-body">
                                <div className="form-group"><label className="form-label">Name</label><input type="text" className="form-input" required value={customerForm.name} onChange={e => setCustomerForm({...customerForm, name: e.target.value})} /></div>
                                <div className="grid-2">
                                    <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" value={customerForm.email} onChange={e => setCustomerForm({...customerForm, email: e.target.value})} /></div>
                                    <div className="form-group"><label className="form-label">Phone</label><input type="text" className="form-input" value={customerForm.phone} onChange={e => setCustomerForm({...customerForm, phone: e.target.value})} /></div>
                                </div>
                                <div className="form-group"><label className="form-label">Address</label><textarea className="form-input" value={customerForm.address} onChange={e => setCustomerForm({...customerForm, address: e.target.value})} /></div>
                                <div className="grid-2">
                                    <div className="form-group"><label className="form-label">GSTIN</label><input type="text" className="form-input" value={customerForm.gstin} onChange={e => setCustomerForm({...customerForm, gstin: e.target.value})} /></div>
                                    <div className="form-group"><label className="form-label">Opening Balance</label><input type="number" className="form-input" value={customerForm.opening_balance} onChange={e => setCustomerForm({...customerForm, opening_balance: e.target.value})} /></div>
                                </div>
                            </div>
                            <div className="modal-footer"><button type="submit" className="btn btn-primary w-full">Save Customer</button></div>
                        </form>
                    </div>
                </div>
            )}

            {showInvoiceForm && (
                <div className="modal-overlay" onClick={() => setShowInvoiceForm(false)}>
                    <div className="modal" style={{ maxWidth: 800 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Generate Sales Invoice</h3>
                            <button className="modal-close" onClick={() => setShowInvoiceForm(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleInvoiceSubmit}>
                            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                                <div className="grid-3">
                                    <div className="form-group"><label className="form-label">Invoice #</label><input type="text" className="form-input" required value={invoiceForm.invoice_no} readOnly /></div>
                                    <DateInput label="Date" required value={invoiceForm.date} onChange={e => setInvoiceForm({...invoiceForm, date: e.target.value})} />
                                    <div className="form-group"><label className="form-label">Tax (%)</label><input type="number" className="form-input" required value={invoiceForm.tax_percent} onChange={e => setInvoiceForm({...invoiceForm, tax_percent: e.target.value})} /></div>
                                </div>
                                <div className="form-group">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <label className="form-label" style={{ marginBottom: 0 }}>Customer</label>
                                        <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--accent-primary)' }}>
                                            <input type="checkbox" checked={invoiceForm.is_manual} onChange={e => setInvoiceForm({...invoiceForm, is_manual: e.target.checked, customer_id: ''})} />
                                            Manual/Walk-in Entry
                                        </label>
                                    </div>
                                    
                                    {!invoiceForm.is_manual ? (
                                        <select className="form-select" required value={invoiceForm.customer_id} onChange={e => setInvoiceForm({...invoiceForm, customer_id: e.target.value})}>
                                            <option value="">— Select Customer —</option>
                                            {customers.map(c => <option key={c._id} value={c._id}>{c.name} {c.current_balance > 0 ? `(O/S: ₹${c.current_balance})` : ''}</option>)}
                                        </select>
                                    ) : (
                                        <div className="grid-2" style={{ gap: 10 }}>
                                            <div className="form-group" style={{ marginBottom: 0 }}>
                                                <input type="text" className="form-input" placeholder="Customer Name" required value={invoiceForm.customer_name} onChange={e => setInvoiceForm({...invoiceForm, customer_name: e.target.value})} />
                                            </div>
                                            <div className="form-group" style={{ marginBottom: 0 }}>
                                                <input type="text" className="form-input" placeholder="Manual GSTIN (Optional)" value={invoiceForm.customer_gst} onChange={e => setInvoiceForm({...invoiceForm, customer_gst: e.target.value})} />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div style={{ marginTop: 20 }}>
                                    <div className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>Items <span>Total: ₹{calculateInvoiceTotal().toLocaleString('en-IN')}</span></div>
                                    {invoiceForm.line_items.map((line, idx) => (
                                        <div key={idx} className="grid-3" style={{ gap: 10, background: 'rgba(0,0,0,0.02)', padding: 10, borderRadius: 8, marginBottom: 10, alignItems: 'flex-end' }}>
                                            <div className="form-group" style={{ marginBottom: 0 }}>
                                                <select className="form-select" required value={line.item_id} onChange={e => updateLineItem(idx, 'item_id', e.target.value)}>
                                                    <option value="">— Select Item —</option>
                                                    {items.map(i => <option key={i._id} value={i._id}>{i.name} (Stock: {i.current_stock})</option>)}
                                                </select>
                                            </div>
                                            <div className="form-group" style={{ marginBottom: 0 }}><input type="number" className="form-input" placeholder="Qty" required value={line.quantity} onChange={e => updateLineItem(idx, 'quantity', e.target.value)} /></div>
                                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                                <input type="number" className="form-input" placeholder="Rate" required value={line.rate} onChange={e => updateLineItem(idx, 'rate', e.target.value)} />
                                                <button type="button" className="btn-icon text-error" onClick={() => removeLineItem(idx)}><FiTrash2 /></button>
                                            </div>
                                        </div>
                                    ))}
                                    <button type="button" className="btn btn-outline btn-sm" onClick={addLineItem}><FiPlusCircle /> Add Line Item</button>
                                </div>
                                
                                <div className="form-group" style={{ marginTop: 20 }}><label className="form-label">Notes</label><textarea className="form-input" value={invoiceForm.notes} onChange={e => setInvoiceForm({...invoiceForm, notes: e.target.value})} /></div>
                            </div>
                            <div className="modal-footer"><button type="submit" className="btn btn-primary w-full">Generate & Save Invoice</button></div>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
                .data-table th { padding: 12px 20px; text-align: left; background: rgba(99,102,241,0.05); color: var(--text-secondary); font-size: 0.75rem; font-weight: 700; border-bottom: 1px solid var(--border-color); }
                .data-table td { padding: 12px 20px; border-bottom: 1px solid var(--border-color); font-size: 0.85rem; }
                .dropdown-item {
                    width: 100%; padding: 12px 16px; display: flex; align-items: center; gap: 10px;
                    background: none; border: none; color: var(--text-primary); font-size: 0.85rem;
                    font-weight: 500; cursor: pointer; text-align: left; transition: var(--transition);
                }
                .dropdown-item:hover { background: rgba(99,102,241,0.08); color: var(--accent-primary); }
            `}</style>
        </div>
    );
}
