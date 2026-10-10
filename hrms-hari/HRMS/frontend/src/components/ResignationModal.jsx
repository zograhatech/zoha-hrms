import { useState, useEffect } from 'react';
import { FiX, FiCalendar, FiFileText, FiAlertCircle, FiCheckCircle, FiSend } from 'react-icons/fi';
import DateInput from './DateInput';
import API from '../api/axios';
import { useToast } from '../context/ToastContext';

export default function ResignationModal({ isOpen, onClose, employee, existingRequest }) {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [form, setForm] = useState({
        notice_start_date: '',
        last_working_day: '',
        reason: ''
    });

    useEffect(() => {
        if (existingRequest) {
            setForm({
                notice_start_date: existingRequest.notice_start_date ? new Date(existingRequest.notice_start_date).toISOString().split('T')[0] : '',
                last_working_day: existingRequest.last_working_day ? new Date(existingRequest.last_working_day).toISOString().split('T')[0] : '',
                reason: existingRequest.reason || ''
            });
        } else {
            // Default notice start date to today
            const today = new Date().toISOString().split('T')[0];
            setForm(prev => ({ ...prev, notice_start_date: today }));
        }
    }, [existingRequest, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!confirmed) {
            showToast('Please confirm your resignation submission.', 'warning');
            return;
        }

        setLoading(true);
        try {
            if (existingRequest) {
                await API.put(`/resignations/${existingRequest._id}/resubmit`, form);
                showToast('Resignation updated successfully!', 'success');
            } else {
                await API.post('/resignations', form);
                showToast('Resignation submitted successfully!', 'success');
            }
            onClose(true); // Close and refresh
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to submit resignation.', 'error');
        } finally {
            setLoading(false);
        }
    };
    const handleRevoke = async () => {
        if (!window.confirm('Are you sure you want to revoke your resignation (decide to stay)?')) return;
        const reason = window.prompt('Please provide a reason for revoking your resignation:');
        if (reason === null) return;
        if (!reason.trim()) {
            showToast('Please provide a reason for revocation.', 'warning');
            return;
        }

        setLoading(true);
        try {
            await API.put(`/resignations/${existingRequest._id}/revoke`, { reason });
            showToast('Revoke request submitted for HR approval.', 'success');
            onClose(true); // Close and refresh
        } catch (error) {
            showToast('Failed to submit revoke request.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={() => onClose()}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 550 }}>
                <div className="modal-header">
                    <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FiFileText className="text-primary" /> 
                        {existingRequest ? 'Update Resignation Request' : 'Submit Resignation / Notice Period'}
                    </h3>
                    <button className="modal-close" onClick={() => onClose()}><FiX /></button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body">

                        <div className="grid-2" style={{ marginBottom: 20 }}>
                            <div className="form-group">
                                <label className="form-label">Employee Name</label>
                                <input className="form-input" value={employee?.name || ''} disabled style={{ background: 'var(--bg-hover)' }} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Employee ID</label>
                                <input className="form-input" value={employee?.id || ''} disabled style={{ background: 'var(--bg-hover)' }} />
                            </div>
                        </div>

                        <div className="grid-2" style={{ marginBottom: 20 }}>
                            <DateInput 
                                label="Notice Start Date"
                                value={form.notice_start_date}
                                onChange={e => setForm({ ...form, notice_start_date: e.target.value })}
                                required 
                            />
                            <DateInput 
                                label="Last Working Day"
                                value={form.last_working_day}
                                onChange={e => setForm({ ...form, last_working_day: e.target.value })}
                                required 
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Reason for Resignation</label>
                            <textarea 
                                className="form-textarea" 
                                rows="4" 
                                placeholder="Please provide a reason for your resignation..."
                                value={form.reason}
                                onChange={e => setForm({ ...form, reason: e.target.value })}
                                required
                            />
                        </div>

                        <div style={{ 
                            marginTop: 24, padding: 16, background: 'rgba(99, 102, 241, 0.05)', 
                            borderRadius: 12, border: '1px solid rgba(99, 102, 241, 0.1)' 
                        }}>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', margin: 0 }}>
                                <input 
                                    type="checkbox" 
                                    checked={confirmed} 
                                    onChange={e => setConfirmed(e.target.checked)}
                                    style={{ marginTop: 4 }}
                                />
                                <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.4 }}>
                                    I confirm that I am submitting my resignation notice and the information provided is accurate.
                                </span>
                            </label>
                        </div>
                    </div>

                    <div className="modal-footer" style={{ gap: 12 }}>
                        <button type="button" className="btn btn-outline" onClick={() => onClose()}>Cancel</button>
                        {existingRequest && (
                            <button 
                                type="button" 
                                className="btn btn-outline-danger" 
                                onClick={handleRevoke}
                                disabled={loading}
                            >
                                Revoke
                            </button>
                        )}
                        <button type="submit" className="btn btn-primary" disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {loading ? 'Submitting...' : (
                                <><FiSend /> {existingRequest ? 'Update Request' : 'Submit Notice'}</>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
