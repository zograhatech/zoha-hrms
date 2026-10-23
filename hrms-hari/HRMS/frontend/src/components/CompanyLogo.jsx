import { useState } from 'react';

export default function CompanyLogo({ size = 40, variant = 'icon', className = '', style = {} }) {
    const [hasError, setHasError] = useState(false);

    if (hasError) {
        return (
            <span className={className} style={{ fontWeight: 700, ...style }}>
                Zograha Technologies
            </span>
        );
    }

    const defaultStyle = {
        width: variant === 'full' ? 'auto' : size,
        height: size,
        maxWidth: '100%',
        objectFit: 'contain',
        ...style
    };

    return (
        <img
            src="/assets/zograha-logo.jpeg"
            alt="Zograha Technologies"
            onError={() => setHasError(true)}
            className={`company-logo ${className}`.trim()}
            style={defaultStyle}
        />
    );
}
