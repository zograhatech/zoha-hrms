/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';
import API from '../api/axios';

const BrandingContext = createContext(null);

const DEFAULT_BRANDING = {
    company_name: 'Hari Hrms',
    company_subtext: 'HR Management System',
    company_logo: '/company_logo.png',
    company_address: '',
    company_email: '',
    company_phone: '',
    company_gstin: '',
    subscription: { plan: 'free', status: 'trial', expires_at: null, max_employees: 5 }
};

export const BrandingProvider = ({ children }) => {
    // Initialize instantly from cache — no loading flash
    const [branding, setBranding] = useState(() => {
        try {
            const cached = localStorage.getItem('hrms_branding');
            if (cached) {
                const parsed = JSON.parse(cached);
                // Remove strict port check as we'll use relative paths in production
                // if (parsed.company_logo?.includes('localhost:5000')) return DEFAULT_BRANDING;
                return parsed;
            }
            return DEFAULT_BRANDING;
        } catch { return DEFAULT_BRANDING; }
    });

    const refreshBranding = async () => {
        try {
            // Fetch public branding if not logged in, full settings if logged in (for permissions/policies)
            const hasToken = !!localStorage.getItem('hrms_token');
            const endpoint = hasToken ? '/settings' : '/settings/branding';
            
            const { data } = await API.get(endpoint);
            if (data.settings?.company_name) {
                const updated = {
                    company_name: data.settings.company_name,
                    company_logo: data.settings.company_logo ? (data.settings.company_logo.startsWith('data:') ? data.settings.company_logo : `${import.meta.env.VITE_API_BASE_URL || ''}${data.settings.company_logo}`) : null,
                    company_subtext: data.settings.company_subtext || 'HR Management System',
                    company_address: data.settings.company_address || '',
                    company_email: data.settings.company_email || '',
                    company_phone: data.settings.company_phone || '',
                    company_gstin: data.settings.company_gstin || '',
                    subscription: data.settings.subscription || DEFAULT_BRANDING.subscription
                };
                setBranding(updated);
                // Also cache it so next refresh is faster
                localStorage.setItem('hrms_branding', JSON.stringify(updated));
            }
        } catch (err) {
            if (err?.response?.status !== 401) {
                console.error('Failed to fetch branding settings:', err);
            }
        }
    };

    useEffect(() => {
        refreshBranding();
    }, []);

    // Update document title and favicon dynamically
    useEffect(() => {
        if (branding.company_name) {
            document.title = branding.company_name;
        }
        if (branding.company_logo) {
            const favicon = document.getElementById('app-favicon');
            if (favicon) {
                // Use relative path or full URL if provided
                favicon.href = branding.company_logo;
            }
        }
    }, [branding]);

    return (
        <BrandingContext.Provider value={{ branding, loading: false, refreshBranding }}>
            {children}
        </BrandingContext.Provider>
    );
};

export const useBranding = () => {
    const ctx = useContext(BrandingContext);
    if (!ctx) throw new Error('useBranding must be used within BrandingProvider');
    return ctx;
};
