import { useState, useEffect, useRef, useCallback } from 'react';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { normalizeRole } from '../utils/roleHelper';
import { v4 as uuidv4 } from 'uuid';
import {
    FiSearch, FiPlus, FiSend, FiTrash2,
    FiMoreVertical, FiUser, FiUsers,
    FiImage, FiVideo, FiX, FiCheckCircle, FiCheck, FiClock, FiAlertCircle,
    FiMessageSquare, FiArrowLeft, FiArrowDown,
    FiFileText, FiMusic, FiArchive, FiFile, FiDownload, FiPaperclip, FiShield, FiAlertTriangle, FiBell
} from 'react-icons/fi';
import {
    playNotificationSound,
    showDesktopNotification,
    checkDesktopNotificationSupport,
    requestDesktopNotificationPermission
} from '../utils/chatNotificationHelper';
import './Messages.css';

// WhatsApp-style double check icon
const DoubleCheck = ({ color = 'currentColor', title = '' }) => (
    <svg
        width="16"
        height="11"
        viewBox="0 0 16 11"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        title={title}
        style={{ verticalAlign: 'middle', flexShrink: 0 }}
    >
        <path d="M1 5.5L4.5 9L11 1.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 5.5L8.5 9L15 1.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

// Date separator formatting
const formatDateSeparator = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

export default function Messages() {
    const { user } = useAuth();
    const socket = useSocket();
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
    const [sending, setSending] = useState(false);
    const [menuConvId, setMenuConvId] = useState(null);
    const [globalSearchEmps, setGlobalSearchEmps] = useState([]);
    const [viewOversight, setViewOversight] = useState(false);
    const [showJumpBottom, setShowJumpBottom] = useState(false);
    const [desktopPermBanner, setDesktopPermBanner] = useState(() => {
        const sup = checkDesktopNotificationSupport();
        return sup.supported && sup.permission === 'default';
    });

    const messagesEndRef = useRef(null);
    const scrollContainerRef = useRef(null);
    const fileInputRef = useRef(null);
    const lastTimestampRef = useRef(null);
    const isScrolledUpRef = useRef(false);

    // Precise calculation of whether the message was sent by the logged-in user
    const isMyMessage = useCallback((msg) => {
        if (!user || !msg) return false;
        const myMongoId = String(user._id || '');
        const myCustomId = String(user.id || '');
        const senderMongoId = String(msg.sender?._id || (typeof msg.sender === 'string' ? msg.sender : ''));
        const senderCustomId = String(msg.sender?.id || '');

        return Boolean(
            (myMongoId && (myMongoId === senderMongoId || myMongoId === senderCustomId)) ||
            (myCustomId && (myCustomId === senderCustomId || myCustomId === senderMongoId))
        );
    }, [user]);

    // Is current user a participant in active conversation?
    const isParticipant = activeConv ? (activeConv.participants || []).some(p => {
        const pid = (p?._id || p?.id || p).toString();
        const uid = (user?._id || user?.id || '').toString();
        return pid === uid || (user?.id && pid === user.id);
    }) : false;

    // ── Mark Messages as Delivered (when opening or polling conversations) ──
    const triggerMarkDelivered = useCallback(async () => {
        try {
            await API.post('/messages/delivered');
        } catch (_) {}
    }, []);

    // ── Mark Messages in Active Conversation as Seen ────────────────
    const triggerMarkSeen = useCallback(async (convId) => {
        if (!convId || document.visibilityState !== 'visible') return;
        try {
            await API.post('/messages/seen', { conversationId: convId });
            // Notify global badge to update
            window.dispatchEvent(new CustomEvent('chat_unread_update'));
        } catch (_) {}
    }, []);

    // ── Load Conversations ──────────────────────────────────────────
    const loadConversations = useCallback(async () => {
        try {
            const url = (isAdmin && viewOversight) ? '/conversations?all=true' : '/conversations';
            const { data } = await API.get(url);
            setConversations(data.conversations || []);
            setLoading(false);
            triggerMarkDelivered();
        } catch (err) {
            console.error('Load conversations error:', err);
            setLoading(false);
        }
    }, [isAdmin, viewOversight, triggerMarkDelivered]);

    useEffect(() => {
        loadConversations();
    }, [loadConversations]);

    // Adaptive conversations refresh: 10s when tab active, 30s when hidden
    useEffect(() => {
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                loadConversations();
            }
        }, 10000);
        return () => clearInterval(interval);
    }, [loadConversations]);

    // ── Scroll Handling ─────────────────────────────────────────────
    const handleScroll = () => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        const isUp = distanceFromBottom > 120;
        isScrolledUpRef.current = isUp;
        setShowJumpBottom(isUp);
    };

    const scrollToBottom = (behavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
        setShowJumpBottom(false);
        isScrolledUpRef.current = false;
    };

    // ── Active Conversation Messages & Polling (2-3s active, Page Visibility) ──
    useEffect(() => {
        if (!activeConv) return;

        let isMounted = true;
        lastTimestampRef.current = null;
        isScrolledUpRef.current = false;

        const fetchInitial = async () => {
            try {
                const { data } = await API.get(`/messages/${activeConv._id}`);
                if (isMounted) {
                    const list = data.messages || [];
                    setMessages(list);
                    if (list.length > 0) {
                        lastTimestampRef.current = list[list.length - 1].createdAt;
                    }
                    setTimeout(() => scrollToBottom('auto'), 50);
                    if (document.visibilityState === 'visible') {
                        triggerMarkSeen(activeConv._id);
                    }
                }
            } catch (err) {
                console.error('Initial fetch error:', err);
            }
        };

        fetchInitial();

        // 2.5s adaptive polling for open chat
        const interval = setInterval(async () => {
            if (!activeConv) return;
            try {
                // If tab is hidden, skip fast poll or mark as delivered only
                if (document.visibilityState !== 'visible') {
                    return;
                }

                const url = lastTimestampRef.current
                    ? `/messages/${activeConv._id}?since=${encodeURIComponent(lastTimestampRef.current)}`
                    : `/messages/${activeConv._id}`;

                const { data } = await API.get(url);
                if (isMounted && data.messages && data.messages.length > 0) {
                    setMessages(prev => {
                        const existingMap = new Map(prev.map(m => [m.clientMessageId || m._id, m]));
                        let hasNewPartnerMessage = false;

                        for (const msg of data.messages) {
                            const key = msg.clientMessageId || msg._id;
                            existingMap.set(key, msg);
                            if (!isMyMessage(msg)) {
                                hasNewPartnerMessage = true;
                            }
                        }

                        const updatedList = Array.from(existingMap.values()).sort(
                            (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
                        );

                        if (hasNewPartnerMessage) {
                            if (document.visibilityState === 'visible') {
                                triggerMarkSeen(activeConv._id);
                                if (!isScrolledUpRef.current) {
                                    setTimeout(() => scrollToBottom('smooth'), 50);
                                }
                            } else {
                                playNotificationSound();
                                showDesktopNotification(
                                    getChatPartner(activeConv).name,
                                    data.messages[data.messages.length - 1].text,
                                    activeConv._id
                                );
                            }
                        }

                        return updatedList;
                    });

                    lastTimestampRef.current = data.messages[data.messages.length - 1].createdAt;
                }
            } catch (err) {
                console.error('Polling error:', err);
            }
        }, 2500);

        // Visibility change listener: when tab becomes visible, mark open conversation messages as seen
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && activeConv) {
                triggerMarkSeen(activeConv._id);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            isMounted = false;
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [activeConv, isMyMessage, triggerMarkSeen]);

    // Click outside menu closer
    useEffect(() => {
        const handleClickOutside = () => setMenuConvId(null);
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    // ── Global Search for Employees via Contact Directory ───────────
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
            } catch (err) {}
        }, 300);
        return () => clearTimeout(delaySearch);
    }, [searchConv, conversations, user]);

    // ── Actions ─────────────────────────────────────────────────────
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
        if (e) e.preventDefault();
        const textToSend = inputText.trim();
        if ((!textToSend && !selectedFile) || !activeConv || sending) return;

        const clientMessageId = uuidv4();
        const now = new Date().toISOString();

        // Optimistic message update
        const optimisticMsg = {
            _id: `temp_${clientMessageId}`,
            clientMessageId,
            conversationId: activeConv._id,
            sender: {
                _id: user?._id,
                id: user?.id,
                name: user?.name,
                profile_image: user?.profile_image
            },
            text: textToSend,
            fileName: selectedFile?.name || null,
            fileSize: selectedFile?.size || null,
            fileType: selectedFile ? (selectedFile.type.startsWith('image/') ? 'image' : 'file') : null,
            status: 'sending',
            createdAt: now,
            updatedAt: now
        };

        setMessages(prev => [...prev, optimisticMsg]);
        setInputText('');
        const fileToUpload = selectedFile;
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setTimeout(() => scrollToBottom('smooth'), 50);

        setSending(true);
        const formData = new FormData();
        formData.append('conversationId', activeConv._id);
        formData.append('clientMessageId', clientMessageId);
        if (textToSend) formData.append('text', textToSend);
        if (fileToUpload) formData.append('file', fileToUpload);

        try {
            const { data } = await API.post('/messages', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (data.success && data.message) {
                setMessages(prev => prev.map(m =>
                    (m.clientMessageId === clientMessageId || m._id === optimisticMsg._id)
                        ? data.message
                        : m
                ));
                loadConversations();
            }
        } catch (err) {
            console.error('Send failed', err);
            // Mark optimistic message as failed with retry option
            setMessages(prev => prev.map(m =>
                (m.clientMessageId === clientMessageId || m._id === optimisticMsg._id)
                    ? { ...m, status: 'failed', retryData: { text: textToSend, file: fileToUpload } }
                    : m
            ));
        } finally {
            setSending(false);
        }
    };

    const handleRetry = async (failedMsg) => {
        const { text, file } = failedMsg.retryData || { text: failedMsg.text, file: null };
        setMessages(prev => prev.map(m => m.clientMessageId === failedMsg.clientMessageId ? { ...m, status: 'sending' } : m));

        const formData = new FormData();
        formData.append('conversationId', activeConv._id);
        formData.append('clientMessageId', failedMsg.clientMessageId);
        if (text) formData.append('text', text);
        if (file) formData.append('file', file);

        try {
            const { data } = await API.post('/messages', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (data.success && data.message) {
                setMessages(prev => prev.map(m =>
                    m.clientMessageId === failedMsg.clientMessageId ? data.message : m
                ));
                loadConversations();
            }
        } catch (err) {
            setMessages(prev => prev.map(m =>
                m.clientMessageId === failedMsg.clientMessageId ? { ...m, status: 'failed' } : m
            ));
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
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
        if (!window.confirm('Are you sure you want to delete this conversation? This cannot be undone.')) return;

        try {
            const { data } = await API.delete(`/conversations/${convId}`);
            if (data.success) {
                if (activeConv?._id === convId) setActiveConv(null);
                setMenuConvId(null);
                loadConversations();
            }
        } catch (err) {
            console.error('Delete failed', err);
            alert(err.response?.data?.message || 'Failed to delete chat.');
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

        if (conv.isGroup || (conv.participants || []).length > 2) {
            const participantNames = (conv.participants || []).map(p => p.name || 'User').join(', ');
            const groupTitle = conv.groupName || participantNames;
            return {
                name: groupTitle,
                avatar: (groupTitle || 'G')[0],
                profile_image: null
            };
        }

        const partner = otherParticipants[0] || (conv.participants || [])[0];
        const partnerName = partner?.name || 'User';
        return {
            ...partner,
            name: partnerName,
            avatar: partnerName[0] || 'U',
            profile_image: partner?.profile_image || null
        };
    };

    // Find the latest message sent by me to display the status label
    const latestSentMsgId = (() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (isMyMessage(messages[i])) {
                return messages[i].clientMessageId || messages[i]._id;
            }
        }
        return null;
    })();

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

                    {/* Desktop Notification Request Banner */}
                    {desktopPermBanner && (
                        <div className="msgr-perm-banner" style={{ borderRadius: 8, marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FiBell size={14} style={{ color: 'var(--accent-primary)' }} />
                                <span>Get desktop alerts for new messages?</span>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                    className="btn btn-primary btn-sm"
                                    style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                                    onClick={async () => {
                                        const res = await requestDesktopNotificationPermission();
                                        if (res === 'granted' || res === 'denied') setDesktopPermBanner(false);
                                    }}
                                >
                                    Enable
                                </button>
                                <button
                                    className="btn btn-outline btn-sm"
                                    style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                                    onClick={() => setDesktopPermBanner(false)}
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    )}

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
                            const unread = (conv.unreadCount || 0) > 0;
                            const lastMsgTime = conv.lastMessage?.createdAt || conv.updatedAt;
                            return (
                                <div
                                    key={conv._id}
                                    className={`msgr-conv-item ${activeConv?._id === conv._id ? 'msgr-active' : ''} ${unread ? 'unread' : ''}`}
                                    onClick={() => {
                                        setActiveConv(conv);
                                        triggerMarkSeen(conv._id);
                                    }}
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
                                                {lastMsgTime ? new Date(lastMsgTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                                            {unread && (
                                                <span className="msgr-unread-pill">
                                                    {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                                                </span>
                                            )}
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
                                <button className="msgr-back-btn" onClick={() => setActiveConv(null)} aria-label="Back to conversations">
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

                        <div className="msgr-messages-container" ref={scrollContainerRef} onScroll={handleScroll}>
                            {messages.map((msg, i) => {
                                const isMe = isMyMessage(msg);
                                const msgKey = msg.clientMessageId || msg._id || i;
                                const isLatestSent = msgKey === latestSentMsgId;

                                // Date separator check
                                const currentDate = new Date(msg.createdAt).toDateString();
                                const prevDate = i > 0 ? new Date(messages[i - 1].createdAt).toDateString() : null;
                                const showDateSeparator = currentDate !== prevDate;

                                // Consecutive sender grouping
                                const prevMsg = i > 0 ? messages[i - 1] : null;
                                const isGrouped = prevMsg &&
                                    isMyMessage(prevMsg) === isMe &&
                                    !showDateSeparator &&
                                    (new Date(msg.createdAt) - new Date(prevMsg.createdAt) < 240000);

                                return (
                                    <div key={msgKey} style={{ width: '100%' }}>
                                        {showDateSeparator && (
                                            <div className="msgr-date-separator">
                                                <span>{formatDateSeparator(msg.createdAt)}</span>
                                            </div>
                                        )}

                                        <div className={`msgr-msg-wrapper ${isMe ? 'msgr-sent' : 'msgr-received'} ${isGrouped ? 'msgr-grouped' : ''}`}>
                                            <div className="msgr-msg-bubble">
                                                {!isMe && !isGrouped && (activeConv.isGroup || !isParticipant) && (
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
                                                        return (
                                                            <a href={fullUrl} target="_blank" rel="noreferrer" className="msgr-file-link">
                                                                <div className="msgr-file-icon-box" style={{ background: isMe ? 'rgba(255,255,255,0.2)' : 'var(--accent-primary)' }}>
                                                                    <FiFile />
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

                                                {msg.text && <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>}

                                                <div className="msgr-msg-footer">
                                                    <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                    {isMe && (
                                                        <span className="msgr-status-ticks">
                                                            {msg.status === 'sending' ? (
                                                                <FiClock size={11} style={{ opacity: 0.8 }} title="Sending..." />
                                                            ) : msg.status === 'failed' ? (
                                                                <button
                                                                    className="msgr-retry-btn"
                                                                    onClick={() => handleRetry(msg)}
                                                                    title="Failed. Click to retry"
                                                                >
                                                                    <FiAlertCircle size={11} /> Retry
                                                                </button>
                                                            ) : msg.status === 'seen' ? (
                                                                <DoubleCheck
                                                                    color="#38bdf8"
                                                                    title={msg.seenAt ? `Seen at ${new Date(msg.seenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Seen'}
                                                                />
                                                            ) : msg.status === 'delivered' ? (
                                                                <DoubleCheck color="rgba(255, 255, 255, 0.75)" title="Delivered" />
                                                            ) : (
                                                                <FiCheck size={13} style={{ color: 'rgba(255, 255, 255, 0.7)' }} title="Sent" />
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Text label under the latest sent message */}
                                            {isMe && isLatestSent && msg.status !== 'sending' && msg.status !== 'failed' && (
                                                <div className="msgr-latest-status-label" title={msg.seenAt ? `Seen at ${new Date(msg.seenAt).toLocaleTimeString()}` : ''}>
                                                    {msg.status === 'seen' ? (
                                                        <span style={{ color: '#38bdf8', fontWeight: 600 }}>Seen</span>
                                                    ) : msg.status === 'delivered' ? (
                                                        <span>Delivered</span>
                                                    ) : (
                                                        <span>Sent</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Jump to bottom button when scrolled up */}
                        {showJumpBottom && (
                            <button
                                className="msgr-jump-bottom"
                                onClick={() => scrollToBottom('smooth')}
                                aria-label="Jump to latest message"
                            >
                                <FiArrowDown size={14} /> New messages
                            </button>
                        )}

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
                                        style={{ marginRight: 4, color: selectedFile ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                                    >
                                        <FiPaperclip size={18} />
                                    </button>

                                    <div className="msgr-input-wrapper">
                                        <textarea
                                            className="msgr-main-input"
                                            placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                                            value={inputText}
                                            rows={1}
                                            onChange={e => {
                                                setInputText(e.target.value);
                                                e.target.style.height = 'auto';
                                                e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                                            }}
                                            onKeyDown={handleKeyDown}
                                            style={{ maxHeight: 100, resize: 'none' }}
                                        />
                                    </div>

                                    <button
                                        className="msgr-send-btn"
                                        type="submit"
                                        disabled={(!inputText.trim() && !selectedFile) || sending}
                                        aria-label="Send message"
                                    >
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
