import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { FiCheckCircle, FiAlertCircle, FiX, FiInfo } from 'react-icons/fi';

const ToastContext = createContext();

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const showToast = useCallback((message, type = 'success', duration = 4000) => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts(prev => [...prev, { id, message, type, duration }]);
        
        // Auto remove
        setTimeout(() => {
            removeToast(id);
        }, duration);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="toast-container">
                {toasts.map(toast => (
                    <ToastItem 
                        key={toast.id} 
                        toast={toast} 
                        onClose={() => removeToast(toast.id)} 
                    />
                ))}
            </div>
        </ToastContext.Provider>
    );
};

const ToastItem = ({ toast, onClose }) => {
    const [progress, setProgress] = useState(100);
    
    useEffect(() => {
        const step = 100 / (toast.duration / 10);
        const timer = setInterval(() => {
            setProgress(prev => Math.max(0, prev - step));
        }, 10);
        
        return () => clearInterval(timer);
    }, [toast.duration]);

    return (
        <div className={`toast toast-${toast.type}`}>
            <div className="toast-icon">
                {toast.type === 'success' && <FiCheckCircle />}
                {toast.type === 'error' && <FiAlertCircle />}
                {toast.type === 'info' && <FiInfo />}
            </div>
            <div className="toast-message">{toast.message}</div>
            <button className="toast-close" onClick={onClose}>
                <FiX />
            </button>
            <div 
                className="toast-progress-bar" 
                style={{ width: `${progress}%`, transition: 'width 10ms linear' }} 
            />
        </div>
    );
};
