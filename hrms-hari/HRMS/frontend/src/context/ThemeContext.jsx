/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
    // Default to light theme
    const [theme, setTheme] = useState(localStorage.getItem('hrms_theme') || 'light');

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light-theme', 'dark-theme');
        root.classList.add(`${theme}-theme`);
        localStorage.setItem('hrms_theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
};
