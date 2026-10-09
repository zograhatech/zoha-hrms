import { useState, useRef, useEffect } from 'react';
import { FiCalendar, FiChevronLeft, FiChevronRight, FiX } from 'react-icons/fi';

const CustomDatePicker = ({ selectedDate, onChange, label }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [viewDate, setViewDate] = useState(selectedDate ? new Date(selectedDate) : new Date());
    const containerRef = useRef(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const formatDate = (date) => {
        if (!date) return '';
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    };

    const handleDateSelect = (day) => {
        const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
        onChange(newDate.toISOString().split('T')[0]);
        setIsOpen(false);
    };

    const changeMonth = (offset) => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1));
    };

    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();
    const monthName = viewDate.toLocaleString('default', { month: 'long' });
    const year = viewDate.getFullYear();

    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    const isSelected = (day) => {
        if (!selectedDate || !day) return false;
        const d = new Date(selectedDate);
        return d.getDate() === day && d.getMonth() === viewDate.getMonth() && d.getFullYear() === viewDate.getFullYear();
    };

    const isToday = (day) => {
        const today = new Date();
        return day === today.getDate() && viewDate.getMonth() === today.getMonth() && viewDate.getFullYear() === today.getFullYear();
    };

    return (
        <div className="custom-datepicker-container" ref={containerRef}>
            {label && <label className="form-label">{label}</label>}
            <div className="datepicker-input-wrapper" onClick={() => setIsOpen(!isOpen)}>
                <input 
                    type="text" 
                    className="form-input pointer" 
                    value={formatDate(selectedDate)} 
                    placeholder="dd/mm/yyyy" 
                    readOnly 
                />
                <FiCalendar className="datepicker-icon" />
            </div>

            {isOpen && (
                <div className="datepicker-popover">
                    <div className="datepicker-header">
                        <button type="button" onClick={() => changeMonth(-1)} className="btn-icon"><FiChevronLeft /></button>
                        <div className="datepicker-title">{monthName} {year}</div>
                        <button type="button" onClick={() => changeMonth(1)} className="btn-icon"><FiChevronRight /></button>
                    </div>
                    <div className="datepicker-weekdays">
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d}>{d}</div>)}
                    </div>
                    <div className="datepicker-days">
                        {days.map((day, i) => (
                            <div 
                                key={i} 
                                className={`datepicker-day ${day ? 'clickable' : 'empty'} ${isSelected(day) ? 'selected' : ''} ${isToday(day) ? 'today' : ''}`}
                                onClick={() => day && handleDateSelect(day)}
                            >
                                {day}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomDatePicker;
