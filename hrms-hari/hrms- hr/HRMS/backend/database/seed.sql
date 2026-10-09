-- ============================================================
--  Hari HRMS Seed Data
-- ============================================================
USE hrms_db;

-- Departments
INSERT INTO departments (name, description) VALUES
('Human Resources', 'Manages employee relations, recruitment, and HR policies'),
('Information Technology', 'Manages IT infrastructure, software development'),
('Finance & Accounts', 'Handles payroll, budgeting, and financial reporting'),
('Operations', 'Manages day-to-day business operations'),
('Marketing', 'Handles marketing, branding, and campaigns');

-- Employees (passwords are bcrypt of: admin123, hr123, emp123)
INSERT INTO employees (id, name, email, password_hash, role, department_id, phone, designation, date_of_joining, date_of_birth, gender, address, status) VALUES
('EMP001', 'Admin User',    'admin@hari.com', '$2b$10$YYDDMFNv6YLGIb.INJDiSe.3nXt0w9lUUKmv5VcDJ3OtU.dpXLIle', 'admin',    1, '9876543210', 'System Administrator',  '2020-01-15', '1985-05-10', 'male',   '12 Main Street, Chennai', 'active'),
('EMP002', 'Priya Sharma',  'hr@hari.com',    '$2b$10$4i5hVELEqb5.Fp9B0YEhce5ICqaCW7M6fjFkS7j0C40xCYaMF3DGu', 'hr',       1, '9876543211', 'HR Manager',            '2021-03-10', '1990-08-22', 'female', '45 Park Avenue, Chennai', 'active'),
('EMP003', 'Rahul Kumar',   'emp@hari.com',   '$2b$10$w0qdtb7gVxGnvSQQv9JFD.8vbEIqcO7.1ppFbhYWsmn.XYW9hFH2q', 'employee', 2, '9876543212', 'Software Engineer',     '2022-06-01', '1995-11-15', 'male',   '78 Tech Park, Coimbatore', 'active'),
('EMP004', 'Anjali Singh',  'anjali@hari.com','$2b$10$w0qdtb7gVxGnvSQQv9JFD.8vbEIqcO7.1ppFbhYWsmn.XYW9hFH2q', 'employee', 3, '9876543213', 'Financial Analyst',     '2021-09-15', '1993-03-28', 'female', '23 Finance Nagar, Madurai', 'active'),
('EMP005', 'Vikram Patel',  'vikram@hari.com','$2b$10$w0qdtb7gVxGnvSQQv9JFD.8vbEIqcO7.1ppFbhYWsmn.XYW9hFH2q', 'employee', 4, '9876543214', 'Operations Manager',    '2020-11-20', '1988-07-14', 'male',   '56 Operations Hub, Salem', 'active'),
('EMP006', 'Meera Nair',    'meera@hari.com', '$2b$10$w0qdtb7gVxGnvSQQv9JFD.8vbEIqcO7.1ppFbhYWsmn.XYW9hFH2q', 'employee', 5, '9876543215', 'Marketing Specialist',  '2023-01-05', '1997-09-03', 'female', '90 Brand Street, Trichy',  'active'),
('EMP007', 'Arjun Menon',   'arjun@hari.com', '$2b$10$w0qdtb7gVxGnvSQQv9JFD.8vbEIqcO7.1ppFbhYWsmn.XYW9hFH2q', 'hr',       1, '9876543216', 'HR Executive',          '2022-04-18', '1994-12-20', 'male',   '34 HR Colony, Chennai',   'active');

-- Leave Balances
INSERT INTO leave_balance (employee_id, casual_leave, sick_leave, earned_leave, maternity_leave, paternity_leave, year) VALUES
('EMP001', 12, 12, 15, 0, 15, 2026),
('EMP002', 10, 11, 14, 0, 15, 2026),
('EMP003',  9, 10, 12, 0, 15, 2026),
('EMP004',  8,  9, 10, 60, 0, 2026),
('EMP005', 11, 12, 13, 0, 12, 2026),
('EMP006', 12, 12, 15, 80, 0,  2026),
('EMP007', 10, 10, 14, 0, 15, 2026);

