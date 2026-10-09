-- ============================================================
--  Hari HRMS Database Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS hrms_db;
USE hrms_db;

-- --------------------------------------------------------
-- Departments
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------
-- Employees
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
  id VARCHAR(20) PRIMARY KEY,              -- e.g. EMP001
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('employee','hr','admin') NOT NULL DEFAULT 'employee',
  department_id INT,
  phone VARCHAR(20),
  designation VARCHAR(100),
  date_of_joining DATE,
  date_of_birth DATE,
  gender ENUM('male','female','other'),
  address TEXT,
  status ENUM('active','inactive') DEFAULT 'active',
  profile_image VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

-- --------------------------------------------------------
-- Attendance
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id VARCHAR(20) NOT NULL,
  date DATE NOT NULL,
  status ENUM('present','absent','late','half-day','holiday') DEFAULT 'present',
  check_in TIME,
  check_out TIME,
  work_hours DECIMAL(4,2),
  remarks VARCHAR(255),
  UNIQUE KEY unique_emp_date (employee_id, date),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- --------------------------------------------------------
-- Leaves
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS leaves (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id VARCHAR(20) NOT NULL,
  leave_type ENUM('casual','sick','earned','maternity','paternity','unpaid') NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days INT NOT NULL DEFAULT 1,
  reason TEXT,
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  approved_by VARCHAR(20),
  approved_date TIMESTAMP,
  rejection_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES employees(id) ON DELETE SET NULL
);

-- --------------------------------------------------------
-- Leave Balance
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS leave_balance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id VARCHAR(20) NOT NULL UNIQUE,
  casual_leave INT DEFAULT 12,
  sick_leave INT DEFAULT 12,
  earned_leave INT DEFAULT 15,
  maternity_leave INT DEFAULT 90,
  paternity_leave INT DEFAULT 15,
  unpaid_leave INT DEFAULT 0,
  year INT DEFAULT 2026,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- --------------------------------------------------------
-- Payroll
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id VARCHAR(20) NOT NULL,
  month INT NOT NULL,    -- 1-12
  year INT NOT NULL,
  basic DECIMAL(10,2) NOT NULL DEFAULT 0,
  hra DECIMAL(10,2) DEFAULT 0,
  transport_allowance DECIMAL(10,2) DEFAULT 0,
  medical_allowance DECIMAL(10,2) DEFAULT 0,
  other_allowances DECIMAL(10,2) DEFAULT 0,
  pf_deduction DECIMAL(10,2) DEFAULT 0,
  tax_deduction DECIMAL(10,2) DEFAULT 0,
  other_deductions DECIMAL(10,2) DEFAULT 0,
  gross_salary DECIMAL(10,2) GENERATED ALWAYS AS (basic + hra + transport_allowance + medical_allowance + other_allowances) STORED,
  net_salary DECIMAL(10,2) GENERATED ALWAYS AS (basic + hra + transport_allowance + medical_allowance + other_allowances - pf_deduction - tax_deduction - other_deductions) STORED,
  paid_date DATE,
  status ENUM('pending','paid') DEFAULT 'paid',
  UNIQUE KEY unique_emp_month_year (employee_id, month, year),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- --------------------------------------------------------
-- Support Tickets
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_number VARCHAR(20) NOT NULL UNIQUE,
  employee_id VARCHAR(20) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  description TEXT,
  category ENUM('payroll','leave','attendance','general','it','hr') DEFAULT 'general',
  priority ENUM('low','medium','high','critical') DEFAULT 'medium',
  status ENUM('open','in-progress','resolved','closed') DEFAULT 'open',
  assigned_to VARCHAR(20),
  resolution TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES employees(id) ON DELETE SET NULL
);
