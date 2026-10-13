import { useState, useEffect, useRef, useCallback } from 'react';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { normalizeRole } from '../utils/roleHelper';
import {
    FiSearch, FiPlus, FiSend, FiTrash2,
    FiMoreVertical, FiUser, FiUsers,
    FiImage, FiVideo, FiX, FiCheckCircle, FiMessageSquare, FiArrowLeft,
    FiFileText, FiMusic, FiArchive, FiFile, FiDownload, FiPackage, FiPaperclip, FiShield, FiAlertTriangle
} from 'react-icons/fi';
import './Messages.css';

export default function Messages() {
    const { user } = useAuth();
    const userRole = normalizeRole(user?.role || '');
    const isAdmin = userRole === 'admin';

    const [conversations, setConversations] = useState([]);
    const [activeConv, setActiveConv] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [showNewChat, setShowNewChat] = useState(false);
    const [employees, setEmployees] = useState([]);
    const [searchEmp, setSearchEmp] = useState('');
    const [searchConv, setSearchConv] = useState('');
    const [loading, setLoading] = useState(true);
    const [searching, setSearching] = useState(false);
    const [menuConvId, setMenuConvId] = useState(null);
    const [globalSearchEmps, setGlobalSearchEmps] = useState([]);
    const [viewOversight, setViewOversight] = useState(false);

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const lastTimestampRef = useRef(null);

    // Is current user a participant in active conversation?
    const isParticipant = activeConv ? (activeConv.participants || []).some(p => {
        const pid = (p?._id || p?.id || p).toString();
        const uid = (user?._id || user?.id || '').toString();
        return pid === uid || (user?.id && pid === user.id);
    }) : false;

    // ── Message Polling (every 5s with "since" timestamp) ───────────
    useEffect(() => {
        if (!activeConv) return;

        let isMounted = true;
        lastTimestampRef.current = null;

        const fetchInitial = async () => {
            try {
                const { data } = await API.get(`/messages/${activeConv._id}`);
                if (isMounted) {
                    const list = data.messages || [];
                    setMessages(list);
                    if (list.length > 0) {
                        lastTimestampRef.current = list[list.length - 1].createdAt;
                    }
                }
            } catch (err) {
                console.error('Initial fetch error:', err);
            }
        };

        fetchInitial();

        const interval = setInterval(async () => {
            if (!activeConv) return;
            try {
                const url = lastTimestampRef.current
                    ? `/messages/${activeConv._id}?since=${encodeURIComponent(lastTimestampRef.current)}`
                    : `/messages/${activeConv._id}`;
                const { data } = await API.get(url);
                if (isMounted && data.messages && data.messages.length > 0) {
                    setMessages(prev => {
                        const existingIds = new Set(prev.map(m => m._id));
                        const newOnes = data.messages.filter(m => !existingIds.has(m._id));
                        return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
                    });
                    lastTimestampRef.current = data.messages[data.messages.length - 1].createdAt;
                }
            } catch (err) {
                console.error('Polling error:', err);
            }
        }, 5000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [activeConv]);

    // ── Load Conversations ──────────────────────────────────────────
    const loadConversations = useCallback(async () => {
        try {
            const url = (isAdmin && viewOversight) ? '/conversations?all=true' : '/conversations';
            const { data } = await API.get(url);
            setConversations(data.conversations || []);
            setLoading(false);
        } catch (err) {
            console.error('Load conversations error:', err);
            setLoading(false);
        }
    }, [isAdmin, viewOversight]);

    useEffect(() => {
        loadConversations();
    }, [loadConversations]);

    // Conversation Auto-Refresh every 5s
    useEffect(() => {
        const interval = setInterval(loadConversations, 5000);
        return () => clearInterval(interval);
    }, [loadConversations]);

    useEffect(() => {
        const handleClickOutside = () => setMenuConvId(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ── Global Search for New Employees via Contact Directory ───────
    useEffect(() => {
        if (!searchConv.trim()) {
            setGlobalSearchEmps([]);
            return;
        }
        const delaySearch = setTimeout(async () => {
            try {
                const { data } = await API.get('/conversations/directory');
                const activePartnerIds = new Set(
                    conversations.flatMap(c => (c.participants || []).map(p => (p._id || p.id)))
                );
                const q = searchConv.toLowerCase();
                const filtered = (data.employees || []).filter(e => {
                    const eid = e._id || e.id;
                    const uid = user?._id || user?.id;
                    const matches = (e.name || '').toLowerCase().includes(q) || (e.department_name || '').toLowerCase().includes(q);
                    return eid !== uid && !activePartnerIds.has(eid) && matches;
                });
                setGlobalSearchEmps(filtered);
            } catch (err) { }
        }, 300);
        return () => clearTimeout(delaySearch);
    }, [searchConv, conversations, user]);

    // ── Actions ────────────────────────────────────────────────
    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const allowedExts = ['.pdf', '.png', '.jpg', '.jpeg', '.docx', '.xlsx'];
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!allowedExts.includes(ext)) {
            alert('File type not allowed. Allowed formats: PDF, PNG, JPG, DOCX, XLSX.');
            e.target.value = '';
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            alert('File must be 10 MB or smaller.');
            e.target.value = '';
            return;
        }

        setSelectedFile(file);
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if ((!inputText.trim() && !selectedFile) || !activeConv) return;

        const formData = new FormData();
        formData.append('conversationId', activeConv._id);
        if (inputText.trim()) formData.append('text', inputText);
        if (selectedFile) formData.append('file', selectedFile);

        try {
            const { data } = await API.post('/messages', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (data.success) {
                setMessages(prev => [...prev, data.message]);
                setInputText('');
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
                loadConversations();
            }
        } catch (err) {
            console.error('Send failed', err);
            alert(err.response?.data?.message || 'Send failed');
        }
    };

    const handleExport = async (convId) => {
        try {
            const res = await API.get(`/messages/${convId}/export`, { responseType: 'blob' });
            const blob = new Blob([res.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chat_export_${convId}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            console.error('Export failed', err);
            alert(err.response?.data?.message || 'Export failed.');
        }
    };

    const handleDeleteChat = async (convId) => {
        const swal = window.Swal;
        if (swal) {
            const result = await swal.fire({
                title: 'Delete Chat?',
                text: 'Are you sure? This will permanently remove all messages.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#6b7280',
                confirmButtonText: 'Yes, delete it!',
                cancelButtonText: 'Cancel'
            });
            if (!result.isConfirmed) return;
        } else {
            if (!window.confirm('Are you sure you want to delete this conversation? This cannot be undone.')) return;
        }

        try {
            const { data } = await API.delete(`/conversations/${convId}`);
            if (data.success) {
                if (activeConv?._id === convId) setActiveConv(null);
                setMenuConvId(null);
                loadConversations();
                if (window.Swal) {
                    window.Swal.fire({
                        title: 'Deleted!',
                        text: 'Your conversation has been removed.',
                        icon: 'success',
                        timer: 2000,
                        showConfirmButton: false
                    });
                }
            }
        } catch (err) {
            console.error('Delete failed', err);
            if (window.Swal) {
                window.Swal.fire('Error', 'Failed to delete the chat. Please try again.', 'error');
            }
        }
    };

    const handleNewChat = async (recipient) => {
        try {
            const targetId = recipient._id || recipient.id;
            const { data } = await API.post('/conversations', { recipientId: targetId });
            if (data.success) {
                setShowNewChat(false);
                setConversations(prev => {
                    const exists = prev.find(c => c._id === data.conversation._id);
                    return exists ? prev : [data.conversation, ...prev];
                });
                setActiveConv(data.conversation);
            }
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.message || 'Failed to start conversation.');
        }
    };

    const fetchEmployees = useCallback(async () => {
        setSearching(true);
        try {
            const { data } = await API.get('/conversations/directory');
            const filtered = (data.employees || []).filter(e => (e._id || e.id) !== (user._id || user.id));
            setEmployees(filtered);
        } catch (err) {
            console.error('Failed to fetch contact directory', err);
        } finally {
            setSearching(false);
        }
    }, [user?._id, user?.id]);

    useEffect(() => {
        if (showNewChat) fetchEmployees();
    }, [showNewChat, fetchEmployees]);

    const getChatPartner = (conv) => {
        const otherParticipants = (conv.participants || []).filter(p => (p._id || p.id) !== (user._id || user.id));

        // Group: show participant names joined with commas (or custom groupName if set)
        if (conv.isGroup || (conv.participants || []).length > 2) {
            const participantNames = (conv.participants || []).map(p => p.name || 'User').join(', ');
            const groupTitle = conv.groupName || participantNames;
            return {
                name: groupTitle,
                avatar: (groupTitle || 'G')[0],
                profile_image: null
            };
        }

        // Direct conversation: show the other participant's name, never 'Conversation'
        const partner = otherParticipants[0] || (conv.participants || [])[0];
        const partnerName = partner?.name || 'User';
        return { 
            ...partner, 
            name: partnerName, 
            avatar: partnerName[0] || 'U', 
            profile_image: partner?.profile_image || null 
        };
    };

    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;

    return (
        <div className={`msgr-page ${activeConv ? 'msgr-view-chat' : 'msgr-view-list'}`}>
            {/* Sidebar */}
            <div className="msgr-sidebar">
                <div className="msgr-sidebar-header">
                    <div className="flex-between" style={{ marginBottom: 12 }}>
                        <h2 style={{ margin: 0 }}>Messages</h2>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowNewChat(true)}>
                            <FiPlus /> New Chat
                        </button>
                    </div>

                    {/* Super Admin Oversight Toggle */}
                    {isAdmin && (
                        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                            <button 
                                className={`btn btn-sm ${!viewOversight ? 'btn-primary' : 'btn-outline'}`}
                                style={{ flex: 1, fontSize: '0.75rem', padding: '4px 8px' }}
                                onClick={() => { setViewOversight(false); setActiveConv(null); }}
                            >
                                My Chats
                            </button>
                            <button 
                                className={`btn btn-sm ${viewOversight ? 'btn-primary' : 'btn-outline'}`}
                                style={{ flex: 1, fontSize: '0.75rem', padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                                onClick={() => { setViewOversight(true); setActiveConv(null); }}
                            >
                                <FiShield size={12} /> All (Oversight)
                            </button>
                        </div>
                    )}

                    {isAdmin && viewOversight && (
                        <div style={{ padding: '6px 8px', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.25)', borderRadius: 6, fontSize: '0.7rem', color: '#eab308', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <FiAlertTriangle size={14} style={{ flexShrink: 0 }} />
                            <span>Oversight view active. All conversation reads are recorded in the Audit Log.</span>
                        </div>
                    )}

                    <div className="msgr-search">
                        <FiSearch className="msgr-search-icon" />
                        <input
                            placeholder="Search conversations..."
                            value={searchConv}
                            onChange={e => setSearchConv(e.target.value)}
                        />
                    </div>
                </div>

                <div className="msgr-conv-list">
                    {conversations.length === 0 && !searchConv ? (
                        <div className="text-center mt-24" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            {viewOversight ? 'No conversations found in system.' : 'No active chats. Start one!'}
                        </div>
                    ) : conversations
                        .filter(c => {
                            const partner = getChatPartner(c);
                            return partner.name.toLowerCase().includes(searchConv.toLowerCase());
                        })
                        .map(conv => {
                            const partner = getChatPartner(conv);
                            return (
                                <div
                                    key={conv._id}
                                    className={`msgr-conv-item ${activeConv?._id === conv._id ? 'msgr-active' : ''}`}
                                    onClick={() => setActiveConv(conv)}
                                >
                                    <div className="msgr-avatar">
                                        {partner.profile_image ? (
                                            <img 
                                                src={(partner.profile_image.startsWith('http') || partner.profile_image.startsWith('data:')) ? partner.profile_image : `${API.defaults.baseURL.replace('/api', '')}${partner.profile_image}`} 
                                                alt={partner.name} 
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} 
                                            />
                                        ) : partner.avatar}
                                    </div>
                                    <div className="msgr-conv-info">
                                        <div className="msgr-conv-name-row">
                                            <span className="msgr-conv-name">{partner.name}</span>
                                            <span className="msgr-conv-time">
                                                {conv.updatedAt ? new Date(conv.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                            </span>
                                        </div>
                                        <div className="msgr-conv-last-msg">
                                            {conv.lastMessage?.text || (() => {
                                                if (!conv.lastMessage?.fileUrl) return 'No messages yet';
                                                const type = conv.lastMessage.fileType;
                                                if (type === 'image') return '📷 Image';
                                                if (type === 'video') return '🎥 Video';
                                                if (type === 'audio') return '🎵 Audio';
                                                return '📁 File';
                                            })()}
                                        </div>
                                    </div>
                                    <div className="msgr-conv-actions">
                                        <button 
                                            className="msgr-action-dot" 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setMenuConvId(menuConvId === conv._id ? null : conv._id);
                                            }}
                                        >
                                            <FiMoreVertical />
                                        </button>
                                        {menuConvId === conv._id && (
                                            <div className="msgr-action-menu" onClick={e => e.stopPropagation()}>
                                                <button className="delete-chat-btn" onClick={() => handleDeleteChat(conv._id)}>
                                                    <FiTrash2 size={14} /> Delete Chat
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                    {/* Global search results */}
                    {searchConv && globalSearchEmps.length > 0 && (
                        <>
                            <div style={{ padding: '15px 15px 5px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Other Employees
                            </div>
                            {globalSearchEmps.map(emp => (
                                <div
                                    key={`new-${emp._id || emp.id}`}
                                    className="msgr-conv-item"
                                    onClick={() => handleNewChat(emp)}
                                >
                                    <div className="msgr-avatar">
                                        {emp.profile_image ? (
                                            <img 
                                                src={(emp.profile_image.startsWith('http') || emp.profile_image.startsWith('data:')) ? emp.profile_image : `${API.defaults.baseURL.replace('/api', '')}${emp.profile_image}`} 
                                                alt={emp.name} 
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} 
                                            />
                                        ) : emp.name[0]}
                                    </div>
                                    <div className="msgr-conv-info" style={{ justifyContent: 'center' }}>
                                        <div className="msgr-conv-name-row">
                                            <span className="msgr-conv-name">{emp.name}</span>
                                        </div>
                                        <div className="msgr-conv-last-msg" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            {emp.department_name}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="msgr-window">
                {activeConv ? (
                    <>
                        <div className="msgr-window-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="msgr-header-user">
                                <button className="msgr-back-btn" onClick={() => setActiveConv(null)}>
                                    <FiArrowLeft />
                                </button>
                                <div className="msgr-avatar" style={{ width: 40, height: 40, fontSize: '1rem' }}>
                                    {getChatPartner(activeConv).profile_image ? (
                                        <img 
                                            src={(getChatPartner(activeConv).profile_image.startsWith('http') || getChatPartner(activeConv).profile_image.startsWith('data:')) ? getChatPartner(activeConv).profile_image : `${API.defaults.baseURL.replace('/api', '')}${getChatPartner(activeConv).profile_image}`} 
                                            alt="Avatar" 
                                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} 
                                        />
                                    ) : getChatPartner(activeConv).avatar}
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {getChatPartner(activeConv).name}
                                        {!isParticipant && (
                                            <span style={{ fontSize: '0.7rem', padding: '2px 6px', background: 'rgba(234, 179, 8, 0.2)', color: '#eab308', borderRadius: 4, fontWeight: 600 }}>
                                                Read-Only Oversight (Reads logged)
                                            </span>
                                        )}
                                    </div>
                                    <div className="msgr-status">
                                        {activeConv.isGroup ? `${activeConv.participants.length} members` : ''}
                                    </div>
                                </div>
                            </div>

                            {/* Export button visible only to Super Admin */}
                            {isAdmin && (
                                <button 
                                    className="btn btn-outline btn-sm" 
                                    onClick={() => handleExport(activeConv._id)}
                                    title="Export conversation to PDF"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}
                                >
                                    <FiDownload size={14} /> Export PDF
                                </button>
                            )}
                        </div>

                        <div className="msgr-messages-container">
                            {messages.map((msg, i) => {
                                const isMe = (msg.sender?._id || msg.sender?.id) === (user._id || user.id);
                                return (
                                    <div key={msg._id || i} className={`msgr-msg-wrapper ${isMe ? 'msgr-sent' : 'msgr-received'}`}>
                                        <div className="msgr-msg-bubble">
                                            {!isMe && (activeConv.isGroup || !isParticipant) && (
                                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--accent-primary)', marginBottom: 4 }}>
                                                    {msg.sender?.name || 'User'}
                                                </div>
                                            )}

                                            {msg.fileUrl && (() => {
                                                const isAbsolute = msg.fileUrl.startsWith('http') || msg.fileUrl.startsWith('data:');
                                                const fullUrl = isAbsolute ? msg.fileUrl : `${API.defaults.baseURL.replace('/api', '')}${msg.fileUrl}`;
                                                const displayName = msg.fileName || (isAbsolute ? 'file' : msg.fileUrl.split('/').pop());
                                                const displaySize = msg.fileSize ? (msg.fileSize > 1024 * 1024 ? (msg.fileSize / (1024 * 1024)).toFixed(1) + ' MB' : (msg.fileSize / 1024).toFixed(0) + ' KB') : null;
                                                
                                                if (msg.fileType === 'image') {
                                                    return <img src={fullUrl} className="msgr-msg-file" alt="Sent" onClick={() => window.open(fullUrl)} />;
                                                } else if (msg.fileType === 'video') {
                                                    return <video src={fullUrl} className="msgr-msg-video" controls />;
                                                } else if (msg.fileType === 'audio') {
                                                    return (
                                                        <div className="msgr-audio-player">
                                                            <FiMusic style={{ marginRight: 10, fontSize: '1.2rem', color: isMe ? '#fff' : 'var(--accent-primary)' }} />
                                                            <audio src={fullUrl} controls style={{ height: 32 }} />
                                                        </div>
                                                    );
                                                } else {
                                                    let ext = displayName.split('.').pop().toLowerCase();
                                                    let Icon = FiFile;
                                                    let iconColor = 'var(--accent-primary)';

                                                    if (['pdf'].includes(ext)) { Icon = FiFileText; iconColor = '#ef4444'; }
                                                    else if (['doc', 'docx'].includes(ext)) { Icon = FiFileText; iconColor = '#3b82f6'; }
                                                    else if (['xls', 'xlsx'].includes(ext)) { Icon = FiFileText; iconColor = '#10b981'; }
                                                    else if (['png', 'jpg', 'jpeg'].includes(ext)) { Icon = FiImage; iconColor = '#8b5cf6'; }
                                                    
                                                    return (
                                                        <a href={fullUrl} target="_blank" rel="noreferrer" className="msgr-file-link">
                                                            <div className="msgr-file-icon-box" style={{ background: isMe ? 'rgba(255,255,255,0.2)' : iconColor }}>
                                                                <Icon />
                                                            </div>
                                                            <div className="msgr-file-details">
                                                                <div className="msgr-file-name" title={displayName}>
                                                                    {displayName.length > 25 ? displayName.substring(0, 22) + '...' : displayName}
                                                                </div>
                                                                <div className="msgr-file-download-text">
                                                                    {displaySize ? displaySize + ' • ' : ''}Download <FiDownload size={12} />
                                                                </div>
                                                            </div>
                                                        </a>
                                                    );
                                                }
                                            })()}

                                            {msg.text && <div>{msg.text}</div>}

                                            <div className="msgr-msg-info">
                                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area or Read-only Notice */}
                        {!isParticipant ? (
                            <div style={{ padding: '12px 16px', background: 'rgba(234, 179, 8, 0.08)', color: '#eab308', fontSize: '0.85rem', textAlign: 'center', borderTop: '1px solid rgba(234, 179, 8, 0.2)' }}>
                                Read-only oversight mode. You are not a participant in this conversation.
                            </div>
                        ) : (
                            <div>
                                {selectedFile && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: 'rgba(255, 255, 255, 0.05)', borderTop: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                                        <FiPaperclip size={14} />
                                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
                                        </span>
                                        <button 
                                            type="button" 
                                            onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                                        >
                                            <FiX />
                                        </button>
                                    </div>
                                )}
                                <form className="msgr-input-area" onSubmit={handleSend}>
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        style={{ display: 'none' }} 
                                        accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx"
                                        onChange={handleFileSelect}
                                    />
                                    <button 
                                        type="button" 
                                        className="btn btn-icon btn-sm" 
                                        onClick={() => fileInputRef.current?.click()} 
                                        title="Attach file (PDF, PNG, JPG, DOCX, XLSX up to 10 MB)"
                                        style={{ marginRight: 8, color: selectedFile ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                                    >
                                        <FiPaperclip size={18} />
                                    </button>

                                    <div className="msgr-input-wrapper">
                                        <input
                                            className="msgr-main-input"
                                            placeholder="Type a message..."
                                            value={inputText}
                                            onChange={e => setInputText(e.target.value)}
                                        />
                                    </div>

                                    <button className="msgr-send-btn" type="submit" disabled={!inputText.trim() && !selectedFile}>
                                        <FiSend />
                                    </button>
                                </form>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="msgr-empty-state">
                        <div className="msgr-empty-card">
                            <div className="msgr-empty-icon"><FiMessageSquare /></div>
                            <h2>Your Private HRMS Messenger</h2>
                            <p>Secure, real-time communication for organization employees.</p>
                            <button className="btn btn-primary btn-lg mt-24" onClick={() => setShowNewChat(true)}>
                                Start a New Conversation
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* New Chat Modal */}
            {showNewChat && (
                <div className="modal-overlay" onClick={() => setShowNewChat(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
                        <div className="modal-header">
                            <h3 className="modal-title">New Conversation</h3>
                            <button className="modal-close" onClick={() => setShowNewChat(false)}><FiX /></button>
                        </div>
                        <div className="modal-body">
                            <div className="msgr-search" style={{ marginTop: 0 }}>
                                <FiSearch className="msgr-search-icon" />
                                <input
                                    placeholder="Search employees..."
                                    value={searchEmp}
                                    onChange={e => setSearchEmp(e.target.value)}
                                />
                            </div>

                            <div className="msgr-employee-list">
                                {searching ? (
                                    <div className="text-center mt-24">
                                        <div className="loading-spinner" style={{ width: 30, height: 30, margin: '0 auto' }} />
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 12 }}>Searching contacts...</p>
                                    </div>
                                ) : employees.length === 0 ? (
                                    <div className="text-center mt-24">
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No employees found.</p>
                                    </div>
                                ) : employees
                                    .filter(e => (e.name || '').toLowerCase().includes(searchEmp.toLowerCase()) || (e.department_name || '').toLowerCase().includes(searchEmp.toLowerCase()))
                                    .map(emp => (
                                        <div
                                            key={emp._id || emp.id}
                                            className="msgr-employee-item"
                                            onClick={() => handleNewChat(emp)}
                                        >
                                            <div className="msgr-avatar">
                                                {emp.profile_image ? (
                                                    <img 
                                                        src={(emp.profile_image.startsWith('http') || emp.profile_image.startsWith('data:')) ? emp.profile_image : `${API.defaults.baseURL.replace('/api', '')}${emp.profile_image}`} 
                                                        alt={emp.name} 
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} 
                                                    />
                                                ) : emp.name[0]}
                                            </div>
                                            <div className="msgr-employee-info">
                                                <div className="msgr-employee-name">{emp.name}</div>
                                                <div className="msgr-employee-sub">{emp.department_name}</div>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
