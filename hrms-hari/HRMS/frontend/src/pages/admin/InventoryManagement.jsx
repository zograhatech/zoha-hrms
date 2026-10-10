import { useState, useEffect, useCallback } from 'react';
import API from '../../api/axios';
import {
    FiPlus, FiPackage, FiTruck, FiActivity, 
    FiAlertCircle, FiTrendingUp, FiTrendingDown,
    FiSearch, FiX, FiInfo, FiTag, FiDownload, FiChevronDown
} from 'react-icons/fi';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/dateFormatter';
import DateInput from '../../components/DateInput';

export default function InventoryManagement() {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [summary, setSummary] = useState(null);
    const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, stock, transactions

    const [showItemForm, setShowItemForm] = useState(false);
    const [showStockMoveForm, setShowStockMoveForm] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);

    const [itemForm, setItemForm] = useState({
        name: '',
        group: 'General',
        unit: 'Nos',
        opening_stock: 0,
        purchase_price: 0,
        selling_price: 0,
        low_stock_threshold: 5,
        description: ''
    });

    const [stockMoveForm, setStockMoveForm] = useState({
        date: new Date().toISOString().split('T')[0],
        item_id: '',
        type: 'Purchase',
        quantity: '',
        rate: '',
        ref_no: '',
        narration: ''
    });

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [iRes, tRes, sRes] = await Promise.all([
                API.get('/inventory/items'),
                API.get('/inventory/transactions'),
                API.get('/inventory/summary')
            ]);
            setItems(iRes.data.items || []);
            setTransactions(tRes.data.transactions || []);
            setSummary(sRes.data.summary || null);
        } catch (err) {
            showToast('Failed to load inventory data', 'error');
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

    const handleItemSubmit = async (e) => {
        e.preventDefault();
        try {
            await API.post('/inventory/items', itemForm);
            showToast('Item created successfully', 'success');
            setShowItemForm(false);
            setItemForm({
                name: '', group: 'General', unit: 'Nos', 
                opening_stock: 0, purchase_price: 0, 
                selling_price: 0, low_stock_threshold: 5, description: ''
            });
            loadData();
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to create item', 'error');
        }
    };

    const handleStockMoveSubmit = async (e) => {
        e.preventDefault();
        try {
            await API.post('/inventory/transactions', stockMoveForm);
            showToast('Stock movement recorded', 'success');
            setShowStockMoveForm(false);
            setStockMoveForm({
                date: new Date().toISOString().split('T')[0],
                item_id: '', type: 'Purchase', quantity: '', 
                rate: '', ref_no: '', narration: ''
            });
            loadData();
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to record movement', 'error');
        }
    };

    const handleExport = (type = activeTab) => {
        let csvContent = "\uFEFF"; // BOM for Excel
        let fileName = "";
        const today = new Date().toISOString().split('T')[0];
        const exportType = (type === 'dashboard') ? 'stock' : type;

        if (exportType === 'stock') {
            const headers = ["Item Name", "Group", "Unit", "Purchase Price", "Selling Price", "Stock On Hand", "Status"];
            const rows = items.map(item => [
                `"${item.name.replace(/"/g, '""')}"`,
                item.group,
                item.unit,
                item.purchase_price,
                item.selling_price,
                item.current_stock,
                item.current_stock <= item.low_stock_threshold ? "Low Stock" : "Available"
            ]);
            csvContent += [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
            fileName = `Stock_Sheet_${today}.csv`;
        } else if (exportType === 'movements') {
            const headers = ["Date", "Item", "Type", "Qty", "Rate", "Total Amount", "Reference"];
            const rows = transactions.map(tx => [
                formatDate(tx.date),
                `"${(tx.item?.name || "").replace(/"/g, '""')}"`,
                tx.type,
                tx.quantity,
                tx.rate,
                tx.total_amount,
                tx.ref_no || ""
            ]);
            csvContent += [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
            fileName = `Stock_Movements_${today}.csv`;
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
        <div className="inventory-management">
            <div className="page-header">
                <div>
                    <div className="page-title"><FiPackage style={{ marginRight: 8, verticalAlign: 'middle' }} /> Inventory Management</div>
                    <div className="page-subtitle">Track stock levels, purchases, and sales</div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative' }}>
                        <button 
                            className="btn btn-outline" 
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowExportMenu(!showExportMenu);
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                        >
                            <FiDownload /> <span>Export</span> <FiChevronDown />
                        </button>
                        {showExportMenu && (
                            <div className="dropdown-menu export-menu">
                                <button className="dropdown-item" onClick={() => handleExport('stock')}>
                                    <FiPackage size={14} /> Stock Sheet
                                </button>
                                <button className="dropdown-item" onClick={() => handleExport('movements')}>
                                    <FiActivity size={14} /> Movements
                                </button>
                            </div>
                        )}
                    </div>
                    <button className="btn btn-outline" onClick={() => setShowItemForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FiPlus /> <span>New Item</span>
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowStockMoveForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FiTruck /> <span>Stock Movement</span>
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs-container" style={{ marginBottom: 24, borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 24 }}>
                {['Dashboard', 'Stock Sheet', 'Movements'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab.toLowerCase().split(' ')[0])}
                        style={{
                            padding: '12px 4px',
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === tab.toLowerCase().split(' ')[0] ? '2px solid var(--accent-primary)' : '2px solid transparent',
                            color: activeTab === tab.toLowerCase().split(' ')[0] ? 'var(--accent-primary)' : 'var(--text-muted)',
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
                    <div className="grid-4" style={{ marginBottom: 24 }}>
                        <div className="card stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}><FiPackage /></div>
                            <div className="stat-info">
                                <div className="stat-label">Total SKUs</div>
                                <div className="stat-value">{summary?.totalItems || 0}</div>
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}><FiActivity /></div>
                            <div className="stat-info">
                                <div className="stat-label">Inventory Value</div>
                                <div className="stat-value">₹{(summary?.totalValue || 0).toLocaleString('en-IN')}</div>
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}><FiAlertCircle /></div>
                            <div className="stat-info">
                                <div className="stat-label">Low Stock Items</div>
                                <div className="stat-value">{summary?.lowStockCount || 0}</div>
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}><FiTruck /></div>
                            <div className="stat-info">
                                <div className="stat-label">Total Movements</div>
                                <div className="stat-value">{transactions.length}</div>
                            </div>
                        </div>
                    </div>

                    <div className="grid-2">
                        <div className="card">
                            <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}><FiAlertCircle color="#ef4444" /> Low Stock Alerts</h3>
                            <div className="list-container">
                                {summary?.lowStockItems?.map(item => (
                                    <div key={item._id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{item.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Threshold: {item.low_stock_threshold} {item.unit}</div>
                                        </div>
                                        <div style={{ fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '4px 10px', borderRadius: 20, fontSize: '0.8rem' }}>
                                            {item.current_stock} {item.unit} LEFT
                                        </div>
                                    </div>
                                ))}
                                {summary?.lowStockItems?.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>All items well stocked.</p>}
                            </div>
                        </div>

                        <div className="card">
                            <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}><FiActivity /> Recent Movements</h3>
                            <div className="list-container">
                                {transactions.slice(0, 5).map(tx => (
                                    <div key={tx._id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{tx.item?.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatDate(tx.date)} · {tx.type}</div>
                                        </div>
                                        <div style={{ fontWeight: 700, color: tx.type === 'Purchase' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                            {tx.type === 'Purchase' ? '+' : '-'} {tx.quantity} {tx.item?.unit}
                                        </div>
                                    </div>
                                ))}
                                {transactions.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>No movements recorded.</p>}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'stock' && (
                <div className="card" style={{ padding: 0 }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Item Name</th>
                                <th>Group</th>
                                <th>Unit</th>
                                <th>Purchase Price</th>
                                <th>Selling Price</th>
                                <th>Stock On Hand</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(item => (
                                <tr key={item._id}>
                                    <td style={{ fontWeight: 600 }}>{item.name}</td>
                                    <td><span className="badge badge-info">{item.group}</span></td>
                                    <td>{item.unit}</td>
                                    <td>₹{item.purchase_price.toLocaleString('en-IN')}</td>
                                    <td>₹{item.selling_price.toLocaleString('en-IN')}</td>
                                    <td style={{ fontWeight: 700 }}>{item.current_stock}</td>
                                    <td>
                                        {item.current_stock <= item.low_stock_threshold ? (
                                            <span className="badge badge-danger">Low Stock</span>
                                        ) : (
                                            <span className="badge badge-success">Available</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'movements' && (
                <div className="card" style={{ padding: 0 }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Item</th>
                                <th>Type</th>
                                <th>Qty</th>
                                <th>Rate</th>
                                <th>Total Amount</th>
                                <th>Reference</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.map(tx => (
                                <tr key={tx._id}>
                                    <td>{formatDate(tx.date)}</td>
                                    <td style={{ fontWeight: 600 }}>{tx.item?.name}</td>
                                    <td><span className={`badge badge-${tx.type === 'Purchase' ? 'success' : tx.type === 'Sales' ? 'danger' : 'purple'}`}>{tx.type}</span></td>
                                    <td style={{ fontWeight: 700 }}>{tx.quantity}</td>
                                    <td>₹{tx.rate.toLocaleString('en-IN')}</td>
                                    <td>₹{tx.total_amount.toLocaleString('en-IN')}</td>
                                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{tx.ref_no || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modals */}
            {showItemForm && (
                <div className="modal-overlay" onClick={() => setShowItemForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Create New Stock Item</h3>
                            <button className="modal-close" onClick={() => setShowItemForm(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleItemSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Item Name</label>
                                    <input type="text" className="form-input" value={itemForm.name} onChange={e => setItemForm({...itemForm, name: e.target.value})} placeholder="e.g. Laptop, Printer Ink, Chair" required />
                                </div>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Group</label>
                                        <input type="text" className="form-input" value={itemForm.group} onChange={e => setItemForm({...itemForm, group: e.target.value})} placeholder="Electronics, Stationery" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Unit of Measure</label>
                                        <input type="text" className="form-input" value={itemForm.unit} onChange={e => setItemForm({...itemForm, unit: e.target.value})} placeholder="Nos, Kgs, Pkts" />
                                    </div>
                                </div>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Purchase Price</label>
                                        <input type="number" className="form-input" value={itemForm.purchase_price} onChange={e => setItemForm({...itemForm, purchase_price: e.target.value})} placeholder="0.00" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Selling Price</label>
                                        <input type="number" className="form-input" value={itemForm.selling_price} onChange={e => setItemForm({...itemForm, selling_price: e.target.value})} placeholder="0.00" />
                                    </div>
                                </div>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Opening Stock</label>
                                        <input type="number" className="form-input" value={itemForm.opening_stock} onChange={e => setItemForm({...itemForm, opening_stock: e.target.value})} placeholder="0" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Min Stock Level</label>
                                        <input type="number" className="form-input" value={itemForm.low_stock_threshold} onChange={e => setItemForm({...itemForm, low_stock_threshold: e.target.value})} placeholder="5" />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Description</label>
                                    <textarea className="form-input" value={itemForm.description} onChange={e => setItemForm({...itemForm, description: e.target.value})} placeholder="Technical details, storage info..." />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowItemForm(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary w-full">Save Item</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showStockMoveForm && (
                <div className="modal-overlay" onClick={() => setShowStockMoveForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Record Stock Movement</h3>
                            <button className="modal-close" onClick={() => setShowStockMoveForm(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleStockMoveSubmit}>
                            <div className="modal-body">
                                <div className="grid-2">
                                    <DateInput label="Date" value={stockMoveForm.date} onChange={e => setStockMoveForm({...stockMoveForm, date: e.target.value})} required />
                                    <div className="form-group">
                                        <label className="form-label">Type</label>
                                        <select className="form-select" value={stockMoveForm.type} onChange={e => setStockMoveForm({...stockMoveForm, type: e.target.value})} required>
                                            <option value="Purchase">Purchase (Stock In)</option>
                                            <option value="Sales">Sales (Stock Out)</option>
                                            <option value="Adjustment">Adjustment</option>
                                            <option value="Return">Return</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Select Item</label>
                                    <select className="form-select" value={stockMoveForm.item_id} onChange={e => setStockMoveForm({...stockMoveForm, item_id: e.target.value})} required>
                                        <option value="">— Select Stock Item —</option>
                                        {items.map(i => <option key={i._id} value={i._id}>{i.name} (Stock: {i.current_stock})</option>)}
                                    </select>
                                </div>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Quantity</label>
                                        <input type="number" className="form-input" value={stockMoveForm.quantity} onChange={e => setStockMoveForm({...stockMoveForm, quantity: e.target.value})} placeholder="0" required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Rate</label>
                                        <input type="number" className="form-input" value={stockMoveForm.rate} onChange={e => setStockMoveForm({...stockMoveForm, rate: e.target.value})} placeholder="0.00" required />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Reference No. (Bill #)</label>
                                    <input type="text" className="form-input" value={stockMoveForm.ref_no} onChange={e => setStockMoveForm({...stockMoveForm, ref_no: e.target.value})} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Narration</label>
                                    <textarea className="form-input" value={stockMoveForm.narration} onChange={e => setStockMoveForm({...stockMoveForm, narration: e.target.value})} placeholder="Details of move..." />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowStockMoveForm(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary w-full">Save Movement</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
                .data-table th { padding: 12px 20px; text-align: left; background: rgba(99,102,241,0.05); color: var(--text-secondary); font-size: 0.75rem; font-weight: 700; border-bottom: 1px solid var(--border-color); }
                .data-table td { padding: 12px 20px; border-bottom: 1px solid var(--border-color); font-size: 0.85rem; }
                .stat-value { font-size: 1.5rem !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                @media (max-width: 1200px) { .grid-4 { grid-template-columns: repeat(2, 1fr); } }
                @media (max-width: 600px) { .grid-4 { grid-template-columns: 1fr; } }
                .dropdown-item {
                    width: 100%;
                    padding: 12px 16px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    background: none;
                    border: none;
                    color: var(--text-primary);
                    font-size: 0.85rem;
                    font-weight: 500;
                    cursor: pointer;
                    text-align: left;
                    transition: var(--transition);
                }
                .dropdown-item:hover {
                    background: rgba(99,102,241,0.08);
                    color: var(--accent-primary);
                }
            `}</style>
        </div>
    );
}