-- Attendance for January 2026 (EMP003)
INSERT INTO attendance (employee_id, date, status, check_in, check_out, work_hours) VALUES
('EMP003', '2026-01-02', 'present', '09:02:00', '18:05:00', 9.05),
('EMP003', '2026-01-05', 'present', '09:10:00', '18:00:00', 8.83),
('EMP003', '2026-01-06', 'late',    '09:45:00', '18:00:00', 8.25),
('EMP003', '2026-01-07', 'present', '09:00:00', '18:10:00', 9.17),
('EMP003', '2026-01-08', 'present', '09:05:00', '18:05:00', 9.00),
('EMP003', '2026-01-09', 'absent',  NULL,        NULL,       0),
('EMP003', '2026-01-12', 'present', '09:00:00', '18:00:00', 9.00),
('EMP003', '2026-01-13', 'present', '09:15:00', '18:00:00', 8.75),
('EMP003', '2026-01-14', 'present', '09:00:00', '18:00:00', 9.00),
('EMP003', '2026-01-15', 'present', '09:00:00', '18:00:00', 9.00),
('EMP003', '2026-01-16', 'late',    '10:00:00', '18:00:00', 8.00),
('EMP003', '2026-01-19', 'present', '09:00:00', '18:00:00', 9.00),
('EMP003', '2026-01-20', 'present', '09:05:00', '18:00:00', 8.92),
('EMP003', '2026-01-21', 'half-day','09:00:00', '13:00:00', 4.00),
('EMP003', '2026-01-22', 'present', '09:00:00', '18:00:00', 9.00),
('EMP003', '2026-01-23', 'present', '09:00:00', '18:00:00', 9.00),
('EMP003', '2026-01-26', 'holiday', NULL,        NULL,       0),
('EMP003', '2026-01-27', 'present', '09:00:00', '18:00:00', 9.00),
('EMP003', '2026-01-28', 'present', '09:00:00', '18:00:00', 9.00),
('EMP003', '2026-01-29', 'present', '09:00:00', '18:00:00', 9.00),
('EMP003', '2026-01-30', 'present', '09:00:00', '18:00:00', 9.00);

-- Attendance for February 2026 (EMP003)
INSERT INTO attendance (employee_id, date, status, check_in, check_out, work_hours) VALUES
('EMP003', '2026-02-02', 'present', '09:00:00', '18:00:00', 9.00),
('EMP003', '2026-02-03', 'present', '09:10:00', '18:05:00', 8.92),
('EMP003', '2026-02-04', 'late',    '09:50:00', '18:00:00', 8.17),
('EMP003', '2026-02-05', 'present', '09:00:00', '18:00:00', 9.00),
('EMP003', '2026-02-06', 'present', '09:00:00', '18:00:00', 9.00),
('EMP003', '2026-02-09', 'absent',  NULL,        NULL,       0),
('EMP003', '2026-02-10', 'present', '09:00:00', '18:00:00', 9.00),
('EMP003', '2026-02-11', 'present', '09:00:00', '18:00:00', 9.00),
('EMP003', '2026-02-12', 'present', '09:00:00', '18:00:00', 9.00),
('EMP003', '2026-02-13', 'present', '09:00:00', '18:00:00', 9.00),
('EMP003', '2026-02-16', 'present', '09:00:00', '18:00:00', 9.00),
('EMP003', '2026-02-17', 'present', '09:00:00', '18:00:00', 9.00),
('EMP003', '2026-02-18', 'late',    '09:35:00', '18:00:00', 8.42),
('EMP003', '2026-02-19', 'present', '09:00:00', '18:00:00', 9.00);

