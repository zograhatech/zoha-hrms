import { useState, useEffect, useRef } from 'react';
import API from '../api/axios';
import { FiUpload, FiTrash2, FiEye, FiX, FiFile, FiImage, FiPlus, FiLoader } from 'react-icons/fi';
import { useToast } from '../context/ToastContext';
import { formatDate } from '../utils/dateFormatter';

export default function DocumentManager({ employeeId, employeeName, isOpen, onClose }) {
    const { showToast } = useToast();
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);
    const [uploadType, setUploadType] = useState('document');

    const fetchDocuments = async () => {
        if (!employeeId) return;
        setLoading(true);
        try {
            const { data } = await API.get(`/documents/employee/${employeeId}`);
            setDocuments(data.documents || []);
        } catch (err) {
            showToast('Failed to fetch documents', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && employeeId) {
            fetchDocuments();
        }
    }, [isOpen, employeeId]);

    const handleUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const formData = new FormData();
        files.forEach(file => formData.append('files', file));
        formData.append('employee_id', employeeId);
        formData.append('type', uploadType);
        formData.append('category', 'General');

        setUploading(true);
        try {
            const { data } = await API.post('/documents/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            showToast(data.message, 'success');
            fetchDocuments();
        } catch (err) {
            showToast(err.response?.data?.message || 'Upload failed', 'error');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this document?')) return;
        try {
            await API.delete(`/documents/${id}`);
            showToast('Document deleted', 'success');
            fetchDocuments();
        } catch (err) {
            showToast('Failed to delete document', 'error');
        }
    };

    const handleView = async (id) => {
        try {
            const response = await API.get(`/documents/view/${id}`, {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data], { type: response.headers['content-type'] }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('target', '_blank');
            // For images/PDFs, we just want to open in new tab.
            // For other files, we might want to download.
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => window.URL.revokeObjectURL(url), 100);
        } catch (err) {
            showToast('Failed to open document', 'error');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 800, width: '90%' }}>
                <div className="modal-header">
                    <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FiFile /> Documents: {employeeName} ({employeeId})
                    </h3>
                    <button className="modal-close" onClick={onClose}><FiX /></button>
                </div>
                <div className="modal-body">
                    <div style={{ marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                            <label className="form-label">Upload Type</label>
                            <select 
                                className="form-select" 
                                value={uploadType} 
                                onChange={e => setUploadType(e.target.value)}
                            >
                                <option value="document">Document (PDF, Word, etc.)</option>
                                <option value="photo">Photo / Identity Proof</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div style={{ alignSelf: 'flex-end' }}>
                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                onChange={handleUpload}
                                multiple
                            />
                            <button 
                                className="btn btn-primary" 
                                onClick={() => fileInputRef.current.click()}
                                disabled={uploading}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                            >
                                {uploading ? <FiLoader className="spin" /> : <FiUpload />}
                                <span>{uploading ? 'Uploading...' : 'Upload New'}</span>
                            </button>
                        </div>
                    </div>

                    <div className="card" style={{ padding: 0 }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Type</th>
                                        <th>Category</th>
                                        <th>Date</th>
                                        <th style={{ textAlign: 'center' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40 }}><FiLoader className="spin" size={24} /></td></tr>
                                    ) : documents.length === 0 ? (
                                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No documents found.</td></tr>
                                    ) : documents.map(doc => (
                                        <tr key={doc._id}>
                                            <td style={{ fontWeight: 600 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {doc.type === 'photo' ? <FiImage style={{ color: 'var(--accent-primary)' }} /> : <FiFile style={{ color: 'var(--accent-info)' }} />}
                                                    {doc.name}
                                                </div>
                                            </td>
                                            <td><span className={`badge badge-${doc.type === 'photo' ? 'purple' : 'info'}`}>{doc.type}</span></td>
                                            <td>{doc.category}</td>
                                            <td style={{ fontSize: '0.8rem' }}>{formatDate(doc.createdAt)}</td>
                                            <td style={{ textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                                    <button 
                                                        className="btn btn-icon btn-sm" 
                                                        title="View"
                                                        onClick={() => handleView(doc._id)}
                                                    >
                                                        <FiEye size={14} />
                                                    </button>
                                                    <button 
                                                        className="btn btn-icon btn-sm text-error" 
                                                        title="Delete"
                                                        onClick={() => handleDelete(doc._id)}
                                                    >
                                                        <FiTrash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-outline" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
}
