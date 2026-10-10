import { useState, useEffect, useCallback } from 'react';
import API from '../../api/axios';
import {
    FiPercent, FiTrendingUp, FiTrendingDown, 
    FiCalendar, FiDownload, FiInfo, FiActivity, FiCreditCard
} from 'react-icons/fi';
import DateInput from '../../components/DateInput';
import { useToast } from '../../context/ToastContext';

export default function TaxationManagement() {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState(null);
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: ''
    });

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await API.get('/tax/summary', { params: filters });
            setSummary(res.data.summary);
        } catch (err) {
            showToast('Failed to load taxation data', 'error');
        } finally {
            setLoading(false);
        }
    }, [filters, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;

    return (
        <div className="taxation-management">
            <div className="page-header">
                <div>
                    <div className="page-title"><FiPercent style={{ marginRight: 8, verticalAlign: 'middle' }} /> GST & Taxation</div>
                    <div className="page-subtitle">Track GSTR summary, ITC, and liability</div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <DateInput value={filters.startDate} onChange={e => setFilters({...filters, startDate: e.target.value})} />
                    <DateInput value={filters.endDate} onChange={e => setFilters({...filters, endDate: e.target.value})} />
                    <button className="btn btn-outline" onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <FiDownload /> Print Report
                    </button>
                </div>
            </div>

            <div className="grid-3" style={{ marginBottom: 24 }}>
                <div className="card stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}><FiTrendingUp /></div>
                    <div className="stat-info">
                        <div className="stat-label">Output GST (Sales)</div>
                        <div className="stat-value">₹{(summary?.outputGST || 0).toLocaleString('en-IN')}</div>
                    </div>
                </div>
                <div className="card stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}><FiTrendingDown /></div>
                    <div className="stat-info">
                        <div className="stat-label">Input Tax Credit (Purchase)</div>
                        <div className="stat-value">₹{(summary?.inputGST || 0).toLocaleString('en-IN')}</div>
                    </div>
                </div>
                <div className="card stat-card">
                    <div className="stat-icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}><FiActivity /></div>
                    <div className="stat-info">
                        <div className="stat-label">Net GST Payable</div>
                        <div className="stat-value" style={{ color: (summary?.netGST || 0) > 0 ? '#ef4444' : '#10b981' }}>
                            ₹{Math.abs(summary?.netGST || 0).toLocaleString('en-IN')}
                            <span style={{ fontSize: '0.8rem', marginLeft: 6 }}>{(summary?.netGST || 0) >= 0 ? '(DR)' : '(CR)'}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid-2">
                <div className="card">
                    <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}><FiTrendingUp color="#ef4444" /> GSTR-1 (Sales Breakdown)</h3>
                    <table className="data-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Tax Rate</th>
                                <th>Taxable Amount</th>
                                <th>Total GST</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(summary?.salesByRate || {}).map(([rate, data]) => (
                                <tr key={rate}>
                                    <td style={{ fontWeight: 600 }}>{rate}% GST</td>
                                    <td>₹{data.taxable.toLocaleString('en-IN')}</td>
                                    <td style={{ fontWeight: 700, color: '#ef4444' }}>₹{data.tax.toLocaleString('en-IN')}</td>
                                </tr>
                            ))}
                            {Object.keys(summary?.salesByRate || {}).length === 0 && <tr><td colSpan="3" style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No sales recorded.</td></tr>}
                        </tbody>
                    </table>
                </div>

                <div className="card">
                    <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}><FiTrendingDown color="#10b981" /> Input Tax (Purchase Breakdown)</h3>
                    <table className="data-table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Tax Rate</th>
                                <th>Taxable Amount</th>
                                <th>Total GST</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(summary?.purchaseByRate || {}).map(([rate, data]) => (
                                <tr key={rate}>
                                    <td style={{ fontWeight: 600 }}>{rate}% GST</td>
                                    <td>₹{data.taxable.toLocaleString('en-IN')}</td>
                                    <td style={{ fontWeight: 700, color: '#10b981' }}>₹{data.tax.toLocaleString('en-IN')}</td>
                                </tr>
                            ))}
                            {Object.keys(summary?.purchaseByRate || {}).length === 0 && <tr><td colSpan="3" style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No purchases recorded.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card" style={{ marginTop: 24, background: 'rgba(99,102,241,0.05)', border: '1px dashed var(--accent-primary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <FiInfo size={24} color="var(--accent-primary)" />
                    <div>
                        <div style={{ fontWeight: 600 }}>Tax Compliance Note</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            This report is automatically generated based on all finalized Sales & Purchase invoices.
                            Ensure your company's GSTIN is correctly configured in <strong>Settings</strong> for legal compliance.
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .data-table th { padding: 12px 20px; text-align: left; background: rgba(99,102,241,0.05); color: var(--text-secondary); font-size: 0.75rem; font-weight: 700; border-bottom: 1px solid var(--border-color); }
                .data-table td { padding: 12px 20px; border-bottom: 1px solid var(--border-color); font-size: 0.85rem; }
                @media print {
                    .page-header, .tabs-container { display: none; }
                    .card { border: 1px solid #ccc; box-shadow: none; }
                }
            `}</style>
        </div>
    );
}