-- Leaves
INSERT INTO leaves (employee_id, leave_type, start_date, end_date, total_days, reason, status, approved_by, approved_date) VALUES
('EMP003', 'casual',  '2026-01-09', '2026-01-09', 1, 'Personal work',              'approved', 'EMP002', '2026-01-08 10:00:00'),
('EMP003', 'sick',    '2026-01-21', '2026-01-21', 1, 'Not feeling well',           'approved', 'EMP002', '2026-01-21 09:00:00'),
('EMP003', 'casual',  '2026-02-09', '2026-02-09', 1, 'Family function',            'approved', 'EMP002', '2026-02-08 11:00:00'),
('EMP003', 'earned',  '2026-03-10', '2026-03-14', 5, 'Annual vacation',            'pending',  NULL,     NULL),
('EMP004', 'sick',    '2026-02-17', '2026-02-18', 2, 'Fever and cold',             'pending',  NULL,     NULL),
('EMP005', 'casual',  '2026-02-20', '2026-02-21', 2, 'Personal emergency',         'pending',  NULL,     NULL),
('EMP006', 'earned',  '2026-01-15', '2026-01-17', 3, 'Family trip',                'approved', 'EMP002', '2026-01-14 09:00:00'),
('EMP007', 'sick',    '2026-02-05', '2026-02-07', 3, 'Medical appointment',        'rejected', 'EMP002', '2026-02-04 10:00:00');

-- Payroll
INSERT INTO payroll (employee_id, month, year, basic, hra, transport_allowance, medical_allowance, other_allowances, pf_deduction, tax_deduction, other_deductions, paid_date, status) VALUES
('EMP001', 1, 2026, 80000, 32000, 3000, 1500, 5000, 9600,  8000, 0, '2026-01-31', 'paid'),
('EMP001', 2, 2026, 80000, 32000, 3000, 1500, 5000, 9600,  8000, 0, '2026-02-28', 'paid'),
('EMP002', 1, 2026, 60000, 24000, 2500, 1500, 3000, 7200,  5500, 0, '2026-01-31', 'paid'),
('EMP002', 2, 2026, 60000, 24000, 2500, 1500, 3000, 7200,  5500, 0, '2026-02-28', 'paid'),
('EMP003', 1, 2026, 45000, 18000, 2000, 1000, 2000, 5400,  3500, 0, '2026-01-31', 'paid'),
('EMP003', 2, 2026, 45000, 18000, 2000, 1000, 2000, 5400,  3500, 0, '2026-02-28', 'paid'),
('EMP004', 1, 2026, 50000, 20000, 2000, 1500, 2500, 6000,  4000, 0, '2026-01-31', 'paid'),
('EMP004', 2, 2026, 50000, 20000, 2000, 1500, 2500, 6000,  4000, 0, '2026-02-28', 'paid'),
('EMP005', 1, 2026, 55000, 22000, 2500, 1500, 2500, 6600,  5000, 0, '2026-01-31', 'paid'),
('EMP005', 2, 2026, 55000, 22000, 2500, 1500, 2500, 6600,  5000, 0, '2026-02-28', 'paid'),
('EMP006', 1, 2026, 40000, 16000, 1500, 1000, 2000, 4800,  3000, 0, '2026-01-31', 'paid'),
('EMP006', 2, 2026, 40000, 16000, 1500, 1000, 2000, 4800,  3000, 0, '2026-02-28', 'paid'),
('EMP007', 1, 2026, 48000, 19200, 2000, 1000, 2000, 5760,  3800, 0, '2026-01-31', 'paid'),
('EMP007', 2, 2026, 48000, 19200, 2000, 1000, 2000, 5760,  3800, 0, '2026-02-28', 'paid');

-- Support Tickets
INSERT INTO tickets (ticket_number, employee_id, subject, description, category, priority, status, assigned_to) VALUES
('TKT-2026-001', 'EMP003', 'Salary slip not received for December 2025', 'I have not received my December 2025 salary slip. Please check and send.', 'payroll',     'high',   'resolved', 'EMP002'),
('TKT-2026-002', 'EMP004', 'Attendance not marked on 2026-02-10',        'My attendance was not marked on 10th February 2026 even though I was present.', 'attendance', 'medium', 'open',     'EMP002'),
('TKT-2026-003', 'EMP005', 'Leave application not showing in portal',     'I applied for leave last week but it is not visible in the portal.', 'leave',       'medium', 'in-progress', 'EMP007'),
('TKT-2026-004', 'EMP006', 'Request for work from home policy document',  'Could you please share the updated WFH policy document?', 'hr',          'low',    'open',     NULL),
('TKT-2026-005', 'EMP003', 'PF contribution discrepancy',                 'My PF contribution seems incorrect for the month of January. Please review.', 'payroll', 'high', 'open', 'EMP002');
