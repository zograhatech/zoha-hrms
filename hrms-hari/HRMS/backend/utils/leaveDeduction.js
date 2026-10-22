/**
 * Pure functions for Leave Deduction and Allowance calculations.
 * No database queries or Mongoose dependencies.
 */

function round2(num) {
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Splits a date range into calendar month buckets (IST), skipping weekends and holidays.
 * @param {string} startDate 'YYYY-MM-DD'
 * @param {string} endDate 'YYYY-MM-DD'
 * @param {string[]} [holidayDates=[]] Array of 'YYYY-MM-DD' strings
 * @returns {Record<string, number>} Map of { 'YYYY-MM': dayCount }
 */
function splitLeaveByMonth(startDate, endDate, holidayDates = []) {
    if (!startDate || !endDate || typeof startDate !== 'string' || typeof endDate !== 'string') {
        return {};
    }

    const startMatch = startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const endMatch = endDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!startMatch || !endMatch) return {};

    if (startDate > endDate) {
        return {};
    }

    const holidaySet = new Set(Array.isArray(holidayDates) ? holidayDates.map(String) : []);
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);

    // Use noon UTC to avoid any DST or timezone drift during calendar iteration
    const current = new Date(Date.UTC(sy, sm - 1, sd, 12, 0, 0));
    const end = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));

    const result = {};

    while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        const dayOfWeek = current.getUTCDay(); // 0 = Sun, 6 = Sat

        // Skip Saturday (6) and Sunday (0)
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isHoliday = holidaySet.has(dateStr);

        if (!isWeekend && !isHoliday) {
            const monthKey = dateStr.slice(0, 7); // 'YYYY-MM'
            result[monthKey] = (result[monthKey] || 0) + 1;
        }

        // Advance by 1 calendar day
        current.setUTCDate(current.getUTCDate() + 1);
    }

    return result;
}

/**
 * Computes monthly salary deduction based on approved leave days beyond allowance.
 * @param {Object} params
 * @param {number} params.approvedDaysInMonth
 * @param {number} params.allowance
 * @param {number} params.baseSalary
 * @param {number} [params.divisor=30]
 * @returns {{ deductibleDays: number, deduction: number, noSalary: boolean }}
 */
function computeMonthlyDeduction({ approvedDaysInMonth = 0, allowance = 1, baseSalary, divisor = 30 }) {
    const days = Math.max(0, Number(approvedDaysInMonth) || 0);
    const allow = Math.max(0, Number(allowance) || 0);
    const deductibleDays = Math.max(0, days - allow);

    if (baseSalary == null || typeof baseSalary !== 'number' || !isFinite(baseSalary) || baseSalary <= 0) {
        return {
            deductibleDays,
            deduction: 0,
            noSalary: true
        };
    }

    const div = divisor > 0 ? divisor : 30;
    const rawDeduction = (baseSalary * deductibleDays) / div;
    const roundedDeduction = round2(rawDeduction);
    const deduction = Math.min(roundedDeduction, baseSalary);

    return {
        deductibleDays,
        deduction,
        noSalary: false
    };
}

/**
 * Computes how many days of a leave application qualify as free under monthly allowance.
 * @param {Object} params
 * @param {number} params.alreadyFreeUsedThisMonth
 * @param {number} params.allowance
 * @param {number} params.requestedDaysInMonth
 * @returns {number}
 */
function computeFreeDaysForApplication({ alreadyFreeUsedThisMonth = 0, allowance = 1, requestedDaysInMonth = 0 }) {
    const requested = Math.max(0, Number(requestedDaysInMonth) || 0);
    const allow = Math.max(0, Number(allowance) || 0);
    const used = Math.max(0, Number(alreadyFreeUsedThisMonth) || 0);

    const remainingAllowance = Math.max(0, allow - used);
    return Math.min(requested, remainingAllowance);
}

module.exports = {
    splitLeaveByMonth,
    computeMonthlyDeduction,
    computeFreeDaysForApplication,
    round2
};

