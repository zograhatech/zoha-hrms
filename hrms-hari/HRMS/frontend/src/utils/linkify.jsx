import React from 'react';

// Regex to safely identify URLs (http, https, www) and email addresses
const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s]|www\.[^\s<]+[^<.,:;"')\]\s]|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;

export function LinkifiedText({ text, style }) {
    if (!text || typeof text !== 'string') return null;

    const parts = [];
    let lastIndex = 0;
    let match;

    // Reset regex index
    URL_REGEX.lastIndex = 0;

    while ((match = URL_REGEX.exec(text)) !== null) {
        const matchStart = match.index;
        const matchText = match[0];

        // Text before the URL
        if (matchStart > lastIndex) {
            parts.push(text.substring(lastIndex, matchStart));
        }

        // Determine destination href
        let href = matchText;
        if (matchText.includes('@') && !matchText.startsWith('mailto:')) {
            href = `mailto:${matchText}`;
        } else if (matchText.toLowerCase().startsWith('www.')) {
            href = `https://${matchText}`;
        }

        parts.push(
            <a
                key={`link-${matchStart}`}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                    color: 'inherit',
                    textDecoration: 'underline',
                    textUnderlineOffset: '2px',
                    wordBreak: 'break-all',
                    fontWeight: 500,
                    cursor: 'pointer'
                }}
            >
                {matchText}
            </a>
        );

        lastIndex = matchStart + matchText.length;
    }

    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
    }

    return (
        <span
            style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
                ...style
            }}
        >
            {parts.map((p, idx) => (typeof p === 'string' ? <React.Fragment key={idx}>{p}</React.Fragment> : p))}
        </span>
    );
}

export default LinkifiedText;
