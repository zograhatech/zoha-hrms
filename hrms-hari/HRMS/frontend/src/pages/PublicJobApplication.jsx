import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import API from '../api/axios';
import { useBranding } from '../context/BrandingContext';

export default function PublicJobApplication() {
    const { branding } = useBranding();
    const { jobId } = useParams();
    const [job, setJob] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [formData, setFormData] = useState({ 
        name: '', 
        email: '', 
        phone: '', 
        qualification: '', 
        experience_type: 'fresher', 
        experience_years: '',
        address: ''
    });
    const [resume, setResume] = useState(null);
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const fetchJob = async () => {
            try {
                const { data } = await API.get(`/recruitment/public/${jobId}`);
                if (data.success) {
                    setJob(data.job);
                }
            } catch (err) {
                setError(err.response?.data?.message || 'Job posting not found or no longer active.');
            } finally {
                setLoading(false);
            }
        };
        fetchJob();
    }, [jobId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const data = new FormData();
            data.append('name', formData.name);
            data.append('email', formData.email);
            data.append('phone', formData.phone);
            data.append('qualification', formData.qualification);
            data.append('experience_type', formData.experience_type);
            data.append('experience_years', formData.experience_years);
            data.append('address', formData.address);
            if (resume) data.append('resume', resume);

            await API.post(`/recruitment/public/${jobId}/apply`, data, { 
                headers: { 'Content-Type': 'multipart/form-data' } 
            });
            setSubmitted(true);
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to submit application. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
            <div className="premium-spinner" style={{ width: '40px', height: '40px' }}></div>
        </div>
    );

    if (error) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
            <div style={{ background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '500px' }}>
                <h2 style={{ color: '#ef4444', marginBottom: '10px' }}>Application Closed</h2>
                <p style={{ color: '#64748b' }}>{error}</p>
            </div>
        </div>
    );

    if (submitted) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
            <div style={{ background: 'white', padding: '50px', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: '500px' }}>
                <div style={{ display: 'inline-block', background: '#ecfdf5', color: '#10b981', padding: '20px', borderRadius: '50%', marginBottom: '20px' }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                </div>
                <h2 style={{ color: '#0f172a', marginBottom: '10px', fontSize: '1.8rem' }}>Application Submitted!</h2>
                <p style={{ color: '#64748b', fontSize: '1.1rem' }}>Thank you for applying to the <strong>{job.job_title}</strong> position. Our recruiting team will review your profile and get back to you soon.</p>
            </div>
        </div>
    );

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '40px 20px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', maxWidth: '750px', width: '100%', overflow: 'hidden' }}>
                <div style={{ background: '#0f172a', padding: '40px', color: 'white' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                        {branding?.company_logo && (
                            <img src={branding.company_logo} alt={branding.company_name || 'Logo'} style={{ height: '32px', objectFit: 'contain', background: 'white', padding: '2px', borderRadius: '4px' }} />
                        )}
                        <span style={{ display: 'inline-block', background: 'rgba(255,255,255,0.2)', padding: '5px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600 }}>{job.department_id || 'Join Our Team'}</span>
                    </div>
                    <h1 style={{ margin: '0 0 10px 0', fontSize: '2.5rem', fontWeight: 700 }}>{job.job_title}</h1>
                    <p style={{ margin: 0, opacity: 0.8, fontSize: '1.1rem' }}>We are looking for a talented individual to join our growing team.</p>
                </div>

                <div style={{ padding: '40px' }}>
                    <div style={{ marginBottom: '40px' }}>
                        <h3 style={{ fontSize: '1.3rem', color: '#0f172a', marginBottom: '15px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>About the Role</h3>
                        <p style={{ color: '#475569', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{job.description || 'Details regarding this position will be communicated shortly.'}</p>
                    </div>

                    <div>
                        <h3 style={{ fontSize: '1.3rem', color: '#0f172a', marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>Apply Now</h3>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', color: '#334155', fontWeight: 600 }}>Full Name <span style={{ color: '#ef4444' }}>*</span></label>
                                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} 
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none' }} placeholder="John Doe" />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', color: '#334155', fontWeight: 600 }}>Highest Qualification <span style={{ color: '#ef4444' }}>*</span></label>
                                <input required type="text" value={formData.qualification} onChange={e => setFormData({...formData, qualification: e.target.value})} 
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none' }} placeholder="B.Tech Computer Science" />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: formData.experience_type === 'experienced' ? '1fr 1fr' : '1fr', gap: '20px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', color: '#334155', fontWeight: 600 }}>Experience Level <span style={{ color: '#ef4444' }}>*</span></label>
                                    <select required value={formData.experience_type} onChange={e => setFormData({...formData, experience_type: e.target.value, experience_years: e.target.value === 'fresher' ? '' : formData.experience_years})}
                                        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none', background: 'white' }}>
                                        <option value="fresher">Fresher</option>
                                        <option value="experienced">Experienced</option>
                                    </select>
                                </div>
                                {formData.experience_type === 'experienced' && (
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '8px', color: '#334155', fontWeight: 600 }}>Years of Experience <span style={{ color: '#ef4444' }}>*</span></label>
                                        <input required type="number" min="0" step="0.5" value={formData.experience_years} onChange={e => setFormData({...formData, experience_years: e.target.value})} 
                                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none' }} placeholder="e.g. 3.5" />
                                    </div>
                                )}
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', color: '#334155', fontWeight: 600 }}>Email Address <span style={{ color: '#ef4444' }}>*</span></label>
                                    <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} 
                                        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none' }} placeholder="john@example.com" />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', color: '#334155', fontWeight: 600 }}>Phone Number</label>
                                    <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} 
                                        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none' }} placeholder="+1 (555) 000-0000" />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', color: '#334155', fontWeight: 600 }}>Residential Address</label>
                                <textarea rows="2" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} 
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '1rem', outline: 'none', resize: 'vertical' }} placeholder="Enter your full address" />
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', color: '#334155', fontWeight: 600 }}>Upload Resume <span style={{ color: '#ef4444' }}>*</span></label>
                                <div style={{ 
                                    position: 'relative', border: '2px dashed #cbd5e1', borderRadius: '12px', 
                                    padding: '30px', textAlign: 'center', transition: 'border-color 0.2s', 
                                    background: resume ? '#f0fdf4' : '#f8fafc',
                                    borderColor: resume ? '#10b981' : '#cbd5e1'
                                }}>
                                    <input required type="file" accept=".pdf,.doc,.docx,.png" 
                                        onChange={e => setResume(e.target.files[0])}
                                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} 
                                    />
                                    <div style={{ color: resume ? '#10b981' : '#64748b' }}>
                                        <svg style={{ width: '40px', height: '40px', marginBottom: '10px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                                        <p style={{ fontWeight: 600, margin: 0 }}>{resume ? resume.name : 'Click to upload or drag and drop'}</p>
                                        <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>Support PDF, PNG, DOCX (Max 5MB)</p>
                                    </div>
                                </div>
                            </div>

                            <button type="submit" disabled={submitting} style={{ 
                                marginTop: '10px', padding: '15px', background: '#0f172a', color: 'white', 
                                border: 'none', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer',
                                transition: 'background 0.2s', opacity: submitting ? 0.7 : 1
                            }}>
                                {submitting ? 'Submitting Application...' : 'Submit Final Application'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
