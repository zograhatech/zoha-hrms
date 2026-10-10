import axios from 'axios';

const API = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL ? `${import.meta.env.VITE_API_BASE_URL}/api` : '/api',
    headers: { 'Content-Type': 'application/json' },
});

// Attach token to every request
API.interceptors.request.use((config) => {
    const token = localStorage.getItem('hrms_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// Handle 401 globally with seamless refresh
API.interceptors.response.use(
    (res) => res,
    async (err) => {
        const originalRequest = err.config;

        if (err.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            const refreshToken = localStorage.getItem('hrms_refresh_token');

            if (refreshToken) {
                try {
                    const { data } = await axios.post(`${API.defaults.baseURL}/auth/refresh`, { refreshToken });
                    localStorage.setItem('hrms_token', data.token);
                    localStorage.setItem('hrms_refresh_token', data.refreshToken);

                    // Update header and retry original request
                    originalRequest.headers.Authorization = `Bearer ${data.token}`;
                    return API(originalRequest);
                } catch {
                    // Refresh failed - flush and login
                    localStorage.removeItem('hrms_token');
                    localStorage.removeItem('hrms_refresh_token');
                    localStorage.removeItem('hrms_user');
                    window.location.href = '/login';
                }
            } else {
                window.location.href = '/login';
            }
        }
        return Promise.reject(err);
    }
);

export default API;
