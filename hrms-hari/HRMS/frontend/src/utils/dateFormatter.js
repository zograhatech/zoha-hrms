export const formatDate = (dateString) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '—';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
};

export const formatISTTime = (dateInput) => {
    if (!dateInput) return '—';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '—';
    const istTime = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
    const hh = String(istTime.getUTCHours()).padStart(2, '0');
    const mm = String(istTime.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
};

export const formatWorkedHours = (value, { isHoliday = false, needsReview = false, fromMinutes = false } = {}) => {
    if (isHoliday || needsReview) return '—';
    if (value == null || value === '') return '—';
    const totalMinutes = fromMinutes ? Math.round(Number(value) || 0) : Math.round((Number(value) || 0) * 60);
    if (isNaN(totalMinutes) || totalMinutes < 0) return '00:00';
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};
