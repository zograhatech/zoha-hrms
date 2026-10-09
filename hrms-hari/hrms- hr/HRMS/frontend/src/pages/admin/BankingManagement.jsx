import { useState, useEffect, useCallback } from 'react';
import API from '../../api/axios';
import {
    FiPlus, FiTrendingUp, FiTrendingDown,
    FiCalendar, FiActivity, FiX, FiCheckCircle,
    FiSearch, FiArrowRight, FiHome, FiDownload, FiChevronDown, FiInfo
} from 'react-icons/fi';
import DateInput from '../../components/DateInput';
import { FaRupeeSign } from 'react-icons/fa6';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/dateFormatter';

export default function BankingManagement() {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [accounts, setAccounts] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [summary, setSummary] = useState(null);
    const [activeTab, setActiveTab] = useState('accounts');

    const [showAccountForm, setShowAccountForm] = useState(false);
    const [showTxForm, setShowTxForm] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);

    const [accountForm, setAccountForm] = useState({
        account_name: '', bank_name: '', account_number: '', ifsc_code: '', branch: '', account_type: 'Current', opening_balance: 0
    });

    const [txForm, setTxForm] = useState({
        date: new Date().toISOString().split('T')[0],
        account_id: '',
        type: 'Deposit',
        amount: '',
        ref_no: '',
        description: '',
        to_account_id: ''
    });

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [aRes, tRes, sRes] = await Promise.all([
                API.get('/banking/accounts'),
                API.get('/banking/transactions'),
                API.get('/banking/summary')
            ]);
            setAccounts(aRes.data.accounts || []);
            setTransactions(tRes.data.transactions || []);
            setSummary(sRes.data.summary || null);
        } catch (err) {
            showToast('Failed to load banking data', 'error');
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

    const handleAccountSubmit = async (e) => {
        e.preventDefault();
        try {
            await API.post('/banking/accounts', accountForm);
            showToast('Bank account added!', 'success');
            setShowAccountForm(false);
            setAccountForm({ account_name: '', bank_name: '', account_number: '', ifsc_code: '', branch: '', account_type: 'Current', opening_balance: 0 });
            loadData();
        } catch (err) {
            showToast(err.response?.data?.message || 'Error adding account', 'error');
        }
    };

    const handleTxSubmit = async (e) => {
        e.preventDefault();
        try {
            await API.post('/banking/transactions', txForm);
            showToast('Transaction recorded!', 'success');
            setShowTxForm(false);
            setTxForm({ date: new Date().toISOString().split('T')[0], account_id: '', type: 'Deposit', amount: '', ref_no: '', description: '', to_account_id: '' });
            loadData();
        } catch (err) {
            showToast(err.response?.data?.message || 'Error recording transaction', 'error');
        }
    };

    const handleExport = (type = activeTab) => {
        let csvContent = "\uFEFF"; // BOM for Excel
        let fileName = "";
        const today = new Date().toISOString().split('T')[0];
        const exportType = (type === 'dashboard' || type === 'accounts') ? 'accounts' : 'transactions';

        if (exportType === 'accounts') {
            const headers = ["Account Name", "Bank", "Account Number", "Type", "IFSC", "Branch", "Current Balance"];
            const rows = accounts.map(acc => [
                `"${acc.account_name.replace(/"/g, '""')}"`,
                `"${acc.bank_name.replace(/"/g, '""')}"`,
                `'${acc.account_number}`, 
                acc.account_type,
                acc.ifsc_code || "",
                `"${(acc.branch || "").replace(/"/g, '""')}"`,
                acc.current_balance
            ]);
            csvContent += [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
            fileName = `Bank_Accounts_${today}.csv`;
        } else if (exportType === 'transactions') {
            const headers = ["Date", "Account", "Type", "Amount", "Reference", "Description"];
            const rows = transactions.map(tx => [
                formatDate(tx.date),
                `"${(tx.account?.account_name || "").replace(/"/g, '""')}"`,
                tx.type,
                tx.amount,
                tx.ref_no || "",
                `"${(tx.description || "").replace(/"/g, '""')}"`
            ]);
            csvContent += [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
            fileName = `Bank_Transactions_${today}.csv`;
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
        <div className="banking-management">
            <div className="page-header">
                <div>
                    <div className="page-title"><FiHome style={{ marginRight: 8, verticalAlign: 'middle' }} /> Banking Management</div>
                    <div className="page-subtitle">Manage bank accounts, record deposits, and track cash flow</div>
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
                                <button className="dropdown-item" onClick={() => handleExport('accounts')}>
                                    <FiHome size={14} /> Accounts
                                </button>
                                <button className="dropdown-item" onClick={() => handleExport('transactions')}>
                                    <FiActivity size={14} /> Transactions
                                </button>
                            </div>
                        )}
                    </div>
                    <button className="btn btn-outline" onClick={() => setShowAccountForm(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <FiPlus /> <span>Add Bank Account</span>
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowTxForm(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <FiPlus /> <span>New Transaction</span>
                    </button>
                </div>
            </div>

            <div className="grid-3" style={{ marginBottom: 24 }}>
                <div className="card stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}><FaRupeeSign /></div>
                    <div className="stat-info">
                        <div className="stat-label">Total Liquid Cash</div>
                        <div className="stat-value">₹{(summary?.totalBalance || 0).toLocaleString('en-IN')}</div>
                    </div>
                </div>
                <div className="card stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}><FiHome /></div>
                    <div className="stat-info">
                        <div className="stat-label">Active Accounts</div>
                        <div className="stat-value">{summary?.accountCount || 0}</div>
                    </div>
                </div>
                <div className="card stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}><FiActivity /></div>
                    <div className="stat-info">
                        <div className="stat-label">Pending Transfers</div>
                        <div className="stat-value">₹0</div>
                    </div>
                </div>
            </div>

            <div className="tabs-container" style={{ marginBottom: 24, borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 24 }}>
                {['Accounts', 'Transactions'].map(tab => (
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
                            fontSize: '0.9rem'
                        }}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {activeTab === 'accounts' && (
                <div className="grid-3">
                    {accounts.map(acc => (
                        <div key={acc._id} className="card" style={{ position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: -10, right: -10, fontStyle: 'italic', fontWeight: 900, fontSize: '3rem', opacity: 0.05, pointerEvents: 'none' }}>
                                {acc.bank_name.slice(0, 3).toUpperCase()}
                            </div>
                            <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 4 }}>{acc.account_name}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 16 }}>{acc.bank_name} · {acc.account_number}</div>
                            
                            <div style={{ background: 'rgba(0,0,0,0.03)', padding: '12px', borderRadius: 8, marginBottom: 16 }}>
                                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Available Balance</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-primary)' }}>₹{acc.current_balance.toLocaleString('en-IN')}</div>
                            </div>
                            
                            <div className="grid-2" style={{ fontSize: '0.75rem' }}>
                                <div><span style={{ opacity: 0.6 }}>Type:</span> {acc.account_type}</div>
                                <div style={{ textAlign: 'right' }}><span style={{ opacity: 0.6 }}>IFSC:</span> {acc.ifsc_code}</div>
                            </div>
                        </div>
                    ))}
                    {accounts.length === 0 && <div className="card grid-span-3" style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>No bank accounts found.</div>}
                </div>
            )}

            {activeTab === 'transactions' && (
                <div className="card" style={{ padding: 0 }}>
                    <table className="data-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Account</th>
                                <th>Type</th>
                                <th>Description</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.map(tx => (
                                <tr key={tx._id}>
                                    <td>{formatDate(tx.date)}</td>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{tx.account?.account_name}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{tx.account?.bank_name}</div>
                                    </td>
                                    <td>
                                        <span className={`badge badge-${tx.type === 'Deposit' ? 'success' : tx.type === 'Withdrawal' ? 'danger' : 'info'}`}>
                                            {tx.type}
                                        </span>
                                    </td>
                                    <td>
                                        <div>{tx.description}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ref: {tx.ref_no || '—'}</div>
                                    </td>
                                    <td style={{ fontWeight: 700, color: (tx.type === 'Deposit' || tx.type === 'Interest') ? '#10b981' : '#ef4444' }}>
                                        { (tx.type === 'Deposit' || tx.type === 'Interest') ? '+' : '-' } ₹{tx.amount.toLocaleString('en-IN')}
                                    </td>
                                </tr>
                            ))}
                            {transactions.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', padding: 20 }}>No transactions recorded.</td></tr>}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modals */}
            {showAccountForm && (
                <div className="modal-overlay" onClick={() => setShowAccountForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Link New Bank Account</h3>
                            <button className="modal-close" onClick={() => setShowAccountForm(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleAccountSubmit}>
                            <div className="modal-body">
                                <div className="form-group"><label className="form-label">Internal Account Name (e.g. Salary A/c)</label><input type="text" className="form-input" required value={accountForm.account_name} onChange={e => setAccountForm({...accountForm, account_name: e.target.value})} /></div>
                                <div className="grid-2">
                                    <div className="form-group"><label className="form-label">Bank Name</label><input type="text" className="form-input" required value={accountForm.bank_name} onChange={e => setAccountForm({...accountForm, bank_name: e.target.value})} /></div>
                                    <div className="form-group"><label className="form-label">Account Number</label><input type="text" className="form-input" required value={accountForm.account_number} onChange={e => setAccountForm({...accountForm, account_number: e.target.value})} /></div>
                                </div>
                                <div className="grid-2">
                                    <div className="form-group"><label className="form-label">IFSC Code</label><input type="text" className="form-input" value={accountForm.ifsc_code} onChange={e => setAccountForm({...accountForm, ifsc_code: e.target.value})} /></div>
                                    <div className="form-group"><label className="form-label">Branch</label><input type="text" className="form-input" value={accountForm.branch} onChange={e => setAccountForm({...accountForm, branch: e.target.value})} /></div>
                                </div>
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label className="form-label">Account Type</label>
                                        <select className="form-select" value={accountForm.account_type} onChange={e => setAccountForm({...accountForm, account_type: e.target.value})}>
                                            <option value="Current">Current</option>
                                            <option value="Savings">Savings</option>
                                            <option value="OD">OD</option>
                                            <option value="Cash">Cash / Petty Cash</option>
                                        </select>
                                    </div>
                                    <div className="form-group"><label className="form-label">Opening Balance</label><input type="number" className="form-input" value={accountForm.opening_balance} onChange={e => setAccountForm({...accountForm, opening_balance: e.target.value})} /></div>
                                </div>
                            </div>
                            <div className="modal-footer"><button type="submit" className="btn btn-primary w-full">Save Account</button></div>
                        </form>
                    </div>
                </div>
            )}

            {showTxForm && (
                <div className="modal-overlay" onClick={() => setShowTxForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Record Bank Transaction</h3>
                            <button className="modal-close" onClick={() => setShowTxForm(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleTxSubmit}>
                            <div className="modal-body">
                                <div className="grid-2">
                                    <DateInput label="Date" required value={txForm.date} onChange={e => setTxForm({...txForm, date: e.target.value})} />
                                    <div className="form-group">
                                        <label className="form-label">Type</label>
                                        <select className="form-select" required value={txForm.type} onChange={e => setTxForm({...txForm, type: e.target.value})}>
                                            <option value="Deposit">Deposit (Cash/Cheque)</option>
                                            <option value="Withdrawal">Withdrawal (ATM/Bank)</option>
                                            <option value="Transfer">Account Transfer</option>
                                            <option value="Interest">Interest Received</option>
                                            <option value="Charges">Bank Charges / Fees</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Primary Account</label>
                                    <select className="form-select" required value={txForm.account_id} onChange={e => setTxForm({...txForm, account_id: e.target.value})}>
                                        <option value="">— Select Account —</option>
                                        {accounts.map(a => <option key={a._id} value={a._id}>{a.account_name} ({a.bank_name})</option>)}
                                    </select>
                                </div>
                                {txForm.type === 'Transfer' && (
                                    <div className="form-group">
                                        <label className="form-label">Destination Account</label>
                                        <select className="form-select" required value={txForm.to_account_id} onChange={e => setTxForm({...txForm, to_account_id: e.target.value})}>
                                            <option value="">— Select Destination —</option>
                                            {accounts.filter(a => a._id !== txForm.account_id).map(a => <option key={a._id} value={a._id}>{a.account_name} ({a.bank_name})</option>)}
                                        </select>
                                    </div>
                                )}
                                <div className="grid-2">
                                    <div className="form-group"><label className="form-label">Amount (₹)</label><input type="number" className="form-input" required value={txForm.amount} onChange={e => setTxForm({...txForm, amount: e.target.value})} /></div>
                                    <div className="form-group"><label className="form-label">Ref # (UTR/Cheque)</label><input type="text" className="form-input" value={txForm.ref_no} onChange={e => setTxForm({...txForm, ref_no: e.target.value})} /></div>
                                </div>
                                <div className="form-group"><label className="form-label">Description</label><input type="text" className="form-input" value={txForm.description} onChange={e => setTxForm({...txForm, description: e.target.value})} /></div>
                            </div>
                            <div className="modal-footer"><button type="submit" className="btn btn-primary w-full">Record Entry</button></div>
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
