import { useState, useEffect, useCallback } from 'react';
import API from '../../api/axios';
import {
    FiPlus, FiTruck, FiFileText, FiTrendingDown, 
    FiCheckCircle, FiX, FiSearch, 
    FiPlusCircle, FiTrash2, FiBriefcase, FiDownload, FiChevronDown
} from 'react-icons/fi';
import { FaRupeeSign } from 'react-icons/fa6';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/dateFormatter';
import DateInput from '../../components/DateInput';

export default function PurchaseManagement() {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [vendors, setVendors] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [items, setItems] = useState([]); // Stock items for selection
    const [summary, setSummary] = useState(null);
    const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, vendors, invoices

    const [showVendorForm, setShowVendorForm] = useState(false);
    const [showInvoiceForm, setShowInvoiceForm] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);

    const [vendorForm, setVendorForm] = useState({
        name: '', contact_person: '', email: '', phone: '', address: '', gstin: '', opening_balance: 0
    });

    const [invoiceForm, setInvoiceForm] = useState({
        bill_no: '',
        internal_ref: `PUR-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString().split('T')[0],
        vendor_id: '',
        tax_percent: 18,
        notes: '',
        line_items: [{ item_id: '', quantity: 1, rate: 0 }]
    });

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [vRes, iRes, sRes, stockRes] = await Promise.all([
                API.get('/purchase/vendors'),
                API.get('/purchase/invoices'),
                API.get('/purchase/summary'),
                API.get('/inventory/items')
            ]);
            setVendors(vRes.data.vendors || []);
            setInvoices(iRes.data.invoices || []);
            setSummary(sRes.data.summary || null);
            setItems(stockRes.data.items || []);
        } catch (err) {
            showToast('Failed to load purchase data', 'error');
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

    const handleVendorSubmit = async (e) => {
        e.preventDefault();
        try {
            await API.post('/purchase/vendors', vendorForm);
            showToast('Vendor added successfully', 'success');
            setShowVendorForm(false);
            setVendorForm({ name: '', contact_person: '', email: '', phone: '', address: '', gstin: '', opening_balance: 0 });
            loadData();
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to add vendor', 'error');
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
        
        // Auto-fill rate (purchase price) if item selected
        if (field === 'item_id') {
            const selectedItem = items.find(i => i._id === value);
            if (selectedItem) list[index].rate = selectedItem.purchase_price;
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
            await API.post('/purchase/invoices', payload);
            showToast('Purchase bill recorded successfully', 'success');
            setShowInvoiceForm(false);
            setInvoiceForm({
                bill_no: '',
                internal_ref: `PUR-${Date.now().toString().slice(-6)}`,
                date: new Date().toISOString().split('T')[0],
                vendor_id: '', tax_percent: 18, notes: '',
                line_items: [{ item_id: '', quantity: 1, rate: 0 }]
            });
            loadData();
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to record bill', 'error');
        }
    };

    const handleMarkAsPaid = async (id) => {
        if (!window.confirm('Mark this purchase bill as fully paid?')) return;
        try {
            await API.put(`/purchase/invoices/${id}/pay`);
            showToast('Bill marked as paid', 'success');
            loadData();
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to update payment status', 'error');
        }
    };
    const handleExport = (type = activeTab) => {
        let csvContent = "\uFEFF"; // BOM for Excel
        let fileName = "";
        const today = new Date().toISOString().split('T')[0];
        const exportType = (type === 'dashboard') ? 'bills' : type;

        if (exportType === 'bills') {
            const headers = ["Bill #", "Ref #", "Date", "Vendor", "Total Amount", "Paid", "Status"];
            const rows = invoices.map(inv => [
                inv.bill_no || "",
                inv.internal_ref,
                formatDate(inv.date),
                `"${(inv.vendor?.name || "").replace(/"/g, '""')}"`,
                inv.total_amount,
                inv.payment_made,
                inv.payment_status
            ]);
            csvContent += [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
            fileName = `Purchase_Bills_${today}.csv`;
        } else if (exportType === 'vendors') {
            const headers = ["Vendor Name", "Contact Person", "Email", "Phone", "GSTIN", "Balance", "Address"];
            const rows = vendors.map(v => [
                `"${v.name.replace(/"/g, '""')}"`,
                `"${(v.contact_person || "").replace(/"/g, '""')}"`,
                v.email || "",
                v.phone || "",
                v.gstin || "",
                v.current_balance,
                `"${(v.address || "").replace(/"/g, '""')}"`
            ]);
            csvContent += [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
            fileName = `Vendors_List_${today}.csv`;
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
        <div className="purchase-management">
            <div className="page-header">
                <div>
                    <div className="page-title"><FiBriefcase style={{ marginRight: 8, verticalAlign: 'middle' }} /> Purchase Management</div>
                    <div className="page-subtitle">Manage vendors, record purchases, and track payables</div>
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
                                <button className="dropdown-item" onClick={() => handleExport('bills')}>
                                    <FiFileText size={14} /> Bills
                                </button>
                                <button className="dropdown-item" onClick={() => handleExport('vendors')}>
                                    <FiTruck size={14} /> Vendors
                                </button>
                            </div>
                        )}
                    </div>
                    <button className="btn btn-outline" onClick={() => setShowVendorForm(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <FiTruck /> <span>Add Vendor</span>
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowInvoiceForm(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <FiPlus /> <span>New Bill</span>
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs-container" style={{ marginBottom: 24, borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 24 }}>
                {['Dashboard', 'Bills', 'Vendors'].map(tab => (
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
                            <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}><FiTrendingDown /></div>
                            <div className="stat-info">
                                <div className="stat-label">Total Purchases</div>
                                <div className="stat-value">₹{(summary?.totalPurchases || 0).toLocaleString('en-IN')}</div>
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}><FaRupeeSign /></div>
                            <div className="stat-info">
                                <div className="stat-label">Payments Made</div>
                                <div className="stat-value">₹{(summary?.totalPaid || 0).toLocaleString('en-IN')}</div>
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}><FiFileText /></div>
                            <div className="stat-info">
                                <div className="stat-label">Outstanding (Payable)</div>
                                <div className="stat-value">₹{(summary?.totalPayable || 0).toLocaleString('en-IN')}</div>
                            </div>
                        </div>
                    </div>

                    <div className="grid-2">
                        <div className="card">
                            <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}><FiFileText /> Recent Bills</h3>
                            <div className="list-container">
                                {invoices.slice(0, 5).map(inv => (
                                    <div key={inv._id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{inv.vendor?.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{inv.bill_no || inv.internal_ref} · {formatDate(inv.date)}</div>
                                        </div>
                                        <div style={{ fontWeight: 700 }}>
                                            ₹{inv.total_amount.toLocaleString('en-IN')}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="card">
                            <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}><FiTruck /> Key Suppliers</h3>
                            <div className="list-container">
                                {vendors.slice(0, 5).map(v => (
                                    <div key={v._id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 500 }}>{v.name}</span>
                                        <span style={{ fontWeight: 700, color: 'var(--accent-red)' }}>
                                            ₹{v.current_balance.toLocaleString('en-IN')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'bills' && (
                <div className="card" style={{ padding: 0 }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Bill #</th>
                                <th>Date</th>
                                <th>Vendor</th>
                                <th>Total Amount</th>
                                <th>Status</th>
                                <th>Paid</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.map(inv => (
                                <tr key={inv._id}>
                                    <td style={{ fontWeight: 700 }}>{inv.bill_no || inv.internal_ref}</td>
                                    <td>{formatDate(inv.date)}</td>
                                    <td style={{ fontWeight: 600 }}>{inv.vendor?.name}</td>
                                    <td style={{ fontWeight: 700 }}>₹{inv.total_amount.toLocaleString('en-IN')}</td>
                                    <td><span className={`badge badge-${inv.payment_status === 'Paid' ? 'success' : inv.payment_status === 'Unpaid' ? 'danger' : 'warning'}`}>{inv.payment_status}</span></td>
                                    <td>₹{inv.payment_made.toLocaleString('en-IN')}</td>
                                    <td style={{ textAlign: 'right' }}>
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

            {activeTab === 'vendors' && (
                <div className="card" style={{ padding: 0 }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Vendor Name</th>
                                <th>Contact Person</th>
                                <th>Phone/Email</th>
                                <th>GSTIN</th>
                                <th>Outstanding Payable</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vendors.map(v => (
                                <tr key={v._id}>
                                    <td style={{ fontWeight: 600 }}>{v.name}</td>
                                    <td>{v.contact_person}</td>
                                    <td>
                                        <div style={{ fontSize: '0.85rem' }}>{v.phone}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{v.email}</div>
                                    </td>
                                    <td style={{ fontFamily: 'monospace' }}>{v.gstin || '—'}</td>
                                    <td style={{ fontWeight: 700, color: 'var(--accent-red)' }}>
                                        ₹{v.current_balance.toLocaleString('en-IN')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modals */}
            {showVendorForm && (
                <div className="modal-overlay" onClick={() => setShowVendorForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Add New Supplier / Vendor</h3>
                            <button className="modal-close" onClick={() => setShowVendorForm(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleVendorSubmit}>
                            <div className="modal-body">
                                <div className="form-group"><label className="form-label">Vendor Name</label><input type="text" className="form-input" required value={vendorForm.name} onChange={e => setVendorForm({...vendorForm, name: e.target.value})} /></div>
                                <div className="grid-2">
                                    <div className="form-group"><label className="form-label">Contact Person</label><input type="text" className="form-input" value={vendorForm.contact_person} onChange={e => setVendorForm({...vendorForm, contact_person: e.target.value})} /></div>
                                    <div className="form-group"><label className="form-label">Phone</label><input type="text" className="form-input" value={vendorForm.phone} onChange={e => setVendorForm({...vendorForm, phone: e.target.value})} /></div>
                                </div>
                                <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-input" value={vendorForm.email} onChange={e => setVendorForm({...vendorForm, email: e.target.value})} /></div>
                                <div className="form-group"><label className="form-label">Address</label><textarea className="form-input" value={vendorForm.address} onChange={e => setVendorForm({...vendorForm, address: e.target.value})} /></div>
                                <div className="grid-2">
                                    <div className="form-group"><label className="form-label">GSTIN</label><input type="text" className="form-input" value={vendorForm.gstin} onChange={e => setVendorForm({...vendorForm, gstin: e.target.value})} /></div>
                                    <div className="form-group"><label className="form-label">Opening Balance</label><input type="number" className="form-input" value={vendorForm.opening_balance} onChange={e => setVendorForm({...vendorForm, opening_balance: e.target.value})} /></div>
                                </div>
                            </div>
                            <div className="modal-footer"><button type="submit" className="btn btn-primary w-full">Save Vendor</button></div>
                        </form>
                    </div>
                </div>
            )}

            {showInvoiceForm && (
                <div className="modal-overlay" onClick={() => setShowInvoiceForm(false)}>
                    <div className="modal" style={{ maxWidth: 800 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Record New Purchase Bill</h3>
                            <button className="modal-close" onClick={() => setShowInvoiceForm(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleInvoiceSubmit}>
                            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                                <div className="grid-3">
                                    <div className="form-group"><label className="form-label">Bill # (Vendor's)</label><input type="text" className="form-input" required value={invoiceForm.bill_no} onChange={e => setInvoiceForm({...invoiceForm, bill_no: e.target.value})} /></div>
                                    <DateInput label="Date" required value={invoiceForm.date} onChange={e => setInvoiceForm({...invoiceForm, date: e.target.value})} />
                                    <div className="form-group"><label className="form-label">Tax (%)</label><input type="number" className="form-input" required value={invoiceForm.tax_percent} onChange={e => setInvoiceForm({...invoiceForm, tax_percent: e.target.value})} /></div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Vendor</label>
                                    <select className="form-select" required value={invoiceForm.vendor_id} onChange={e => setInvoiceForm({...invoiceForm, vendor_id: e.target.value})}>
                                        <option value="">— Select Vendor —</option>
                                        {vendors.map(v => <option key={v._id} value={v._id}>{v.name} {v.current_balance > 0 ? `(O/S: ₹${v.current_balance})` : ''}</option>)}
                                    </select>
                                </div>

                                <div style={{ marginTop: 20 }}>
                                    <div className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>Items <span>Total Bill: ₹{calculateInvoiceTotal().toLocaleString('en-IN')}</span></div>
                                    {invoiceForm.line_items.map((line, idx) => (
                                        <div key={idx} className="grid-3" style={{ gap: 10, background: 'rgba(0,0,0,0.02)', padding: 10, borderRadius: 8, marginBottom: 10, alignItems: 'flex-end' }}>
                                            <div className="form-group" style={{ marginBottom: 0 }}>
                                                <select className="form-select" required value={line.item_id} onChange={e => updateLineItem(idx, 'item_id', e.target.value)}>
                                                    <option value="">— Select Item —</option>
                                                    {items.map(i => <option key={i._id} value={i._id}>{i.name}</option>)}
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
                            <div className="modal-footer"><button type="submit" className="btn btn-primary w-full">Save Purchase Bill</button></div>
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
