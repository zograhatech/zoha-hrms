import { useState, useEffect, useCallback } from 'react';
import API from '../../api/axios';
import {
    FiPlus, FiFileText, FiTrendingUp, FiTrendingDown, 
    FiActivity, FiPieChart, FiSearch, 
    FiCheckCircle, FiX, FiAlertCircle, FiDownload, FiChevronDown,
    FiEdit2, FiTrash2
} from 'react-icons/fi';
import { FaRupeeSign } from 'react-icons/fa6';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/dateFormatter';
import DateInput from '../../components/DateInput';

export default function AccountingManagement() {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [ledgers, setLedgers] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [balanceSheet, setBalanceSheet] = useState(null);
    const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, transactions, ledgers, balance-sheet

    const [showTransactionForm, setShowTransactionForm] = useState(false);
    const [showLedgerForm, setShowLedgerForm] = useState(false);
    const [editingLedgerId, setEditingLedgerId] = useState(null);
    const [showExportMenu, setShowExportMenu] = useState(false);

    const [txForm, setTxForm] = useState({
        date: new Date().toISOString().split('T')[0],
        type: 'Payment',
        ref_no: '',
        debit_ledger: '',
        credit_ledger: '',
        amount: '',
        narration: ''
    });

    const [ledgerForm, setLedgerForm] = useState({
        name: '',
        group: 'Expenses',
        opening_balance: 0,
        description: ''
    });

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [lRes, tRes, bRes] = await Promise.all([
                API.get('/tally/ledgers'),
                API.get('/tally/transactions'),
                API.get('/tally/balance-sheet')
            ]);
            setLedgers(lRes.data.ledgers || []);
            setTransactions(tRes.data.transactions || []);
            setBalanceSheet(bRes.data.data || null);
        } catch (err) {
            showToast('Failed to load accounting data', 'error');
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

    const handleTransactionSubmit = async (e) => {
        e.preventDefault();
        try {
            await API.post('/tally/transactions', txForm);
            showToast('Transaction recorded successfully', 'success');
            setShowTransactionForm(false);
            setTxForm({
                date: new Date().toISOString().split('T')[0],
                type: 'Payment',
                ref_no: '',
                debit_ledger: '',
                credit_ledger: '',
                amount: '',
                narration: ''
            });
            loadData();
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to record transaction', 'error');
        }
    };

    const handleLedgerSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingLedgerId) {
                await API.put(`/tally/ledgers/${editingLedgerId}`, ledgerForm);
                showToast('Ledger updated successfully', 'success');
            } else {
                await API.post('/tally/ledgers', ledgerForm);
                showToast('Ledger created successfully', 'success');
            }
            setShowLedgerForm(false);
            setEditingLedgerId(null);
            setLedgerForm({
                name: '',
                group: 'Expenses',
                opening_balance: 0,
                description: ''
            });
            loadData();
        } catch (err) {
            showToast(err.response?.data?.message || 'Action failed', 'error');
        }
    };

    const handleDeleteLedger = async (id) => {
        if (!window.confirm('Are you sure you want to delete this ledger?')) return;
        try {
            await API.delete(`/tally/ledgers/${id}`);
            showToast('Ledger deleted successfully', 'success');
            loadData();
        } catch (err) {
            showToast(err.response?.data?.message || 'Deletion failed', 'error');
        }
    };

    const handleExport = (type = activeTab) => {
        let csvContent = "\uFEFF"; // Byte Order Mark for Excel
        let fileName = "";
        const today = new Date().toISOString().split('T')[0];
        const exportType = (type === 'dashboard') ? 'transactions' : type;

        if (exportType === 'transactions') {
            const headers = ["Date", "Type", "Ref #", "Debit Ledger", "Credit Ledger", "Amount", "Narration"];
            const rows = transactions.map(tx => [
                formatDate(tx.date),
                tx.type,
                tx.ref_no || "",
                tx.debit_ledger?.name || "",
                tx.credit_ledger?.name || "",
                tx.amount,
                `"${(tx.narration || "").replace(/"/g, '""')}"`
            ]);
            csvContent += [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
            fileName = `Transactions_Report_${today}.csv`;
        } else if (exportType === 'ledgers') {
            const headers = ["Ledger Name", "Group", "Opening Balance", "Current Balance", "Description"];
            const rows = ledgers.map(l => [
                l.name,
                l.group,
                l.opening_balance,
                l.current_balance,
                `"${(l.description || "").replace(/"/g, '""')}"`
            ]);
            csvContent += [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
            fileName = `Ledgers_List_${today}.csv`;
        } else if (exportType === 'balance-sheet') {
            const headers = ["Category", "Particulars", "Amount"];
            const rows = [
                ["ASSETS", "", ""],
                ...(balanceSheet?.assets || []).map(a => ["", a.name, a.current_balance]),
                ["TOTAL ASSETS", "", balanceSheet?.summary?.totalAssets || 0],
                ["", "", ""],
                ["LIABILITIES", "", ""],
                ...(balanceSheet?.liabilities || []).map(l => ["", l.name, l.current_balance]),
                ["TOTAL LIABILITIES", "", balanceSheet?.summary?.totalLiabilities || 0],
                ["", "", ""],
                ["EQUITY", "", ""],
                ...(balanceSheet?.equity || []).map(e => ["", e.name, e.current_balance]),
                ["TOTAL EQUITY", "", balanceSheet?.summary?.totalEquity || 0]
            ];
            csvContent += [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
            fileName = `Balance_Sheet_${today}.csv`;
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
        <div className="accounting-management">
            <div className="page-header">
                <div>
                    <div className="page-title"><FaRupeeSign style={{ marginRight: 8, verticalAlign: 'middle' }} /> Accounting</div>
                    <div className="page-subtitle">Unified Accounting & Financial Management</div>
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
                                <button className="dropdown-item" onClick={() => handleExport('transactions')}>
                                    <FiActivity size={14} /> Transactions
                                </button>
                                <button className="dropdown-item" onClick={() => handleExport('ledgers')}>
                                    <FiFileText size={14} /> Ledgers List
                                </button>
                                <button className="dropdown-item" onClick={() => handleExport('balance-sheet')}>
                                    <FiTrendingUp size={14} /> Balance Sheet
                                </button>
                            </div>
                        )}
                    </div>
                    <button className="btn btn-outline" onClick={() => {
                        setEditingLedgerId(null);
                        setLedgerForm({ name: '', group: 'Expenses', opening_balance: 0, description: '' });
                        setShowLedgerForm(true);
                    }}>
                        <FiPlus /> New Ledger
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowTransactionForm(true)}>
                        <FiPlus /> Record Voucher
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="tabs-container" style={{ marginBottom: 24, borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 24 }}>
                {['Dashboard', 'Transactions', 'Ledgers', 'Balance Sheet'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab.toLowerCase().replace(' ', '-'))}
                        style={{
                            padding: '12px 4px',
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === tab.toLowerCase().replace(' ', '-') ? '2px solid var(--accent-primary)' : '2px solid transparent',
                            color: activeTab === tab.toLowerCase().replace(' ', '-') ? 'var(--accent-primary)' : 'var(--text-muted)',
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

            {/* Dashboard Content */}
            {activeTab === 'dashboard' && (
                <div>
                    <div className="grid-4" style={{ marginBottom: 24 }}>
                        <div className="card stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}><FiTrendingUp /></div>
                            <div className="stat-info">
                                <div className="stat-label">Total Assets</div>
                                <div className="stat-value" title={`₹${(balanceSheet?.summary?.totalAssets || 0).toLocaleString('en-IN')}`}>₹{(balanceSheet?.summary?.totalAssets || 0).toLocaleString('en-IN')}</div>
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}><FiTrendingDown /></div>
                            <div className="stat-info">
                                <div className="stat-label">Total Liabilities</div>
                                <div className="stat-value" title={`₹${(balanceSheet?.summary?.totalLiabilities || 0).toLocaleString('en-IN')}`}>₹{(balanceSheet?.summary?.totalLiabilities || 0).toLocaleString('en-IN')}</div>
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}><FaRupeeSign /></div>
                            <div className="stat-info">
                                <div className="stat-label">Net Worth (Equity)</div>
                                <div className="stat-value" title={`₹${(balanceSheet?.summary?.totalEquity || 0).toLocaleString('en-IN')}`}>₹{(balanceSheet?.summary?.totalEquity || 0).toLocaleString('en-IN')}</div>
                            </div>
                        </div>
                        <div className="card stat-card">
                            <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}><FiActivity /></div>
                            <div className="stat-info">
                                <div className="stat-label">Recent Vouchers</div>
                                <div className="stat-value" title={transactions.length}>{transactions.length}</div>
                            </div>
                        </div>
                    </div>

                    <div className="grid-2">
                        <div className="card">
                            <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}><FiActivity /> Recent Activity</h3>
                            <div className="list-container">
                                {transactions.slice(0, 5).map(tx => (
                                    <div key={tx._id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{tx.narration || 'No Narration'}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatDate(tx.date)} · {tx.type}</div>
                                        </div>
                                        <div style={{ fontWeight: 700, color: tx.type === 'Receipt' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                            {tx.type === 'Receipt' ? '+' : '-'} ₹{tx.amount.toLocaleString('en-IN')}
                                        </div>
                                    </div>
                                ))}
                                {transactions.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>No recent transactions.</p>}
                            </div>
                        </div>
                        
                        <div className="card">
                            <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}><FiPieChart /> Fund Distribution</h3>
                            {/* Placeholder for a chart or ledger list */}
                            <div className="list-container">
                                {ledgers.filter(l => l.group === 'Assets').slice(0, 5).map(l => (
                                    <div key={l._id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 500 }}>{l.name}</span>
                                        <span style={{ fontWeight: 700 }}>₹{l.current_balance.toLocaleString('en-IN')}</span>
                                    </div>
                                ))}
                                {ledgers.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>No ledgers found.</p>}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Transactions Content */}
            {activeTab === 'transactions' && (
                <div className="card" style={{ padding: 0 }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Ref #</th>
                                <th>Debit Ledger</th>
                                <th>Credit Ledger</th>
                                <th>Amount</th>
                                <th>Narration</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.map(tx => (
                                <tr key={tx._id}>
                                    <td>{formatDate(tx.date)}</td>
                                    <td><span className={`badge badge-${tx.type === 'Receipt' ? 'success' : tx.type === 'Payment' ? 'danger' : 'purple'}`}>{tx.type}</span></td>
                                    <td>{tx.ref_no || '—'}</td>
                                    <td>{tx.debit_ledger?.name}</td>
                                    <td>{tx.credit_ledger?.name}</td>
                                    <td style={{ fontWeight: 700 }}>₹{tx.amount.toLocaleString('en-IN')}</td>
                                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{tx.narration}</td>
                                </tr>
                            ))}
                            {transactions.length === 0 && (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No transactions recorded yet.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Ledgers Content */}
            {activeTab === 'ledgers' && (
                <div className="card" style={{ padding: 0 }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Ledger Name</th>
                                <th>Group</th>
                                <th>Opening Balance</th>
                                <th>Current Balance</th>
                                <th>Description</th>
                                <th style={{ textAlign: 'center' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ledgers.map(l => (
                                <tr key={l._id}>
                                    <td style={{ fontWeight: 600 }}>{l.name}</td>
                                    <td><span className={`badge badge-${
                                        l.group === 'Assets' ? 'success' : 
                                        l.group === 'Liabilities' ? 'danger' : 
                                        l.group === 'Equity' ? 'purple' : 'info'
                                    }`}>{l.group}</span></td>
                                    <td>₹{l.opening_balance.toLocaleString('en-IN')}</td>
                                    <td style={{ fontWeight: 700, color: l.current_balance >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                        ₹{l.current_balance.toLocaleString('en-IN')}
                                    </td>
                                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{l.description || '—'}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                            <button className="btn btn-icon btn-sm" onClick={() => {
                                                setEditingLedgerId(l._id);
                                                setLedgerForm({ name: l.name, group: l.group, opening_balance: l.opening_balance, description: l.description || '' });
                                                setShowLedgerForm(true);
                                            }}><FiEdit2 size={14} /></button>
                                            <button className="btn btn-icon btn-sm" style={{ color: 'var(--accent-red)' }} onClick={() => handleDeleteLedger(l._id)}><FiTrash2 size={14} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {ledgers.length === 0 && (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No ledgers created.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Balance Sheet Content */}
            {activeTab === 'balance-sheet' && (
                <div className="grid-2">
                    <div className="card" style={{ padding: 0 }}>
                        <div style={{ padding: '16px 20px', background: 'rgba(16,185,129,0.1)', borderBottom: '1px solid var(--border-color)', fontWeight: 800, color: '#10b981' }}>ASSETS</div>
                        <div style={{ minHeight: 400 }}>
                            {balanceSheet?.assets?.map(l => (
                                <div key={l._id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{l.name}</span>
                                    <span style={{ fontWeight: 700 }}>₹{l.current_balance.toLocaleString('en-IN')}</span>
                                </div>
                            ))}
                        </div>
                        <div style={{ padding: '16px 20px', background: 'var(--bg-secondary)', fontWeight: 800, display: 'flex', justifyContent: 'space-between' }}>
                            <span>TOTAL ASSETS</span>
                            <span style={{ color: '#10b981' }}>₹{(balanceSheet?.summary?.totalAssets || 0).toLocaleString('en-IN')}</span>
                        </div>
                    </div>

                    <div className="card" style={{ padding: 0 }}>
                        <div style={{ padding: '16px 20px', background: 'rgba(239,68,68,0.1)', borderBottom: '1px solid var(--border-color)', fontWeight: 800, color: '#ef4444' }}>LIABILITIES & EQUITY</div>
                        <div style={{ minHeight: 400 }}>
                            <div style={{ padding: '8px 20px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', background: 'var(--bg-card)' }}>Liabilities</div>
                            {balanceSheet?.liabilities?.map(l => (
                                <div key={l._id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{l.name}</span>
                                    <span style={{ fontWeight: 700 }}>₹{l.current_balance.toLocaleString('en-IN')}</span>
                                </div>
                            ))}
                            <div style={{ padding: '8px 20px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', background: 'var(--bg-card)', marginTop: 16 }}>Equity</div>
                            {balanceSheet?.equity?.map(l => (
                                <div key={l._id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{l.name}</span>
                                    <span style={{ fontWeight: 700 }}>₹{l.current_balance.toLocaleString('en-IN')}</span>
                                </div>
                            ))}
                        </div>
                        <div style={{ padding: '16px 20px', background: 'var(--bg-secondary)', fontWeight: 800, display: 'flex', justifyContent: 'space-between' }}>
                            <span>TOTAL LIABILITIES & EQUITY</span>
                            <span style={{ color: '#ef4444' }}>₹{((balanceSheet?.summary?.totalLiabilities || 0) + (balanceSheet?.summary?.totalEquity || 0)).toLocaleString('en-IN')}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Modals */}
            {showTransactionForm && (
                <div className="modal-overlay" onClick={() => setShowTransactionForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Record Voucher</h3>
                            <button className="modal-close" onClick={() => setShowTransactionForm(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleTransactionSubmit}>
                            <div className="modal-body">
                                <div className="grid-2">
                                    <DateInput label="Date" value={txForm.date} onChange={e => setTxForm({...txForm, date: e.target.value})} required />
                                    <div className="form-group">
                                        <label className="form-label">Type</label>
                                        <select className="form-select" value={txForm.type} onChange={e => setTxForm({...txForm, type: e.target.value})} required>
                                            <option value="Payment">Payment</option>
                                            <option value="Receipt">Receipt</option>
                                            <option value="Journal">Journal</option>
                                            <option value="Contra">Contra</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Debit Ledger (Dr.)</label>
                                    <select className="form-select" value={txForm.debit_ledger} onChange={e => setTxForm({...txForm, debit_ledger: e.target.value})} required>
                                        <option value="">— Select Ledger —</option>
                                        {ledgers.map(l => <option key={l._id} value={l._id}>{l.name} ({l.group})</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Credit Ledger (Cr.)</label>
                                    <select className="form-select" value={txForm.credit_ledger} onChange={e => setTxForm({...txForm, credit_ledger: e.target.value})} required>
                                        <option value="">— Select Ledger —</option>
                                        {ledgers.map(l => <option key={l._id} value={l._id}>{l.name} ({l.group})</option>)}
                                    </select>
                                </div>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Amount (₹)</label>
                                        <input type="number" className="form-input" value={txForm.amount} onChange={e => setTxForm({...txForm, amount: e.target.value})} placeholder="0.00" required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Reference No.</label>
                                        <input type="text" className="form-input" value={txForm.ref_no} onChange={e => setTxForm({...txForm, ref_no: e.target.value})} placeholder="Bill/Cheque #" />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Narration</label>
                                    <textarea className="form-input" value={txForm.narration} onChange={e => setTxForm({...txForm, narration: e.target.value})} placeholder="Description of the transaction..." />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowTransactionForm(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary w-full">Save Voucher</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showLedgerForm && (
                <div className="modal-overlay" onClick={() => setShowLedgerForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editingLedgerId ? 'Edit Ledger' : 'Create New Ledger'}</h3>
                            <button className="modal-close" onClick={() => { setShowLedgerForm(false); setEditingLedgerId(null); }}><FiX /></button>
                        </div>
                        <form onSubmit={handleLedgerSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Ledger Name</label>
                                    <input type="text" className="form-input" value={ledgerForm.name} onChange={e => setLedgerForm({...ledgerForm, name: e.target.value})} placeholder="e.g. HDFC Bank, Office Rent, Petty Cash" required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Group Under</label>
                                    <select className="form-select" value={ledgerForm.group} onChange={e => setLedgerForm({...ledgerForm, group: e.target.value})} required>
                                        <option value="Assets">Assets</option>
                                        <option value="Liabilities">Liabilities</option>
                                        <option value="Equity">Equity</option>
                                        <option value="Income">Income</option>
                                        <option value="Expenses">Expenses</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Opening Balance (₹)</label>
                                    <input type="number" className="form-input" value={ledgerForm.opening_balance} onChange={e => setLedgerForm({...ledgerForm, opening_balance: e.target.value})} placeholder="0.00" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Description</label>
                                    <textarea className="form-input" value={ledgerForm.description} onChange={e => setLedgerForm({...ledgerForm, description: e.target.value})} placeholder="Notes about this ledger..." />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => { setShowLedgerForm(false); setEditingLedgerId(null); }}>Cancel</button>
                                <button type="submit" className="btn btn-primary w-full">{editingLedgerId ? 'Update Ledger' : 'Create Ledger'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
                .tabs-container button {
                    position: relative;
                }
                .tabs-container button:hover {
                    color: var(--accent-primary) !important;
                }
                .data-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .data-table th {
                    text-align: left;
                    padding: 12px 20px;
                    background: rgba(99,102,241,0.05);
                    color: var(--text-secondary);
                    font-size: 0.75rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    border-bottom: 1px solid var(--border-color);
                }
                .data-table td {
                    padding: 12px 20px;
                    border-bottom: 1px solid var(--border-color);
                    font-size: 0.85rem;
                }
                .list-container {
                    display: flex;
                    flex-direction: column;
                }
                .stat-value {
                    font-size: 1.5rem;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                @media (max-width: 1200px) {
                    .grid-4 {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }
                @media (max-width: 600px) {
                    .grid-4 {
                        grid-template-columns: 1fr;
                    }
                    .stat-value {
                        font-size: 1.2rem;
                        white-space: normal;
                        word-break: break-word;
                    }
                }
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
