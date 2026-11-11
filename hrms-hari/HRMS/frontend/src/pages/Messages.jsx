import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
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
    FiFileText, FiMusic, FiArchive, FiFile, FiDownload, FiPaperclip, FiShield, FiAlertTriangle, FiBell, FiUploadCloud, FiRefreshCw, FiCalendar, FiFilter
} from 'react-icons/fi';
import LinkifiedText from '../utils/linkify';
import ImageLightbox from '../components/ImageLightbox';
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

// File extension helper icon
const getFileIcon = (fileName = '') => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FiFileText style={{ color: '#ef4444' }} />;
    if (['doc', 'docx'].includes(ext)) return <FiFileText style={{ color: '#3b82f6' }} />;
    if (['xls', 'xlsx', 'csv'].includes(ext)) return <FiFileText style={{ color: '#10b981' }} />;
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return <FiArchive style={{ color: '#f59e0b' }} />;
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return <FiMusic style={{ color: '#8b5cf6' }} />;
    if (['mp4', 'webm', 'mov'].includes(ext)) return <FiVideo style={{ color: '#ec4899' }} />;
    return <FiFile style={{ color: 'var(--text-secondary)' }} />;
};

// Formatted file size helper
const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Super Admin oversight conversation title helper: "Person A <-> Person B"
const getOversightTitle = (conv) => {
    if (!conv) return 'Conversation';
    if (conv.isGroup) {
        return `${conv.groupName || 'Group'} (${conv.participants?.length || 0} members)`;
    }
    const p = conv.participants || [];
    if (p.length === 0) return 'No participants';
    if (p.length === 1) return `${p[0].name} (${p[0].id || 'User'})`;
    return `${p[0].name} (${p[0].id || 'User'}) ↔ ${p[1].name} (${p[1].id || 'User'})`;
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
    const [pendingFiles, setPendingFiles] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const [lightboxImage, setLightboxImage] = useState(null);
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

    // ── Super Admin Oversight State (Zero Shared State with My Chats) ──
    const [oversightConvs, setOversightConvs] = useState([]);
    const [selectedOversightConv, setSelectedOversightConv] = useState(null);
    const [oversightMessages, setOversightMessages] = useState([]);
    const [oversightMediaFiles, setOversightMediaFiles] = useState([]);
    const [oversightTotalMessages, setOversightTotalMessages] = useState(0);
    const [oversightLoading, setOversightLoading] = useState(false);
    const [oversightMsgsLoading, setOversightMsgsLoading] = useState(false);
    const [oversightSearch, setOversightSearch] = useState('');
    const [oversightStartDate, setOversightStartDate] = useState('');
    const [oversightEndDate, setOversightEndDate] = useState('');
    const [oversightHasAttachments, setOversightHasAttachments] = useState(false);
    const [oversightPage, setOversightPage] = useState(1);
    const [oversightPagination, setOversightPagination] = useState({
        total: 0,
        page: 1,
        limit: 15,
        totalPages: 1,
        hasMore: false
    });
    const oversightMessagesEndRef = useRef(null);

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

    // ── Load Personal Conversations (Strictly My Chats) ────────────
    const loadConversations = useCallback(async () => {
        try {
            const { data } = await API.get('/conversations');
            setConversations(data.conversations || []);
            setLoading(false);
            triggerMarkDelivered();
        } catch (err) {
            console.error('Load conversations error:', err);
            setLoading(false);
        }
    }, [triggerMarkDelivered]);

    useEffect(() => {
        loadConversations();
    }, [loadConversations]);

    // ── Load Oversight Conversations (Strictly Super Admin Monitor) ──
    const loadOversightConversations = useCallback(async (customOverrides = {}) => {
        if (!isAdmin) return;
        setOversightLoading(true);
        try {
            const params = new URLSearchParams();
            const search = customOverrides.search !== undefined ? customOverrides.search : oversightSearch;
            const startDate = customOverrides.startDate !== undefined ? customOverrides.startDate : oversightStartDate;
            const endDate = customOverrides.endDate !== undefined ? customOverrides.endDate : oversightEndDate;
            const hasAttachments = customOverrides.hasAttachments !== undefined ? customOverrides.hasAttachments : oversightHasAttachments;
            const page = customOverrides.page !== undefined ? customOverrides.page : oversightPage;

            if (search && search.trim()) params.append('search', search.trim());
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (hasAttachments) params.append('hasAttachments', 'true');
            params.append('page', page);
            params.append('limit', '15');

            const { data } = await API.get(`/conversations/admin/all?${params.toString()}`);
            if (data.success) {
                setOversightConvs(data.conversations || []);
                setOversightPagination(data.pagination || {
                    total: 0,
                    page: 1,
                    limit: 15,
                    totalPages: 1,
                    hasMore: false
                });
            }
        } catch (err) {
            console.error('Load oversight conversations error:', err);
        } finally {
            setOversightLoading(false);
        }
    }, [isAdmin, oversightSearch, oversightStartDate, oversightEndDate, oversightHasAttachments, oversightPage]);

    // ── Load Oversight Messages & Details ──────────────────────────
    const loadOversightConversationMessages = useCallback(async (convId) => {
        if (!isAdmin || !convId) return;
        setOversightMsgsLoading(true);
        try {
            const { data } = await API.get(`/conversations/admin/${convId}/messages`);
            if (data.success) {
                setOversightMessages(data.messages || []);
                setOversightMediaFiles(data.mediaFiles || []);
                setOversightTotalMessages(data.totalMessages || 0);
                if (data.conversation) {
                    setSelectedOversightConv(data.conversation);
                }
                setTimeout(() => {
                    oversightMessagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
                }, 50);
            }
        } catch (err) {
            console.error('Load oversight messages error:', err);
        } finally {
            setOversightMsgsLoading(false);
        }
    }, [isAdmin]);

    // Trigger load of oversight conversations when switching to oversight
    useEffect(() => {
        if (isAdmin && viewOversight) {
            loadOversightConversations();
        }
    }, [isAdmin, viewOversight, loadOversightConversations]);

    // Oversight polling: 5s for open oversight conversation, 20s for conversation list
    useEffect(() => {
        if (!isAdmin || !viewOversight) return;

        const convInterval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                loadOversightConversations();
            }
        }, 20000);

        const msgInterval = setInterval(() => {
            if (document.visibilityState === 'visible' && selectedOversightConv?._id) {
                loadOversightConversationMessages(selectedOversightConv._id);
            }
        }, 5000);

        return () => {
            clearInterval(convInterval);
            clearInterval(msgInterval);
        };
    }, [isAdmin, viewOversight, selectedOversightConv?._id, loadOversightConversations, loadOversightConversationMessages]);

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

    // Socket listener for real-time updates when Socket.io is available
    useEffect(() => {
        if (!socket || !activeConv) return;
        const handleReceive = (msg) => {
            const msgConvId = msg.conversationId?._id || msg.conversationId;
            if (msgConvId === activeConv._id) {
                setMessages(prev => {
                    const existing = prev.find(m => (m.clientMessageId && m.clientMessageId === msg.clientMessageId) || m._id === msg._id);
                    return existing ? prev : [...prev, msg];
                });
                if (document.visibilityState === 'visible') {
                    triggerMarkSeen(activeConv._id);
                    scrollToBottom('smooth');
                }
            }
        };
        const handleSeen = ({ conversationId }) => {
            if (conversationId === activeConv._id) {
                setMessages(prev => prev.map(m => isMyMessage(m) ? { ...m, status: 'seen' } : m));
            }
        };
        socket.on('receive_message', handleReceive);
        socket.on('messages_seen', handleSeen);
        return () => {
            socket.off('receive_message', handleReceive);
            socket.off('messages_seen', handleSeen);
        };
    }, [socket, activeConv, isMyMessage, triggerMarkSeen]);

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

    // ── File & Media Handlers ──────────────────────────────────────────
    const addFilesToQueue = (files) => {
        const newItems = Array.from(files).map(file => ({
            id: uuidv4(),
            file,
            name: file.name,
            size: file.size,
            progress: 0,
            status: 'pending',
            abortController: new AbortController(),
            error: null
        }));
        setPendingFiles(prev => [...prev, ...newItems]);
    };

    const removePendingFile = (id) => {
        setPendingFiles(prev => {
            const item = prev.find(p => p.id === id);
            if (item?.abortController) {
                item.abortController.abort();
            }
            return prev.filter(p => p.id !== id);
        });
    };

    const handleFileSelect = (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        addFilesToQueue(files);
        e.target.value = '';
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        if (isParticipant) setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (!isParticipant) return;
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            addFilesToQueue(files);
        }
    };

    const handlePaste = (e) => {
        if (!isParticipant) return;
        const files = Array.from(e.clipboardData?.files || []);
        if (files.length > 0) {
            e.preventDefault();
            addFilesToQueue(files);
        }
    };

    const uploadSingleFile = async (item, clientMessageId, textToSend = '') => {
        const file = item.file;
        const isLarge = file.size > 4 * 1024 * 1024; // >4MB bypasses Vercel limit via signed direct upload

        setPendingFiles(prev => prev.map(p => p.id === item.id ? { ...p, status: 'uploading' } : p));

        if (isLarge) {
            try {
                // 1. Get signed direct upload parameters
                const { data: sigData } = await API.post('/messages/upload-signature', {
                    filename: file.name,
                    fileType: file.type,
                    fileSize: file.size
                });

                if (sigData.provider === 'cloudinary' && sigData.uploadUrl) {
                    const uploadForm = new FormData();
                    uploadForm.append('file', file);
                    Object.entries(sigData.params || {}).forEach(([k, v]) => uploadForm.append(k, v));

                    const uploadRes = await axios.post(sigData.uploadUrl, uploadForm, {
                        signal: item.abortController.signal,
                        onUploadProgress: (progressEvent) => {
                            if (progressEvent.total) {
                                const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                                setPendingFiles(prev => prev.map(p => p.id === item.id ? { ...p, progress: percent } : p));
                            }
                        }
                    });

                    const secureUrl = uploadRes.data?.secure_url || uploadRes.data?.url;

                    // 2. Post message with direct fileUrl
                    const { data: msgData } = await API.post('/messages', {
                        conversationId: activeConv._id,
                        clientMessageId,
                        text: textToSend,
                        fileUrl: secureUrl,
                        fileName: file.name,
                        fileSize: file.size,
                        fileType: file.type.startsWith('image/') ? 'image' : (file.type.startsWith('video/') ? 'video' : (file.type.startsWith('audio/') ? 'audio' : 'file')),
                        mimeType: file.type
                    });

                    setPendingFiles(prev => prev.filter(p => p.id !== item.id));
                    return msgData?.message;
                }
            } catch (err) {
                if (axios.isCancel(err)) {
                    console.info('Upload cancelled by user');
                    return null;
                }
                console.error('Direct upload failed:', err);
                setPendingFiles(prev => prev.map(p => p.id === item.id ? { ...p, status: 'failed', error: err.message } : p));
                throw err;
            }
        }

        // Standard multipart upload for files <= 4MB
        const formData = new FormData();
        formData.append('conversationId', activeConv._id);
        formData.append('clientMessageId', clientMessageId);
        if (textToSend) formData.append('text', textToSend);
        formData.append('file', file);

        try {
            const { data } = await API.post('/messages', formData, {
                signal: item.abortController.signal,
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    if (progressEvent.total) {
                        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        setPendingFiles(prev => prev.map(p => p.id === item.id ? { ...p, progress: percent } : p));
                    }
                }
            });

            setPendingFiles(prev => prev.filter(p => p.id !== item.id));
            return data?.message;
        } catch (err) {
            if (axios.isCancel(err)) {
                return null;
            }
            setPendingFiles(prev => prev.map(p => p.id === item.id ? { ...p, status: 'failed', error: err.message } : p));
            throw err;
        }
    };

    const handleSend = async (e) => {
        if (e) e.preventDefault();
        const textToSend = inputText.trim();
        const filesToUpload = [...pendingFiles];
        if ((!textToSend && filesToUpload.length === 0) || !activeConv || sending) return;

        setInputText('');

        // If there are files in queue, upload each one
        if (filesToUpload.length > 0) {
            setSending(true);
            for (let i = 0; i < filesToUpload.length; i++) {
                const item = filesToUpload[i];
                const clientMessageId = uuidv4();
                const now = new Date().toISOString();
                const fileCaption = (i === 0 && textToSend) ? textToSend : '';

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
                    text: fileCaption,
                    fileName: item.name,
                    fileSize: item.size,
                    fileType: item.file.type.startsWith('image/') ? 'image' : (item.file.type.startsWith('video/') ? 'video' : (item.file.type.startsWith('audio/') ? 'audio' : 'file')),
                    status: 'sending',
                    createdAt: now,
                    updatedAt: now
                };

                setMessages(prev => [...prev, optimisticMsg]);
                setTimeout(() => scrollToBottom('smooth'), 50);

                try {
                    const serverMsg = await uploadSingleFile(item, clientMessageId, fileCaption);
                    if (serverMsg) {
                        setMessages(prev => prev.map(m =>
                            (m.clientMessageId === clientMessageId || m._id === optimisticMsg._id)
                                ? serverMsg
                                : m
                        ));
                        loadConversations();
                    }
                } catch (err) {
                    setMessages(prev => prev.map(m =>
                        (m.clientMessageId === clientMessageId || m._id === optimisticMsg._id)
                            ? { ...m, status: 'failed' }
                            : m
                    ));
                }
            }
            setSending(false);
            return;
        }

        // Text-only message
        const clientMessageId = uuidv4();
        const now = new Date().toISOString();

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
            fileName: null,
            fileSize: null,
            fileType: null,
            status: 'sending',
            createdAt: now,
            updatedAt: now
        };

        setMessages(prev => [...prev, optimisticMsg]);
        setTimeout(() => scrollToBottom('smooth'), 50);

        setSending(true);
        try {
            const { data } = await API.post('/messages', {
                conversationId: activeConv._id,
                clientMessageId,
                text: textToSend
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
            setMessages(prev => prev.map(m =>
                (m.clientMessageId === clientMessageId || m._id === optimisticMsg._id)
                    ? { ...m, status: 'failed', retryData: { text: textToSend } }
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

    // ── Super Admin Oversight 3-Pane Monitor ────────────────────────
    if (isAdmin && viewOversight) {
        return (
            <div className="msgr-page msgr-oversight-page">
                {lightboxImage && (
                    <ImageLightbox
                        imageUrl={lightboxImage.url}
                        fileName={lightboxImage.name}
                        onClose={() => setLightboxImage(null)}
                    />
                )}

                {/* ── PANE 1: Oversight Conversation List ─────────── */}
                <div className="msgr-oversight-list-pane">
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FiShield style={{ color: 'var(--accent-primary)', fontSize: '1.1rem' }} />
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Chat Oversight</h3>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Super Admin Monitor</span>
                        </div>
                        <button
                            className="btn btn-sm btn-outline"
                            onClick={() => { setViewOversight(false); }}
                            style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        >
                            My Chats
                        </button>
                    </div>

                    {/* Filter & Search Controls */}
                    <div className="msgr-oversight-filter-box">
                        <div className="msgr-search" style={{ marginTop: 0 }}>
                            <FiSearch className="msgr-search-icon" />
                            <input
                                placeholder="Search by name, ID (e.g. ZOHA101)..."
                                value={oversightSearch}
                                onChange={e => setOversightSearch(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { setOversightPage(1); loadOversightConversations({ page: 1, search: e.target.value }); } }}
                            />
                        </div>

                        <div className="msgr-oversight-filter-row">
                            <input
                                type="date"
                                className="msgr-oversight-date-input"
                                value={oversightStartDate}
                                onChange={e => setOversightStartDate(e.target.value)}
                                title="Start Date"
                            />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>to</span>
                            <input
                                type="date"
                                className="msgr-oversight-date-input"
                                value={oversightEndDate}
                                onChange={e => setOversightEndDate(e.target.value)}
                                title="End Date"
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <label className="msgr-oversight-checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={oversightHasAttachments}
                                    onChange={e => setOversightHasAttachments(e.target.checked)}
                                />
                                <span>Has files</span>
                            </label>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                    className="btn btn-xs btn-primary"
                                    onClick={() => { setOversightPage(1); loadOversightConversations({ page: 1 }); }}
                                    style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                                >
                                    Filter
                                </button>
                                <button
                                    className="btn btn-xs btn-outline"
                                    onClick={() => {
                                        setOversightSearch('');
                                        setOversightStartDate('');
                                        setOversightEndDate('');
                                        setOversightHasAttachments(false);
                                        setOversightPage(1);
                                        loadOversightConversations({ search: '', startDate: '', endDate: '', hasAttachments: false, page: 1 });
                                    }}
                                    style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Conversations List */}
                    <div className="msgr-conv-list" style={{ padding: '8px 12px' }}>
                        {oversightLoading ? (
                            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                Loading conversations...
                            </div>
                        ) : oversightConvs.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                No conversations match criteria.
                            </div>
                        ) : (
                            oversightConvs.map(conv => {
                                const isSelected = selectedOversightConv?._id === conv._id;
                                const title = getOversightTitle(conv);
                                const lastMsg = conv.lastMessage;
                                const lastSnippet = lastMsg?.text || (lastMsg?.fileName ? `📎 ${lastMsg.fileName}` : 'No messages');
                                const lastTime = conv.updatedAt ? new Date(conv.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';

                                return (
                                    <div
                                        key={conv._id}
                                        className={`msgr-conv-item ${isSelected ? 'msgr-active' : ''}`}
                                        onClick={() => {
                                            setSelectedOversightConv(conv);
                                            loadOversightConversationMessages(conv._id);
                                        }}
                                        style={{ padding: '10px 12px' }}
                                    >
                                        <div className="msgr-avatar" style={{ width: 36, height: 36, fontSize: '0.9rem', flexShrink: 0 }}>
                                            {conv.isGroup ? <FiUsers /> : (title[0] || 'C')}
                                        </div>
                                        <div className="msgr-conv-info" style={{ overflow: 'hidden' }}>
                                            <div className="msgr-conv-name-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span className="msgr-conv-name" style={{ fontSize: '0.86rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '190px' }} title={title}>
                                                    {title}
                                                </span>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                                                    {lastTime}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px' }}>
                                                    {lastSnippet}
                                                </span>
                                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                                    {conv.hasAttachment && (
                                                        <FiPaperclip size={12} style={{ color: 'var(--accent-primary)' }} title="Has attachments" />
                                                    )}
                                                    <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: 8, background: 'rgba(0,0,0,0.06)', color: 'var(--text-secondary)' }}>
                                                        {conv.messageCount || 0}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Pagination Bar */}
                    <div className="msgr-oversight-pagination">
                        <span>Page {oversightPagination.page} of {oversightPagination.totalPages} ({oversightPagination.total})</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button
                                className="btn btn-xs btn-outline"
                                disabled={oversightPagination.page <= 1}
                                onClick={() => {
                                    const prev = oversightPagination.page - 1;
                                    setOversightPage(prev);
                                    loadOversightConversations({ page: prev });
                                }}
                            >
                                Prev
                            </button>
                            <button
                                className="btn btn-xs btn-outline"
                                disabled={!oversightPagination.hasMore}
                                onClick={() => {
                                    const next = oversightPagination.page + 1;
                                    setOversightPage(next);
                                    loadOversightConversations({ page: next });
                                }}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── PANE 2: Read-Only Transcript ─────────────────── */}
                <div className="msgr-oversight-transcript-pane">
                    {!selectedOversightConv ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', padding: 32, textAlign: 'center' }}>
                            <FiShield size={44} style={{ color: 'var(--accent-primary)', opacity: 0.35, marginBottom: 16 }} />
                            <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)' }}>Select a Conversation</h3>
                            <p style={{ maxWidth: 360, fontSize: '0.85rem', marginTop: 8 }}>
                                Choose a conversation from the left to inspect the message transcript, participants, and media files.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Compliance Audit Warning Banner */}
                            <div className="msgr-oversight-audit-banner">
                                <FiAlertTriangle size={15} style={{ flexShrink: 0 }} />
                                <span>
                                    <strong>Super Admin Oversight (Read-Only):</strong> Every message view is recorded in the compliance Audit Log with your admin ID and IP address.
                                </span>
                            </div>

                            {/* Header */}
                            <div className="msgr-window-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ overflow: 'hidden' }}>
                                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {getOversightTitle(selectedOversightConv)}
                                    </h3>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {oversightTotalMessages} messages • Created {new Date(selectedOversightConv.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <button
                                        className="btn btn-sm btn-outline"
                                        onClick={() => handleExport(selectedOversightConv._id)}
                                        style={{ fontSize: '0.75rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                                        title="Export Conversation to PDF"
                                    >
                                        <FiDownload size={13} /> Export PDF
                                    </button>
                                    <button
                                        className="btn btn-sm btn-outline"
                                        onClick={() => loadOversightConversationMessages(selectedOversightConv._id)}
                                        style={{ fontSize: '0.75rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                                        title="Refresh Messages"
                                    >
                                        <FiRefreshCw size={13} className={oversightMsgsLoading ? 'spin' : ''} />
                                    </button>
                                </div>
                            </div>

                            {/* Transcript Messages Feed */}
                            <div className="msgr-messages-container" style={{ padding: '20px 24px' }}>
                                {oversightMsgsLoading && oversightMessages.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                                        Loading messages...
                                    </div>
                                ) : oversightMessages.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                        No messages in this conversation.
                                    </div>
                                ) : (
                                    oversightMessages.map((msg, idx) => {
                                        const prevMsg = oversightMessages[idx - 1];
                                        const showDateSep = !prevMsg || new Date(prevMsg.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();
                                        const senderName = msg.sender?.name || 'Unknown';
                                        const senderEmpId = msg.sender?.id ? ` (${msg.sender.id})` : '';
                                        const isMine = isMyMessage(msg);

                                        return (
                                            <div key={msg._id || idx}>
                                                {showDateSep && (
                                                    <div style={{ textAlign: 'center', margin: '14px 0 8px' }}>
                                                        <span style={{ fontSize: '0.72rem', padding: '2px 10px', background: 'rgba(0,0,0,0.05)', borderRadius: 10, color: 'var(--text-muted)' }}>
                                                            {formatDateSeparator(msg.createdAt)}
                                                        </span>
                                                    </div>
                                                )}

                                                <div className={`msgr-msg-wrapper ${isMine ? 'msgr-sent' : 'msgr-received'}`} style={{ marginBottom: 10 }}>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2, padding: '0 4px' }}>
                                                        <strong>{senderName}</strong>{senderEmpId} • {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>

                                                    <div className="msgr-msg-bubble">
                                                        {msg.text && (
                                                            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                                                <LinkifiedText text={msg.text} />
                                                            </div>
                                                        )}

                                                        {/* Media: Image */}
                                                        {msg.fileUrl && (msg.fileType === 'image' || (msg.mimeType && msg.mimeType.startsWith('image/')) || (msg.fileName && /\.(jpg|jpeg|png|gif|webp)$/i.test(msg.fileName))) && (
                                                            <div style={{ marginTop: msg.text ? 8 : 0, cursor: 'pointer' }} onClick={() => setLightboxImage({ url: msg.fileUrl, name: msg.fileName })}>
                                                                <img
                                                                    src={msg.fileUrl}
                                                                    alt={msg.fileName || 'Image'}
                                                                    style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 8, display: 'block' }}
                                                                />
                                                            </div>
                                                        )}

                                                        {/* Media: Video */}
                                                        {msg.fileUrl && (msg.fileType === 'video' || (msg.mimeType && msg.mimeType.startsWith('video/')) || (msg.fileName && /\.(mp4|webm|mov)$/i.test(msg.fileName))) && (
                                                            <div style={{ marginTop: msg.text ? 8 : 0 }}>
                                                                <video controls src={msg.fileUrl} className="msgr-msg-video" style={{ maxWidth: '100%', borderRadius: 8 }} />
                                                            </div>
                                                        )}

                                                        {/* Media: Audio */}
                                                        {msg.fileUrl && (msg.fileType === 'audio' || (msg.mimeType && msg.mimeType.startsWith('audio/')) || (msg.fileName && /\.(mp3|wav|ogg|m4a)$/i.test(msg.fileName))) && (
                                                            <div style={{ marginTop: msg.text ? 8 : 0 }}>
                                                                <audio controls src={msg.fileUrl} className="msgr-msg-audio" />
                                                            </div>
                                                        )}

                                                        {/* Media: Generic File Card */}
                                                        {msg.fileUrl && msg.fileType !== 'image' && msg.fileType !== 'video' && msg.fileType !== 'audio' && !(msg.fileName && /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|mp3|wav|ogg|m4a)$/i.test(msg.fileName)) && (
                                                            <div style={{ marginTop: msg.text ? 8 : 0, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(0,0,0,0.04)', borderRadius: 8 }}>
                                                                <span style={{ fontSize: '1.2rem' }}>{getFileIcon(msg.fileName)}</span>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {msg.fileName || 'Attachment'}
                                                                    </div>
                                                                    {msg.fileSize && (
                                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                                            {formatFileSize(msg.fileSize)}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" download={msg.fileName} style={{ color: 'var(--accent-primary)', padding: 4 }}>
                                                                    <FiDownload size={14} />
                                                                </a>
                                                            </div>
                                                        )}

                                                        {/* Status */}
                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 4, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                                            {msg.status === 'seen' && <span style={{ color: '#38bdf8' }}>✓✓ Seen</span>}
                                                            {msg.status === 'delivered' && <span>✓✓ Delivered</span>}
                                                            {msg.status === 'sent' && <span>✓ Sent</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={oversightMessagesEndRef} />
                            </div>

                            {/* Read-Only Notice Footer */}
                            <div className="msgr-oversight-readonly-footer">
                                <FiShield size={14} style={{ color: 'var(--accent-primary)' }} />
                                <span>Super Admin Oversight is read-only. Sending messages in oversight mode is disabled.</span>
                            </div>
                        </>
                    )}
                </div>

                {/* ── PANE 3: Conversation Details & Media Panel ────── */}
                <div className="msgr-oversight-details-pane">
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FiUser size={15} style={{ color: 'var(--accent-primary)' }} />
                        <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700 }}>Details & Audit</h4>
                    </div>

                    {!selectedOversightConv ? (
                        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            Select a chat to inspect details.
                        </div>
                    ) : (
                        <>
                            {/* Participants List */}
                            <div className="msgr-oversight-section">
                                <div className="msgr-oversight-section-title">
                                    <span>Participants</span>
                                    <span>({selectedOversightConv.participants?.length || 0})</span>
                                </div>
                                {(selectedOversightConv.participants || []).map(p => (
                                    <div key={p._id || p.id} className="msgr-oversight-participant-card">
                                        <div className="msgr-avatar" style={{ width: 34, height: 34, fontSize: '0.85rem', flexShrink: 0 }}>
                                            {p.profile_image ? (
                                                <img
                                                    src={(p.profile_image.startsWith('http') || p.profile_image.startsWith('data:')) ? p.profile_image : `${API.defaults.baseURL.replace('/api', '')}${p.profile_image}`}
                                                    alt={p.name}
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                                                />
                                            ) : (p.name?.[0] || 'U')}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {p.name}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                                                ID: {p.id || 'N/A'}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {p.role} • {p.email}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Metrics */}
                            <div className="msgr-oversight-section">
                                <div className="msgr-oversight-section-title">
                                    <span>Overview</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.78rem' }}>
                                    <div style={{ padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Messages</div>
                                        <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', marginTop: 2 }}>
                                            {oversightTotalMessages}
                                        </div>
                                    </div>
                                    <div style={{ padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Attachments</div>
                                        <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', marginTop: 2 }}>
                                            {oversightMediaFiles.length}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 10 }}>
                                    <div>Created: {new Date(selectedOversightConv.createdAt).toLocaleString()}</div>
                                    <div style={{ marginTop: 2 }}>Last Active: {new Date(selectedOversightConv.updatedAt).toLocaleString()}</div>
                                </div>
                            </div>

                            {/* Shared Media & Files */}
                            <div className="msgr-oversight-section" style={{ borderBottom: 'none' }}>
                                <div className="msgr-oversight-section-title">
                                    <span>Shared Media & Files</span>
                                    <span>({oversightMediaFiles.length})</span>
                                </div>
                                {oversightMediaFiles.length === 0 ? (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontStyle: 'italic' }}>
                                        No files shared in this chat.
                                    </div>
                                ) : (
                                    oversightMediaFiles.map((f, i) => (
                                        <a
                                            key={f._id || i}
                                            href={f.fileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            download={f.fileName}
                                            className="msgr-oversight-media-item"
                                            title={`Sent by ${f.sender?.name || 'Unknown'}`}
                                        >
                                            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>
                                                {getFileIcon(f.fileName)}
                                            </span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {f.fileName || 'File'}
                                                </div>
                                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                                    {f.fileSize ? formatFileSize(f.fileSize) : ''} • {new Date(f.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                                </div>
                                            </div>
                                            <FiDownload size={13} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                                        </a>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    }

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
                                className="btn btn-sm btn-primary"
                                style={{ flex: 1, fontSize: '0.75rem', padding: '4px 8px' }}
                                onClick={() => setViewOversight(false)}
                            >
                                My Chats
                            </button>
                            <button
                                className="btn btn-sm btn-outline"
                                style={{ flex: 1, fontSize: '0.75rem', padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                                onClick={() => setViewOversight(true)}
                            >
                                <FiShield size={12} /> All (Monitor)
                            </button>
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
                            No active chats. Start one!
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

                        <div
                            className="msgr-messages-container"
                            ref={scrollContainerRef}
                            onScroll={handleScroll}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            style={{ position: 'relative' }}
                        >
                            {isDragging && (
                                <div className="msgr-dropzone-overlay">
                                    <FiUploadCloud size={48} />
                                    <span>Drop files here to upload to conversation</span>
                                </div>
                            )}
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
                                                        return (
                                                            <img
                                                                src={fullUrl}
                                                                className="msgr-msg-file"
                                                                alt={displayName}
                                                                onClick={() => setLightboxImage({ src: fullUrl, fileName: displayName })}
                                                                title="Click to expand"
                                                            />
                                                        );
                                                    } else if (msg.fileType === 'video') {
                                                        return <video src={fullUrl} className="msgr-msg-video" controls preload="metadata" />;
                                                    } else if (msg.fileType === 'audio') {
                                                        return (
                                                            <div className="msgr-audio-player">
                                                                <FiMusic style={{ marginRight: 10, fontSize: '1.2rem', color: isMe ? '#fff' : 'var(--accent-primary)' }} />
                                                                <audio src={fullUrl} controls preload="metadata" style={{ height: 32 }} />
                                                            </div>
                                                        );
                                                    } else {
                                                        return (
                                                            <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="msgr-file-link">
                                                                <div className="msgr-file-icon-box" style={{ background: isMe ? 'rgba(255,255,255,0.2)' : 'var(--accent-primary)' }}>
                                                                    {getFileIcon(displayName)}
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

                                                {msg.text && (
                                                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                                        <LinkifiedText text={msg.text} />
                                                    </div>
                                                )}

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
                                {pendingFiles.length > 0 && (
                                    <div className="msgr-pending-uploads">
                                        {pendingFiles.map(item => (
                                            <div key={item.id} className="msgr-upload-item">
                                                <div style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center' }}>
                                                    {getFileIcon(item.name)}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                                        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                                                            {item.name}
                                                        </span>
                                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                            {item.size > 1024 * 1024 ? (item.size / (1024 * 1024)).toFixed(1) + ' MB' : (item.size / 1024).toFixed(0) + ' KB'}
                                                            {item.status === 'uploading' && ` • ${item.progress}%`}
                                                            {item.status === 'failed' && ` • Failed`}
                                                        </span>
                                                    </div>
                                                    {item.status === 'uploading' && (
                                                        <div className="msgr-upload-progress-track">
                                                            <div className="msgr-upload-progress-fill" style={{ width: `${item.progress}%` }} />
                                                        </div>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removePendingFile(item.id)}
                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                                    title="Remove / Cancel upload"
                                                >
                                                    <FiX size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <form className="msgr-input-area" onSubmit={handleSend}>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        style={{ display: 'none' }}
                                        multiple
                                        onChange={handleFileSelect}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-icon btn-sm"
                                        onClick={() => fileInputRef.current?.click()}
                                        title="Attach any file (Documents, Images, Audio, Video, Archives)"
                                        style={{ marginRight: 4, color: pendingFiles.length > 0 ? 'var(--accent-primary)' : 'var(--text-muted)' }}
                                    >
                                        <FiPaperclip size={18} />
                                    </button>

                                    <div className="msgr-input-wrapper">
                                        <textarea
                                            className="msgr-main-input"
                                            placeholder="Type a message or paste files... (Enter to send, Shift+Enter for new line)"
                                            value={inputText}
                                            rows={1}
                                            onChange={e => {
                                                setInputText(e.target.value);
                                                e.target.style.height = 'auto';
                                                e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                                            }}
                                            onKeyDown={handleKeyDown}
                                            onPaste={handlePaste}
                                            style={{ maxHeight: 100, resize: 'none' }}
                                        />
                                    </div>

                                    <button
                                        className="msgr-send-btn"
                                        type="submit"
                                        disabled={(!inputText.trim() && pendingFiles.length === 0) || sending}
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

            {lightboxImage && (
                <ImageLightbox
                    src={lightboxImage.src}
                    fileName={lightboxImage.fileName}
                    onClose={() => setLightboxImage(null)}
                />
            )}
        </div>
    );
}
