import { useState, useEffect } from 'react';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import {
    FiCreditCard, FiPrinter, FiBriefcase, FiRotateCcw, FiX
} from 'react-icons/fi';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/dateFormatter';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Utility to convert numbers to words
const numberToWords = (num) => {
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    if ((num = num.toString()).length > 9) return 'overflow';
    let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return '';
    let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + 'Only' : '';
    return 'Indian Rupee ' + str;
};

export default function Payroll() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const { branding } = useBranding();
    const today = new Date();
    const [month, setMonth] = useState(today.getMonth() + 1);
    const [year, setYear] = useState(today.getFullYear());
    const [data, setData] = useState(null);
    const [allPayroll, setAllPayroll] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [viewing, setViewing] = useState(false);

    useEffect(() => {
        if (!user?.id) return;
        API.get(`/payroll/${user.id}`)
            .then(r => setAllPayroll(Array.isArray(r.data.payroll) ? r.data.payroll : [r.data.payroll].filter(Boolean)))
            .catch(() => { });
    }, [user]);

    useEffect(() => {
        let mounted = true;
        if (!user?.id) return;
        
        const fetchPayrollDetails = async () => {
            setLoading(true);
            setError('');
            try {
                const r = await API.get(`/payroll/${user.id}?month=${month}&year=${year}`);
                if (mounted) {
                    setData(r.data);
                    setLoading(false);
                }
            } catch (err) {
                if (mounted) {
                    const errMsg = err.response?.data?.message || 'No payroll data found.';
                    setError(errMsg);
                    if (err.response?.status !== 404) {
                        showToast(errMsg, 'error');
                    }
                    setData(null);
                    setLoading(false);
                }
            }
        };

        fetchPayrollDetails();

        return () => { mounted = false; };
    }, [user?.id, month, year]);

    const p = data?.payroll;
    const emp = data?.employee;
    const fmt = (v) => v ? `₹${parseFloat(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '₹0.00';

    // Compute YTD totals
    const getYTD = (field) => {
        // Find current record index to only sum up to selected month/year
        return allPayroll
            .filter(pr => (pr.year < year) || (pr.year === year && pr.month <= month))
            .reduce((sum, pr) => sum + (pr[field] || 0), 0);
    };

    const earnings = [
        { label: 'Basic', val: p?.basic || 0, ytd: getYTD('basic') },
        { label: 'DA (Dearness Allowance)', val: p?.da || 0, ytd: getYTD('da') },
        { label: 'OA (Other Allowance)', val: p?.oa || 0, ytd: getYTD('oa') },
        { label: 'Leave Wages', val: p?.leave_wages || 0, ytd: getYTD('leave_wages') }
    ];

    const deductions = [
        { label: 'Provident Fund (PF)', val: p?.provident_fund || 0, ytd: getYTD('provident_fund') },
        { label: 'E.S.I', val: p?.esi_deduction || 0, ytd: getYTD('esi_deduction') },
        { label: 'Professional Tax (PT)', val: p?.pt || 0, ytd: getYTD('pt') },
        { label: 'LWF', val: p?.lwf || 0, ytd: getYTD('lwf') },
        { label: 'TDS', val: p?.tds || 0, ytd: getYTD('tds') },
        { label: 'Leave Deduction', val: p?.leave_deduction || 0, ytd: getYTD('leave_deduction') },
        { label: 'Advance & Fine', val: p?.other_deductions || 0, ytd: getYTD('other_deductions') }
    ];

    const gross = earnings.reduce((sum, e) => sum + e.val, 0);
    const totalDeductions = deductions.reduce((sum, d) => sum + d.val, 0);
    const netPay = p?.actual_payable ?? 0;
    const daysInMonth = new Date(year, month, 0).getDate();

    const handlePrint = () => window.print();

    return (
        <div className="payroll-page">
            <div className="page-header no-print">
                <div className="page-title">
                    <FiCreditCard className="text-primary" /> Payroll & Salaries
                </div>
            </div>

            {error && <div className="alert alert-error no-print">{error}</div>}
            
            <div className="card no-print">
                <h3 style={{ marginBottom: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FiRotateCcw className="text-primary" /> Payroll History
                </h3>
                <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Month</th><th>Year</th><th>Days</th>
                                <th>Gross Wages</th><th>Total Deductions</th><th>Net Wages</th><th>Status</th>
                                <th style={{ textAlign: 'center' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allPayroll.length > 0 ? allPayroll.map(pr => {
                                const g = (pr.basic || 0) + (pr.da || 0) + (pr.oa || 0) + (pr.leave_wages || 0);
                                const d = (pr.provident_fund || 0) + (pr.esi_deduction || 0) + (pr.pt || 0) + (pr.lwf || 0) + (pr.tds || 0) + (pr.leave_deduction || 0) + (pr.other_deductions || 0);
                                const n = pr.actual_payable ?? 0;
                                return (
                                    <tr key={pr._id}>
                                        <td>{MONTHS[pr.month - 1]}</td>
                                        <td>{pr.year}</td>
                                        <td>{pr.days_worked || '—'}</td>
                                        <td style={{ color: 'var(--accent-green)', fontWeight: 600 }}>{fmt(g)}</td>
                                        <td style={{ color: 'var(--accent-red)' }}>{fmt(d)}</td>
                                        <td style={{ fontWeight: 800 }}>{fmt(n)}</td>
                                        <td><span className={`badge badge-${pr.status === 'paid' ? 'success' : 'warning'}`}>{pr.status}</span></td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button 
                                                className="btn btn-sm btn-primary" 
                                                onClick={() => { setMonth(pr.month); setYear(pr.year); setViewing(true); }}
                                                style={{ padding: '4px 12px' }}
                                            >
                                                View {viewing && month === pr.month && year === pr.year && loading ? '...' : 'Payslip'}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                        No payroll history found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {loading && <div className="page-loader"><div className="loading-spinner" /></div>}

            {viewing && (
                <div className="modal-overlay" onClick={() => setViewing(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '950px', width: '95%', padding: '0' }}>
                        <div className="modal-header" style={{ padding: '20px 24px', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 10, borderBottom: '1px solid var(--border-color)' }}>
                            <h3 className="modal-title">Your Payslip</h3>
                            <div style={{ display: 'flex', gap: 12 }}>
                                {p && (
                                    <button className="btn btn-outline btn-sm" onClick={handlePrint}>
                                        <FiPrinter /> Print
                                    </button>
                                )}
                                <button className="modal-close" onClick={() => setViewing(false)}><FiX /></button>
                            </div>
                        </div>
                        <div className="modal-body" style={{ background: '#f8fafc', padding: '30px 20px' }}>
                            {loading ? (
                                <div style={{ textAlign: 'center', padding: '40px' }}><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
                            ) : p ? (
                                <div id="payslip" className="zoho-payslip" style={{ boxShadow: 'none' }}>
                                    <div className="payslip-header-flex">
                                        <div className="company-branding">
                                            {branding.company_logo ? (
                                                <img src={branding.company_logo} alt="Logo" className="zoho-logo" />
                                            ) : (
                                                <div className="zoho-logo-placeholder"><FiBriefcase /></div>
                                            )}
                                            <div className="company-details">
                                                <h1 className="zoho-company-name">{branding.company_name}</h1>
                                                <p className="zoho-company-address">{branding.company_address || 'Address not configured'}</p>
                                            </div>
                                        </div>
                                        <div className="payslip-title-box">
                                            <span className="payslip-subtitle">Payslip For the Month</span>
                                            <h2 className="payslip-month-year">{MONTHS[month - 1]} {year}</h2>
                                        </div>
                                    </div>

                                    <div className="payslip-summary-grid">
                                        <div className="employee-info">
                                            <h3 className="section-header">EMPLOYEE SUMMARY</h3>
                                            <div className="info-row"><span>Employee Name</span> <span>: <b>{emp?.name || user?.name}</b></span></div>
                                            <div className="info-row"><span>Designation</span> <span>: {emp?.designation || 'N/A'}</span></div>
                                            <div className="info-row"><span>Employee ID</span> <span>: {user?.id}</span></div>
                                            <div className="info-row"><span>Date of Joining</span> <span>: {formatDate(emp?.date_of_joining)}</span></div>
                                            <div className="info-row"><span>Pay Period</span> <span>: {MONTHS[month - 1]} {year}</span></div>
                                            <div className="info-row"><span>Pay Date</span> <span>: {formatDate(p.paid_date)}</span></div>
                                        </div>
                                        <div className="net-pay-highlight">
                                            <div className="net-pay-card">
                                                <div className="net-pay-amount">{fmt(netPay)}</div>
                                                <div className="net-pay-label">Employee Net Pay</div>
                                            </div>
                                            <div className="attendance-box">
                                                <div className="attendance-row"><span>Paid Days</span> <span>: {p.days_worked || 0}</span></div>
                                                <div className="attendance-row"><span>LOP Days</span> <span>: {daysInMonth - (p.days_worked || daysInMonth)}</span></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="tax-identifiers info-row" style={{ marginTop: 12, borderBottom: '1px dashed var(--border-color)', paddingBottom: 8 }}>
                                        {emp?.pan && <span><b>PAN:</b> {emp.pan}</span>}
                                        {emp?.uan && <span style={{ marginLeft: 40 }}><b>UAN:</b> {emp.uan}</span>}
                                        {emp?.pf_account_no && <span style={{ marginLeft: 40 }}><b>PF A/C No:</b> {emp.pf_account_no}</span>}
                                    </div>

                                    <table className="zoho-table">
                                        <thead>
                                            <tr>
                                                <th>EARNINGS</th>
                                                <th style={{ textAlign: 'right' }}>AMOUNT</th>
                                                <th style={{ textAlign: 'right' }}>YTD</th>
                                                <th className="deduction-label">DEDUCTIONS</th>
                                                <th style={{ textAlign: 'right' }}>AMOUNT</th>
                                                <th style={{ textAlign: 'right' }}>YTD</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Array.from({ length: Math.max(earnings.length, deductions.length) }).map((_, i) => (
                                                <tr key={i}>
                                                    <td>{earnings[i]?.label || ''}</td>
                                                    <td style={{ textAlign: 'right' }}>{earnings[i] ? fmt(earnings[i].val) : ''}</td>
                                                    <td style={{ textAlign: 'right' }}>{earnings[i] ? fmt(earnings[i].ytd) : ''}</td>
                                                    <td className="deduction-label">{deductions[i]?.label || ''}</td>
                                                    <td style={{ textAlign: 'right' }}>{deductions[i] ? fmt(deductions[i].val) : ''}</td>
                                                    <td style={{ textAlign: 'right' }}>{deductions[i] ? fmt(deductions[i].ytd) : ''}</td>
                                                </tr>
                                            ))}
                                            <tr className="zoho-total-row">
                                                <td><b>Gross Earnings</b></td>
                                                <td style={{ textAlign: 'right' }}><b>{fmt(gross)}</b></td>
                                                <td></td>
                                                <td className="deduction-label"><b>Total Deductions</b></td>
                                                <td style={{ textAlign: 'right' }}><b>{fmt(totalDeductions)}</b></td>
                                                <td></td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    <div className="zoho-footer-summary">
                                        <div className="net-payable-row">
                                            <span><b>TOTAL NET PAYABLE</b></span>
                                            <span className="final-net-pay">{fmt(netPay)}</span>
                                        </div>
                                        <div className="amount-in-words">
                                            Amount In Words: <i>{numberToWords(Math.round(netPay))}</i>
                                        </div>
                                    </div>

                                    <div className="payslip-disclaimer">
                                        -- This document is automatically generated by {branding.company_name}; therefore, a signature is not required. --
                                    </div>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '40px' }}>
                                    <h3>No data found for this period.</h3>
                                    <p>Please contact HR for more information.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
