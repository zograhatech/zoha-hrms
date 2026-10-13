/**
 * Utilities for IST (Indian Standard Time, UTC+5:30) date handling.
 */

// IST is UTC + 5 hours 30 minutes (330 minutes = 19,800,000 ms)
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Converts any timestamp, Date object, or date string into an IST calendar date string (YYYY-MM-DD).
 * @param {Date|string|number} dateInput 
 * @returns {string} 'YYYY-MM-DD'
 */
function toISTDateString(dateInput) {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const istTime = new Date(d.getTime() + IST_OFFSET_MS);
    return istTime.toISOString().split('T')[0];
}

/**
 * Returns the start of the day in UTC for a given YYYY-MM-DD IST string.
 * YYYY-MM-DD 00:00:00 IST = YYYY-MM-(DD-1) 18:30:00 UTC
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {Date}
 */
function getISTDayStart(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    // UTC time corresponding to 00:00:00 IST
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - IST_OFFSET_MS);
}

/**
 * Returns the end of the day in UTC for a given YYYY-MM-DD IST string (exclusive, i.e. start of next day).
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {Date}
 */
function getISTDayEnd(dateStr) {
    const start = getISTDayStart(dateStr);
    return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Returns ISO week identifier string 'YYYY-Www' and week range [startMonday, endSunday] for a given IST date string.
 * @param {string} istDateStr 'YYYY-MM-DD'
 */
function getISOWeekInfo(istDateStr) {
    const [y, m, d] = istDateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    // Day of week: 0 (Sun) to 6 (Sat). ISO week starts on Monday (1).
    const dayOfWeek = (date.getUTCDay() + 6) % 7; // Monday = 0, Sunday = 6
    const monday = new Date(date.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
    const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000);

    const monStr = monday.toISOString().split('T')[0];
    const sunStr = sunday.toISOString().split('T')[0];

    // Compute ISO week number
    const target = new Date(date.valueOf());
    const dayNr = (date.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setUTCMonth(0, 1);
    if (target.getUTCDay() !== 4) {
        target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
    }
    const weekNum = 1 + Math.ceil((firstThursday - target) / (7 * 24 * 3600 * 1000));
    const padWeek = String(weekNum).padStart(2, '0');
    const weekYear = new Date(firstThursday).getUTCFullYear();

    return {
        key: `${weekYear}-W${padWeek}`,
        weekNum,
        weekYear,
        startDate: monStr,
        endDate: sunStr,
        label: `${monStr} to ${sunStr}`
    };
}

module.exports = {
    IST_OFFSET_MS,
    toISTDateString,
    getISTDayStart,
    getISTDayEnd,
    getISOWeekInfo
};

