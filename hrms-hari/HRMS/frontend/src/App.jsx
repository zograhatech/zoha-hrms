import { lazy, Suspense } from 'react';
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BrandingProvider } from './context/BrandingContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { SocketProvider } from './context/SocketContext';

const safeLazy = (importFunc) => lazy(() => 
    importFunc().catch((error) => {
        const lastRetry = sessionStorage.getItem('lazy-retry-time');
        const now = Date.now();
        if (!lastRetry || (now - parseInt(lastRetry)) > 10000) {
            sessionStorage.setItem('lazy-retry-time', now.toString());
            window.location.reload();
        }
        return Promise.reject(error);
    })
);

// Lazy load main pages
const Login = safeLazy(() => import('./pages/Login'));
const Dashboard = safeLazy(() => import('./pages/Dashboard'));
const PublicJobApplication = safeLazy(() => import('./pages/PublicJobApplication'));
const PublicVerification = safeLazy(() => import('./pages/PublicVerification'));

import './index.css';

const PremiumLoader = () => (
  <div className="flex-center" style={{ height: '100vh', width: '100vw', background: 'var(--bg-primary)' }}>
    <div className="premium-loader-container">
      <div className="premium-spinner"></div>
      <div className="loading-text">Loading Assets</div>
    </div>
  </div>
);

const ProtectedRoute = ({ children, roles }) => {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading) return <PremiumLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) return <Navigate to="/dashboard" replace />;
  return children;
};

const AppRoutes = () => {
  const { isAuthenticated } = useAuth();
  return (
    <Suspense fallback={<PremiumLoader />}>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" /> : <Login />} />
        <Route path="/apply/:jobId" element={<PublicJobApplication />} />
        <Route path="/verify" element={<PublicVerification />} />
        <Route path="/dashboard/*" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

        <Route path="/" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
};

function App() {
  useEffect(() => {
    const handleWheel = () => {
      if (document.activeElement.type === 'number') {
        document.activeElement.blur();
      }
    };
    document.addEventListener('wheel', handleWheel);
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <SocketProvider>
              <BrandingProvider>
                <AppRoutes />
              </BrandingProvider>
            </SocketProvider>
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
