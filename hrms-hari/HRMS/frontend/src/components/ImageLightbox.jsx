import { useEffect, useState } from 'react';
import { FiX, FiDownload, FiZoomIn, FiZoomOut, FiRotateCw } from 'react-icons/fi';

export default function ImageLightbox({ src, alt, fileName, onClose }) {
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    if (!src) return null;

    const handleDownload = (e) => {
        e.stopPropagation();
        const a = document.createElement('a');
        a.href = src;
        a.download = fileName || 'image';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 999999,
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                animation: 'fadeIn 0.15s ease-out'
            }}
        >
            {/* Top Toolbar */}
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    position: 'absolute',
                    top: 16,
                    left: 24,
                    right: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    color: '#ffffff',
                    zIndex: 10
                }}
            >
                <div style={{ fontSize: '0.95rem', fontWeight: 600, maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fileName || 'Image preview'}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setZoom(z => Math.min(z + 0.25, 3)); }}
                        style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}
                        title="Zoom in"
                    >
                        <FiZoomIn size={18} />
                    </button>

                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setZoom(z => Math.max(z - 0.25, 0.5)); }}
                        style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}
                        title="Zoom out"
                    >
                        <FiZoomOut size={18} />
                    </button>

                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setRotation(r => (r + 90) % 360); }}
                        style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}
                        title="Rotate"
                    >
                        <FiRotateCw size={18} />
                    </button>

                    <button
                        type="button"
                        onClick={handleDownload}
                        style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                        title="Download image"
                    >
                        <FiDownload size={16} /> Download
                    </button>

                    <button
                        type="button"
                        onClick={onClose}
                        style={{ background: 'rgba(239, 68, 68, 0.8)', border: 'none', color: '#fff', padding: '8px', borderRadius: '8px', cursor: 'pointer', marginLeft: 8 }}
                        title="Close preview"
                    >
                        <FiX size={20} />
                    </button>
                </div>
            </div>

            {/* Main Image */}
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    maxHeight: '85vh',
                    maxWidth: '90vw',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden'
                }}
            >
                <img
                    src={src}
                    alt={alt || fileName || 'Full view'}
                    style={{
                        maxHeight: '80vh',
                        maxWidth: '85vw',
                        objectFit: 'contain',
                        transform: `scale(${zoom}) rotate(${rotation}deg)`,
                        transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                        borderRadius: '8px'
                    }}
                />
            </div>
        </div>
    );
}
