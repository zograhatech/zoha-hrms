import { useState, useEffect, useRef } from 'react';
import { FiSmile, FiSend, FiX, FiMessageSquare, FiActivity, FiZap, FiCheckCircle, FiTrash2, FiClock } from 'react-icons/fi';
import { useToast } from '../context/ToastContext';
import API from '../api/axios';

export default function FunChatbot() {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('joke');
    const [content, setContent] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const triggerRef = useRef(null);

    // Drag state
    const [position, setPosition] = useState({ x: 20, y: window.innerHeight - 80 }); // Default left side to avoid overlap
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [hasDragged, setHasDragged] = useState(false);

    // Only show on Thursdays (Day 4)
    const { showToast } = useToast();
    const [isThursday, setIsThursday] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            setPosition(prev => ({
                x: Math.min(prev.x, window.innerWidth - 60),
                y: Math.min(prev.y, window.innerHeight - 60)
            }));
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const today = new Date();
        if (today.getDay() === 4) {
             setIsThursday(true);
        } else {
             setIsThursday(false); 
        }
    }, []);

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (isOpen && !event.target.closest('.fun-chatbot-trigger') && !event.target.closest('.fun-chatbot-window')) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!content.trim()) return;

        setSubmitting(true);
        try {
            await API.post('/fun/submit', { type: activeTab, content });
            showToast('Thank you for sharing!', 'success');
            setContent('');
            setTimeout(() => {
                setIsOpen(false);
            }, 1000);
        } catch (err) {
            showToast(err.response?.data?.message || 'Submission failed.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isThursday) return null;

    // Drag Handlers
    const handlePointerDown = (e) => {
        setIsDragging(true);
        setHasDragged(false);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
        if (triggerRef.current) {
            triggerRef.current.setPointerCapture(e.pointerId);
        }
    };

    const handlePointerMove = (e) => {
        if (!isDragging) return;
        setHasDragged(true);
        
        let newX = e.clientX - dragStart.x;
        let newY = e.clientY - dragStart.y;

        newX = Math.max(20, Math.min(newX, window.innerWidth - 60));
        newY = Math.max(20, Math.min(newY, window.innerHeight - 60));

        setPosition({ x: newX, y: newY });
    };

    const handlePointerUp = (e) => {
        setIsDragging(false);
        if (triggerRef.current && triggerRef.current.hasPointerCapture(e.pointerId)) {
            triggerRef.current.releasePointerCapture(e.pointerId);
        }
    };

    const handleTriggerClick = () => {
        if (!hasDragged) {
            setIsOpen(true);
        }
    };

    return (
        <div className="fun-chatbot-container no-print" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9998 }}>
            {!isOpen ? (
                <button 
                    ref={triggerRef}
                    className="fun-chatbot-trigger"
                    title="Thursday Fun Chatbot"
                    style={{
                        position: 'absolute',
                        left: `${position.x}px`,
                        top: `${position.y}px`,
                        pointerEvents: 'auto',
                        cursor: isDragging ? 'grabbing' : 'grab',
                        touchAction: 'none'
                    }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onClick={handleTriggerClick}
                >
                    <FiSmile size={24} />
                    <span className="trigger-badge">Fun!</span>
                </button>
            ) : (
                <div 
                    className="fun-chatbot-window" 
                    style={{ 
                        pointerEvents: 'auto', 
                        // On desktop, position relative to trigger
                        // On mobile, let CSS handle it (bottom sheet)
                        ...(window.innerWidth > 768 ? {
                            position: 'absolute', 
                            bottom: `${window.innerHeight - position.y + 20}px`, 
                            left: `${position.x}px` 
                        } : {
                            position: 'fixed'
                        })
                    }}
                >
                    <div className="fun-chatbot-header">
                        <div className="flex items-center gap-8">
                            <FiSmile className="text-yellow-400" />
                            <span>Thursday Fun!</span>
                        </div>
                        <button onClick={() => setIsOpen(false)}><FiX /></button>
                    </div>

                    <div className="fun-chatbot-tabs">
                        <button 
                            className={activeTab === 'joke' ? 'active' : ''} 
                            onClick={() => setActiveTab('joke')}
                        >
                            <FiZap /> Joke
                        </button>
                        <button 
                            className={activeTab === 'idea' ? 'active' : ''} 
                            onClick={() => setActiveTab('idea')}
                        >
                            <FiActivity /> Idea
                        </button>
                        <button 
                            className={activeTab === 'suggestion' ? 'active' : ''} 
                            onClick={() => setActiveTab('suggestion')}
                        >
                            <FiMessageSquare /> Suggestion
                        </button>
                    </div>

                    <div className="fun-chatbot-body">
                        
                        <p className="fun-prompt">
                            {activeTab === 'joke' && "Got a killer joke? Make us laugh!"}
                            {activeTab === 'idea' && "What's your 'Next Big Thing' for the company?"}
                            {activeTab === 'suggestion' && "How can we make work even better?"}
                        </p>

                        <form onSubmit={handleSubmit}>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder={`Type your ${activeTab} here...`}
                                className="fun-textarea"
                                rows={4}
                            />
                            <button 
                                type="submit" 
                                className="fun-submit-btn"
                                disabled={submitting || !content.trim()}
                            >
                                {submitting ? 'Sending...' : <><FiSend /> Submit</>}
                            </button>
                        </form>
                    </div>
                    
                    <div className="fun-chatbot-footer">
                        HR will review these and share a summary on Friday!
                    </div>
                </div>
            )}
        </div>
    );
}
