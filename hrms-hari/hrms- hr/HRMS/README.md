# Hari HRMS - Human Resource Management System

Hari HRMS is a high-fidelity, comprehensive Human Resource Management System built on the **MERN (MongoDB, Express, React, Node.js) Stack**. It combines consumer-grade aesthetics with heavy-duty enterprise functionality, replacing multiple third-party tools like Slack, Tally, and LMS platforms.

## 📁 Repository Overview

### [Frontend](./frontend)
A modern React application built with Vite and Vanilla CSS. Features include:
- **Employee Persona:** Profile, Attendance, Leave, Payroll, LMS, Tickets, Messages.
- **HR Persona:** Employee Lifecycle, Recruitment, Onboarding, Performance, Approvals.
- **Admin Persona:** Analytics, Dashboards, Global Settings, Asset Tracking.

### [Backend](./backend)
A robust Node.js/Express API handling data, security, and services:
- **Security:** JWT-based authentication and Role-Based Access Control (RBAC).
- **Architecture:** Controller-Route-Service pattern with Mongoose models.
- **Real-time:** Socket.io for live chat and toast notifications.
- **Services:** Multer for file uploads, Cloudinary/S3 readiness, and Zoom API.

## 🚀 Core Ecosystem

| Feature | Description | File Path (Primary) |
| --- | --- | --- |
| **Employee HCM** | Profiles, Directory, and Settings | `frontend/src/pages/employee/` |
| **Payroll & ERP** | Automated Payroll, Tally, Sales, Purchases | `admin/AccountingManagement.jsx` |
| **LMS** | Learning portal, Videos, and Quizzes | `frontend/src/pages/admin/LMSAdmin.jsx` |
| **Messenger** | Real-time organization-wide chat | `frontend/src/pages/Messages.jsx` |
| **Recruitment** | Hiring pipeline and onboarding | `frontend/src/pages/hr/RecruitmentManagement.jsx` |
| **Audits & Security**| Action logs and external verification | `backend/routes/auditRoutes.js` |

## 🛠 Local Setup

### Prerequisites
- Node.js (v18+)
- MongoDB (Local or Atlas)

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   # Both root, frontend, and backend
   npm install
   cd frontend && npm install
   cd ../backend && npm install
   ```
3. Setup environment variables (`.env`) in `backend/` and `frontend/`.
4. Run everything:
   ```bash
   # Root
   npm start
   ```

## 📜 Documentation
- [Product Knowledge - Full Scope](./Hari_HRMS_Product_Knowledge.md)
- System Architecture Design (See root `.doc` files)
