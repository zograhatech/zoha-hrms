import React, { useState, useEffect } from 'react';
import { FiVideo, FiCheckCircle, FiAlertCircle, FiSave, FiEdit2 } from 'react-icons/fi';
import API from '../../api/axios';
import './Zoom.css';

export default function ZoomSettings() {
    const [loading, setLoading] = useState(false);
    const [configLoading, setConfigLoading] = useState(true);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const [isConfigured, setIsConfigured] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    
    const [formData, setFormData] = useState({
        account_id: '',
        client_id: '',
        client_secret: '',
        webhook_secret: ''
    });

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            setConfigLoading(true);
            const res = await API.get('/zoom/config');
            if (res.data.success && res.data.config.is_configured) {
                setIsConfigured(true);
                setFormData(prev => ({ 
                    ...prev, 
                    account_id: res.data.config.account_id || '',
                    client_id: res.data.config.client_id || ''
                }));
            }
        } catch (err) {
            console.error('Failed to fetch zoom config:', err);
        } finally {
            setConfigLoading(false);
        }
    };

    const handleSaveConfig = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            setError(null);
            setSuccess(null);
            
            // This API call now authenticates to Zoom S2S immediately in the backend
            const res = await API.post('/zoom/config', formData);
            if (res.data.success) {
                setSuccess('Configuration saved securely and successfully linked to Zoom!');
                setIsConfigured(true);
                setIsEditing(false);
                fetchConfig(); // refresh masked values
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to save configuration or authenticate with Zoom.');
        } finally {
            setLoading(false);
        }
    };

    if (configLoading) {
        return (
            <div className="zoom-container zoom-container-sm">
                <div className="zoom-spinner zoom-spinner-lg"></div>
            </div>
        );
    }

    return (
        <div className="zoom-container zoom-container-sm zoom-space-y">
            
            {/* Header Card */}
            <div className="zoom-glass-card zoom-flex-row zoom-gap-6">
                <div className="zoom-icon-wrapper">
                    <FiVideo size={48} />
                </div>
                <div className="zoom-flex-col" style={{flex: 1}}>
                    <h2 className="zoom-title zoom-gradient-text">Zoom Server-to-Server Integration</h2>
                    <p className="zoom-subtitle mb-6">
                        Provide your Zoom Server-to-Server OAuth App credentials to enable instant meetings, candidate interviews, and team sync scheduling natively.
                    </p>
                    
                    {error && (
                        <div className="zoom-alert zoom-alert-error mb-6">
                            <FiAlertCircle size={18} style={{flexShrink:0}}/>
                            <span>{error}</span>
                        </div>
                    )}
                    {success && (
                        <div className="zoom-alert zoom-alert-success mb-6">
                            <FiCheckCircle size={18} style={{flexShrink:0}}/>
                            <span>{success}</span>
                        </div>
                    )}

                    {(!isConfigured || isEditing) ? (
                        <div className="zoom-section">
                            <h3 className="zoom-flex-row zoom-gap-2 mb-4" style={{fontSize:'1.1rem', fontWeight: 700, color: 'var(--zoom-gray-800)'}}>
                                <span className="zoom-number-badge" style={{background: 'var(--zoom-blue)', color:'white'}}>1</span> 
                                Setup Server Credentials
                            </h3>
                            <form onSubmit={handleSaveConfig} className="zoom-flex-col">
                                <div className="zoom-form-group">
                                    <label className="zoom-label">Account ID</label>
                                    <input required type="text" className="zoom-input" 
                                        value={formData.account_id} onChange={e => setFormData({...formData, account_id: e.target.value})} 
                                        placeholder={isConfigured ? formData.account_id : "Enter Account ID"} />
                                </div>
                                <div className="zoom-form-group">
                                    <label className="zoom-label">Client ID</label>
                                    <input required type="text" className="zoom-input" 
                                        value={formData.client_id} onChange={e => setFormData({...formData, client_id: e.target.value})} 
                                        placeholder={isConfigured ? formData.client_id : "Enter Client ID"} />
                                </div>
                                <div className="zoom-form-group">
                                    <label className="zoom-label">Client Secret</label>
                                    <input type="password" className="zoom-input" 
                                        value={formData.client_secret} onChange={e => setFormData({...formData, client_secret: e.target.value})} 
                                        placeholder={isConfigured && !formData.client_secret ? "*********** (Leave blank to keep unchanged)" : "Enter Client Secret"} />
                                </div>
                                <div className="zoom-form-group">
                                    <label className="zoom-label">Webhook Secret Token</label>
                                    <input type="password" className="zoom-input" 
                                        value={formData.webhook_secret} onChange={e => setFormData({...formData, webhook_secret: e.target.value})} 
                                        placeholder={isConfigured && !formData.webhook_secret ? "*********** (Leave blank to keep unchanged)" : "Enter Webhook Secret"} />
                                    <p style={{fontSize:'0.75rem', color: 'var(--zoom-gray-500)', marginTop: '4px'}}>Needed to track attendance automatically via Zoom Events.</p>
                                </div>
                                
                                <div className="zoom-flex-row zoom-gap-4 mt-2">
                                    <button type="submit" disabled={loading} className="zoom-btn zoom-btn-primary">
                                        {loading ? <span className="zoom-spinner"></span> : <><FiSave /> Connect & Save securely</>}
                                    </button>
                                    {isConfigured && (
                                        <button type="button" onClick={() => setIsEditing(false)} className="zoom-btn zoom-btn-secondary">
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>
                    ) : (
                        <div className="zoom-flex-col zoom-gap-6">
                            <div className="zoom-section zoom-flex-between" style={{background: 'var(--zoom-green-bg)', borderColor: 'var(--zoom-green)', padding: '16px 24px'}}>
                                <div>
                                    <h3 className="zoom-flex-row zoom-gap-2" style={{color: 'var(--zoom-gray-800)', margin:0, fontSize: '1.05rem', fontWeight: 700}}>
                                        <FiCheckCircle style={{color: 'var(--zoom-green)'}} /> Configured and Authorized
                                    </h3>
                                    <p style={{margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--zoom-gray-600)'}}>Client ID: {formData.client_id}</p>
                                </div>
                                <button onClick={() => setIsEditing(true)} className="zoom-btn zoom-btn-secondary" style={{padding:'8px', borderRadius:'8px'}} title="Edit Credentials">
                                    <FiEdit2 />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Information Section */}
            <div className="zoom-glass-card">
                <h3 className="zoom-flex-row zoom-gap-2 mb-4" style={{fontSize: '1.1rem', fontWeight:700, color:'var(--zoom-gray-800)'}}>
                    <FiCheckCircle style={{color: 'var(--zoom-green)'}} /> What this enables
                </h3>
                <ul className="zoom-list">
                    <li className="zoom-list-item">
                        <span className="zoom-number-badge">1</span>
                        <span><strong>Interview Scheduling:</strong> Automatically generate dynamic Zoom links when setting up candidate interviews.</span>
                    </li>
                    <li className="zoom-list-item">
                        <span className="zoom-number-badge">2</span>
                        <span><strong>Instant Team Sessions:</strong> Start spontaneous 1-on-1s or team meetings directly from the employee dashboard.</span>
                    </li>
                    <li className="zoom-list-item">
                        <span className="zoom-number-badge">3</span>
                        <span><strong>Automated Attendance Tracking:</strong> Thanks to webhooks, the system tracks who joins the meeting and how long they stay.</span>
                    </li>
                </ul>
            </div>
        </div>
    );
}
