import { useState, useEffect, useRef, useCallback } from 'react';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import {
    FiSearch, FiPlus, FiSend, FiTrash2,
    FiMoreVertical, FiUser, FiUsers,
    FiImage, FiVideo, FiX, FiCheckCircle, FiMessageSquare, FiArrowLeft,
    FiFileText, FiMusic, FiArchive, FiFile, FiDownload, FiPackage
} from 'react-icons/fi';
import './Messages.css';

export default function Messages() {
    const { user } = useAuth();
    const [conversations, setConversations] = useState([]);
    const [activeConv, setActiveConv] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [showNewChat, setShowNewChat] = useState(false);
    const [employees, setEmployees] = useState([]);
    const [searchEmp, setSearchEmp] = useState('');
    const [searchConv, setSearchConv] = useState('');
    const [loading, setLoading] = useState(true);
    const [searching, setSearching] = useState(false);
    const [menuConvId, setMenuConvId] = useState(null);
    const [globalSearchEmps, setGlobalSearchEmps] = useState([]);

    const messagesEndRef = useRef(null);

    // ── Message Polling ───────────────────────────────────────────
    useEffect(() => {
        if (!activeConv) return;

        const fetchMessages = async () => {
            try {
                const { data } = await API.get(`/messages/${activeConv._id}`);
                setMessages(data.messages || []);
            } catch (err) {
                console.error('Polling error:', err);
            }
        };

        fetchMessages(); // Initial fetch
        const interval = setInterval(fetchMessages, 3000); // Poll every 3 seconds

        return () => clearInterval(interval);
    }, [activeConv]);

    // ── Conversation Auto-Refresh ──────────────────────────────────
    useEffect(() => {
        const interval = setInterval(loadConversations, 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const handleClickOutside = () => setMenuConvId(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    // ── Data Loading ───────────────────────────────────────────
    const loadConversations = async () => {
        try {
            const { data } = await API.get('/conversations');
            setConversations(data.conversations || []);
            setLoading(false);
        } catch (err) {
            console.error(err);
            setLoading(false);
        }
    };

    useEffect(() => { loadConversations(); }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ── Global Search for New Employees ────────────────────────────
    useEffect(() => {
        if (!searchConv.trim()) {
            setGlobalSearchEmps([]);
            return;
        }
        const delaySearch = setTimeout(async () => {
            try {
                const { data } = await API.get(`/employees?status=active&search=${searchConv}`);
                // Extract IDs to exclude current user and people we already chat with
                const activePartnerIds = new Set(
                    conversations.flatMap(c => c.participants.map(p => p._id || p.id))
                );
                const filtered = (data.employees || []).filter(e => 
                    (e._id || e.id) !== (user._id || user.id) && !activePartnerIds.has(e._id || e.id)
                );
                setGlobalSearchEmps(filtered);
            } catch (err) { }
        }, 300);
        return () => clearTimeout(delaySearch);
    }, [searchConv, conversations, user]);

    // ── Actions ────────────────────────────────────────────────
    const handleSend = async (e) => {
        e.preventDefault();
        if (!inputText.trim() || !activeConv) return;

        const msgData = {
            conversationId: activeConv._id,
            text: inputText
        };

        try {
            const { data } = await API.post('/messages', msgData);
            if (data.success) {
                setMessages(prev => [...prev, data.message]);
                setInputText('');
                loadConversations(); // Refresh last message in list
            }
        } catch (err) {
            console.error('Send failed', err);
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
                
                // Show success message
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
            const { data } = await API.post('/conversations', { recipientId: recipient._id });
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
        }
    };

    const fetchEmployees = useCallback(async () => {
        setSearching(true);
        try {
            const { data } = await API.get(`/employees?status=active&search=${searchEmp}`);
            // Filter out current user from new conversation list
            const filtered = (data.employees || []).filter(e => (e._id || e.id) !== (user._id || user.id));
            setEmployees(filtered);
        } catch (err) {
            console.error('Failed to fetch employees', err);
        } finally {
            setSearching(false);
        }
    }, [searchEmp, user?._id, user?.id]);

    useEffect(() => { if (showNewChat) fetchEmployees(); }, [showNewChat, searchEmp, fetchEmployees]);

    const getChatPartner = (conv) => {
        if (conv.isGroup) return { name: conv.groupName, avatar: conv.groupName[0], profile_image: null };
        const partner = conv.participants.find(p => (p._id || p.id) !== (user._id || user.id));
        if (!partner) return { name: 'Saved Messages', avatar: 'Me', profile_image: null };
        return { 
            ...partner, 
            name: partner.name || 'User', 
            avatar: (partner.name || 'U')[0], 
            profile_image: partner.profile_image 
        };
    };

    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;

    return (
        <div className={`msgr-page ${activeConv ? 'msgr-view-chat' : 'msgr-view-list'}`}>
            {/* Sidebar */}
            <div className="msgr-sidebar">
                <div className="msgr-sidebar-header">
                    <div className="flex-between" style={{ marginBottom: 16 }}>
                        <h2 style={{ margin: 0 }}>Messages</h2>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowNewChat(true)}>
                            <FiPlus /> New Chat
                        </button>
                    </div>
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
                            No active chats. Start one!
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
                                    key={`new-${emp._id}`}
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
                                            {emp.designation} · {emp.department_name}
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
                        <div className="msgr-window-header">
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
                                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{getChatPartner(activeConv).name}</div>
                                    <div className="msgr-status">
                                        {activeConv.isGroup ? `${activeConv.participants.length} members` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="msgr-messages-container">
                            {messages.map((msg, i) => {
                                const isMe = (msg.sender._id || msg.sender.id) === (user._id || user.id);
                                return (
                                    <div key={msg._id || i} className={`msgr-msg-wrapper ${isMe ? 'msgr-sent' : 'msgr-received'}`}>
                                        <div className="msgr-msg-bubble">
                                            {!isMe && activeConv.isGroup && (
                                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--accent-primary)', marginBottom: 4 }}>
                                                    {msg.sender.name}
                                                </div>
                                            )}

                                            {msg.fileUrl && (() => {
                                                const isAbsolute = msg.fileUrl.startsWith('http') || msg.fileUrl.startsWith('data:');
                                                const fullUrl = isAbsolute ? msg.fileUrl : `${API.defaults.baseURL.replace('/api', '')}${msg.fileUrl}`;
                                                // Prioritize saved fileName, fallback to URL parsing
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
                                                    // Comprehensive File / Document Rendering
                                                    let ext = displayName.split('.').pop().toLowerCase();
                                                    let Icon = FiFile;
                                                    let iconColor = 'var(--accent-primary)';

                                                    if (['pdf'].includes(ext)) { Icon = FiFileText; iconColor = '#ef4444'; }
                                                    else if (['doc', 'docx', 'txt'].includes(ext)) { Icon = FiFileText; iconColor = '#3b82f6'; }
                                                    else if (['xls', 'xlsx', 'csv'].includes(ext)) { Icon = FiFileText; iconColor = '#10b981'; }
                                                    else if (['ppt', 'pptx'].includes(ext)) { Icon = FiFileText; iconColor = '#f59e0b'; }
                                                    else if (['zip', 'rar', '7z'].includes(ext)) { Icon = FiArchive; iconColor = '#8b5cf6'; }
                                                    else if (['apk'].includes(ext)) { Icon = FiPackage; iconColor = '#a855f7'; }
                                                    else if (['vcf'].includes(ext)) { Icon = FiUser; iconColor = '#06b6d4'; }
                                                    else if (['json', 'html', 'xml'].includes(ext)) { Icon = FiFile; iconColor = '#6366f1'; }
                                                    
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


                        <form className="msgr-input-area" onSubmit={handleSend}>
                            <div className="msgr-input-wrapper">
                                <input
                                    className="msgr-main-input"
                                    placeholder="Type a message..."
                                    value={inputText}
                                    onChange={e => setInputText(e.target.value)}
                                />
                            </div>

                            <button className="msgr-send-btn" type="submit" disabled={!inputText.trim()}>
                                <FiSend />
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="msgr-empty-state">
                        <div className="msgr-empty-card">
                            <div className="msgr-empty-icon"><FiMessageSquare /></div>
                            <h2>Your Private HRMS Messenger</h2>
                            <p>Secure, real-time communication for Hari HRMS employees.</p>
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
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Try searching for a different name.</p>
                                    </div>
                                ) : employees.map(emp => (
                                    <div
                                        key={emp._id}
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
                                            <div className="msgr-employee-sub">{emp.designation} · {emp.department_name}</div>
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
