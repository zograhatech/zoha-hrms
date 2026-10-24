# Comprehensive HRMS Project Audit & New Laptop Setup Guide

**Repository Root:** `C:\Users\Asus\Desktop\Zograha\zoha-hrms`  
**Application Root:** `C:\Users\Asus\Desktop\Zograha\zoha-hrms\hrms-hari\HRMS`  
**Audit Date:** October 23, 2026  
**Auditor:** Senior Full-Stack Engineer & Repository Auditor  
**Audit Mode:** Read-Only Inspection  

---

## 1. Executive Summary

A comprehensive, non-destructive audit was performed on the `zoha-hrms` repository cloned onto a brand-new Windows laptop. 

### Key Findings
1. **Core Technology Stack:**
   - **Frontend:** React 19 (`19.2.0`), Vite 7 (`7.3.1`), React Router DOM 7 (`7.13.0`), Axios (`1.13.5`), Recharts (`3.7.0`), Socket.io Client (`4.8.3`). Single-Page Application (SPA) architecture styled with vanilla CSS and context providers.
   - **Backend:** Node.js (Express `4.21.2`), Mongoose (`8.10.1`) targeting MongoDB (`hrms_db`), Socket.io (`4.8.1`), JWT authentication, Cloudinary SDK (`2.9.0`), Web-Push (`3.6.7`), Nodemailer (`6.10.0`), PDFKit (`0.18.0`).
   - **Database:** MongoDB Atlas / Mongoose. The repository contains legacy MySQL artifacts (`schema.sql`, `seed.sql`, `setup.js`), but the active application runs exclusively on MongoDB.
2. **Missing Runtime Prerequisites on Current Machine:**
   - **Node.js and npm are currently not installed** on this Windows laptop (detected via PowerShell verification). Git (`2.56.0.windows.2`) is installed.
   - **No `.env` files exist** anywhere in the repository. All `.env` and `.env.*` files are excluded by `.gitignore` across the root, `hrms-hari`, and `HRMS` folders. Neither `.env.example` nor `.env.sample` existed prior to this audit.
3. **Deployment Topology:**
   - Deployed on **Vercel** as decoupled projects:
     - Frontend project: `hrms-hari/HRMS/frontend` with rewrite rules in `frontend/vercel.json` routing all requests to `/index.html`. Production domain: `https://hrms-delta-eight.vercel.app` (preview domain `https://zoha-hrms-cwie-git-main-zograha.vercel.app`).
     - Backend project: `hrms-hari/HRMS/backend` with rewrite rules in `backend/vercel.json` routing all requests to `api/index.js` as a Vercel Serverless Function.
   - On Vercel serverless, Socket.io and background `node-cron` scheduled jobs are automatically disabled via `process.env.VERCEL` checks. In local development, both run fully.
4. **Data Safety Warning:**
   - The script `backend/database/seed.js` includes `deleteMany({})` across **all 27 core collections**. **NEVER run `seed.js` against an existing production or staging database.**
   - Connecting locally to an existing MongoDB Atlas cluster requires whitelisting the laptop's public IP address in Atlas Network Access, without running migrations or seeds.

---

## 2. Complete Repository Folder Tree

Generated from actual repository contents (excluding `node_modules`, `.git`, build outputs):

```
zoha-hrms/
├── .gitignore
└── hrms-hari/
    ├── .gitignore
    ├── hrms- hr/
    │   └── M HRMS.pptx                      # Presentation asset left over from directory restructure
    └── HRMS/
        ├── .gitignore
        ├── .vercelignore
        ├── check_balances.js                # Maintenance script: reads leave balances
        ├── dump_settings.js                 # Maintenance script: prints raw Settings document
        ├── Hari_HRMS_Product_Knowledge.html # Product documentation (HTML)
        ├── Hari_HRMS_Product_Knowledge.md   # Product documentation (Markdown)
        ├── Hari_HRMS_Product_Knowledge.pdf  # Product documentation (PDF)
        ├── Hari_HRMS_System_Documentation.doc# System architecture specification
        ├── NEW_LAPTOP_SETUP_AUDIT.md        # This audit report
        ├── package.json                     # Monorepo root package manifest
        ├── package-lock.json                # Root npm lockfile
        ├── README.md                        # Project overview documentation
        ├── sync_balances.js                 # Maintenance script: reconciles leave balances with policy
        │
        ├── api/
        │   └── test.js                      # Standalone serverless test endpoint (legacy)
        │
        ├── backend/
        │   ├── .env.example                 # Environment template created during audit
        │   ├── .vercelignore                # Files ignored by Vercel backend build
        │   ├── migrate_roles.js             # One-time script: migrates 'admin' to 'hr_manager'
        │   ├── package.json                 # Backend package manifest
        │   ├── package-lock.json            # Backend npm lockfile
        │   ├── README.md                    # Backend architecture documentation
        │   ├── server.js                    # Core Express server & local HTTP/Socket.io entry point
        │   ├── socket.js                    # Socket.io initialization & export helper
        │   ├── vercel.json                  # Vercel serverless function routing configuration
        │   │
        │   ├── api/
        │   │   └── index.js                 # Vercel Serverless Function entry point (exports server.js)
        │   │
        │   ├── config/
        │   │   └── db.js                    # Mongoose connection manager with reconnection caching
        │   │
        │   ├── controllers/                 # Controller layer (Business logic)
        │   │   ├── announcementController.js
        │   │   ├── assetController.js
        │   │   ├── attendanceController.js
        │   │   ├── auditController.js
        │   │   ├── authController.js        # Login, refresh token, password reset, user profile
        │   │   ├── bankingController.js
        │   │   ├── conversationController.js
        │   │   ├── departmentController.js
        │   │   ├── employeeController.js
        │   │   ├── inventoryController.js
        │   │   ├── leaveController.js
        │   │   ├── lmsController.js
        │   │   ├── messageController.js
        │   │   ├── onboardingController.js
        │   │   ├── paymentController.js
        │   │   ├── payrollController.js
        │   │   ├── performanceController.js
        │   │   ├── purchaseController.js
        │   │   ├── recruitmentController.js
        │   │   ├── reportsController.js
        │   │   ├── resignationController.js
        │   │   ├── rotationShiftController.js
        │   │   ├── salesController.js
        │   │   ├── settingController.js
        │   │   ├── shiftController.js
        │   │   ├── tallyController.js
        │   │   ├── taxController.js
        │   │   ├── ticketController.js
        │   │   └── verificationController.js
        │   │
        │   ├── database/                    # Database setup and seed files
        │   │   ├── schema.sql               # Legacy MySQL table schemas (unused by active app)
        │   │   ├── seed.js                  # Destructive MongoDB seeder (WIPES ALL COLLECTIONS)
        │   │   ├── seed.sql                 # Legacy MySQL seed data (unused)
        │   │   └── setup.js                 # Legacy MySQL setup script (requires mysql2, unused)
        │   │
        │   ├── middleware/                  # HTTP Middleware
        │   │   ├── auditMiddleware.js       # Request logging and audit trail capture
        │   │   ├── auth.js                  # JWT verification & RBAC / module permission check
        │   │   ├── rateLimiter.js           # Express rate limiting
        │   │   └── subscription.js          # Subscription / feature guard middleware
        │   │
        │   ├── models/                      # Mongoose Schema Definitions (43 models)
        │   │   ├── Announcement.js
        │   │   ├── Asset.js
        │   │   ├── Attendance.js
        │   │   ├── AuditLog.js
        │   │   ├── BankAccount.js
        │   │   ├── BankTransaction.js
        │   │   ├── Conversation.js
        │   │   ├── CopilotSession.js
        │   │   ├── Customer.js
        │   │   ├── Department.js
        │   │   ├── Employee.js              # Central employee identity, credentials, salaries
        │   │   ├── Event.js
        │   │   ├── FunSubmission.js
        │   │   ├── Goal.js
        │   │   ├── Item.js
        │   │   ├── Leave.js
        │   │   ├── LeaveBalance.js
        │   │   ├── Ledger.js
        │   │   ├── LMSCategory.js
        │   │   ├── LMSCertificate.js
        │   │   ├── LMSCourse.js
        │   │   ├── LMSEnrollment.js
        │   │   ├── LMSQuiz.js
        │   │   ├── LMSSubmission.js
        │   │   ├── Message.js
        │   │   ├── Note.js
        │   │   ├── Notification.js
        │   │   ├── Onboarding.js
        │   │   ├── Payment.js
        │   │   ├── Payroll.js
        │   │   ├── Performance.js
        │   │   ├── PurchaseInvoice.js
        │   │   ├── Recruitment.js
        │   │   ├── Resignation.js
        │   │   ├── RotationShift.js
        │   │   ├── SalesInvoice.js
        │   │   ├── Setting.js               # Global configuration (leave policies, SMTP, roles)
        │   │   ├── Shift.js
        │   │   ├── StockTransaction.js
        │   │   ├── Ticket.js
        │   │   ├── Transaction.js
        │   │   ├── Vendor.js
        │   │   └── VerificationRequest.js
        │   │
        │   ├── modules/                     # Standalone feature modules
        │   │   ├── documents/
        │   │   │   ├── document.controller.js
        │   │   │   ├── document.model.js    # Document binary schema
        │   │   │   └── document.routes.js
        │   │   └── zoom/
        │   │       ├── zoom.controller.js
        │   │       ├── zoom.crypto.js       # AES-256 encryption helper
        │   │       ├── zoom.model.js        # ZoomMeeting, ZoomAppConfig, ZoomIntegration models
        │   │       ├── zoom.oauth.js        # Zoom S2S OAuth token generator
        │   │       ├── zoom.routes.js
        │   │       ├── zoom.service.js      # Zoom API meeting operations
        │   │       └── zoom.webhook.js
        │   │
        │   ├── routes/                      # Express route mountings (34 REST route files)
        │   │   ├── announcementRoutes.js
        │   │   ├── assetRoutes.js
        │   │   ├── attendanceRoutes.js
        │   │   ├── auditRoutes.js
        │   │   ├── authRoutes.js
        │   │   ├── bankingRoutes.js
        │   │   ├── chatRoutes.js
        │   │   ├── conversationRoutes.js
        │   │   ├── departmentRoutes.js
        │   │   ├── employeeRoutes.js
        │   │   ├── eventRoutes.js
        │   │   ├── funRoutes.js
        │   │   ├── inventoryRoutes.js
        │   │   ├── leaveRoutes.js
        │   │   ├── lmsRoutes.js
        │   │   ├── messageRoutes.js
        │   │   ├── noteRoutes.js
        │   │   ├── notificationRoutes.js
        │   │   ├── onboardingRoutes.js
        │   │   ├── paymentRoutes.js
        │   │   ├── payrollRoutes.js
        │   │   ├── performanceRoutes.js
        │   │   ├── purchaseRoutes.js
        │   │   ├── recruitmentRoutes.js
        │   │   ├── reportsRoutes.js
        │   │   ├── resignationRoutes.js
        │   │   ├── rotationShiftRoutes.js
        │   │   ├── salesRoutes.js
        │   │   ├── settingRoutes.js
        │   │   ├── shiftRoutes.js
        │   │   ├── tallyRoutes.js
        │   │   ├── taxRoutes.js
        │   │   ├── ticketRoutes.js
        │   │   └── verificationRoutes.js
        │   │
        │   ├── scripts/                     # Operational maintenance scripts
        │   │   ├── delete_employees.js      # Dangerous: deletes employees except ADM001/EMP001
        │   │   ├── migrate_admin.js         # Migrates admin role to hr_manager
        │   │   ├── seed_exits.js            # Seed resignation samples
        │   │   ├── update_settings.js       # Adjusts default settings record
        │   │   └── update_users.js          # Updates password hashes / roles
        │   │
        │   ├── services/                    # Background & notification services
        │   │   ├── copilotEngine.js         # AI helper stub / rules engine
        │   │   ├── notification.service.js
        │   │   └── push.service.js          # Web-push notification sender
        │   │
        │   ├── socket/
        │   │   └── chatSocket.js            # Socket.io chat room & message events
        │   │
        │   ├── uploads/                     # Static file storage folder (local fallback)
        │   │   ├── 1773300451977.pdf
        │   │   ├── 1773300571953.pdf
        │   │   └── 1773300941897.pdf
        │   │
        │   └── utils/                       # Utilities and helpers
        │       ├── cloudinary.js            # Cloudinary upload buffer stream
        │       ├── cronJobs.js              # Weekly maintenance crons
        │       ├── emailService.js          # Nodemailer SMTP dispatcher
        │       ├── reportGenerator.js       # PDFKit payroll & report generator
        │       ├── seedAccounting.js        # Seed double-entry ledger accounts
        │       └── seedAttendance.js        # Seed test attendance records
        │
        └── frontend/
            ├── .env.example                 # Environment template created during audit
            ├── .gitignore
            ├── 12.pdf                       # Sample test document
            ├── eslint.config.js             # ESLint 9 configuration
            ├── index.html                   # HTML entry point with viewport & font imports
            ├── package.json                 # Frontend package manifest
            ├── package-lock.json            # Frontend npm lockfile
            ├── README.md                    # Frontend documentation
            ├── vercel.json                  # SPA routing rewrite rule for Vercel
            ├── vite.config.js               # Vite build & dev-server configuration
            │
            ├── public/
            │   ├── company_logo.png
            │   ├── sw.js                    # Service worker for Web Push notifications
            │   └── vite.svg
            │
            └── src/
                ├── App.css                  # Global style overrides
                ├── App.jsx                  # Top-level Router, AuthProvider, and route structure
                ├── fix_css.cjs              # Developer utility script (legacy)
                ├── fix_css.py               # Developer utility script (legacy)
                ├── index.css                # Primary CSS design system and variables
                ├── main.jsx                 # React root renderer (`createRoot`)
                │
                ├── api/
                │   └── axios.js             # Axios client instance with auth & refresh token interceptors
                │
                ├── assets/
                │   └── react.svg
                │
                ├── components/              # Shared reusable UI components
                │   ├── AnnouncementBanner.jsx
                │   ├── AttendanceWidget.jsx
                │   ├── BirthdayCard.jsx
                │   ├── ChatWidget.jsx
                │   ├── CustomDatePicker.jsx
                │   ├── DateInput.jsx
                │   ├── DocumentManager.jsx
                │   ├── FunChatbot.jsx
                │   ├── ModuleGuard.jsx      # Permission guard wrapper for individual UI elements
                │   ├── MonthCalendar.jsx
                │   ├── Navbar.jsx
                │   ├── ResignationModal.jsx
                │   ├── Sidebar.jsx          # Role & permission filtered navigation menu
                │   ├── TimeInput.jsx
                │   └── WorkspaceOverview.jsx
                │
                ├── context/                 # React Context State Providers
                │   ├── AuthContext.jsx      # Authentication, user profile, token lifecycle
                │   ├── BrandingContext.jsx  # Dynamic company logo and branding
                │   ├── SocketContext.jsx    # Socket.io connection & real-time events
                │   ├── ThemeContext.jsx     # Dark / light theme toggle
                │   └── ToastContext.jsx     # Global toast notification queue
                │
                ├── pages/                   # Application page views
                │   ├── Dashboard.jsx        # Authenticated layout wrapper & sub-route definitions
                │   ├── Login.jsx            # Authentication login screen
                │   ├── Messages.css
                │   ├── Messages.jsx         # Internal company messenger UI
                │   ├── PublicJobApplication.jsx # Public job applicant submission page
                │   ├── PublicVerification.jsx   # Public certificate / credentials verification
                │   │
                │   ├── admin/               # Administrator & Management pages
                │   │   ├── AccountingManagement.jsx # Tally / Double-entry bookkeeping
                │   │   ├── AdminControl.jsx
                │   │   ├── AdminDashboard.jsx
                │   │   ├── Analytics.jsx
                │   │   ├── AssetManagement.jsx
                │   │   ├── BankingManagement.jsx
                │   │   ├── Departments.jsx
                │   │   ├── Events.jsx
                │   │   ├── InventoryManagement.jsx
                │   │   ├── LMSAdmin.jsx     # Learning management course & quiz editor
                │   │   ├── PayrollAdmin.jsx # Payroll processing & bulk slips
                │   │   ├── PurchaseManagement.jsx
                │   │   ├── RotationShift.jsx
                │   │   ├── SalesManagement.jsx
                │   │   ├── Settings.css
                │   │   ├── Settings.jsx     # System configuration & SMTP settings
                │   │   ├── ShiftRoster.jsx
                │   │   ├── TaxationManagement.jsx
                │   │   └── UserManagement.jsx
                │   │
                │   ├── employee/            # Employee Persona views
                │   │   ├── Attendance.jsx   # Check-in / check-out and monthly logs
                │   │   ├── CoursePlayer.jsx # Interactive LMS player
                │   │   ├── EmployeeDashboard.jsx # Personalized workspace view
                │   │   ├── ExitManagement.jsx
                │   │   ├── InactiveDashboard.jsx # View for suspended / deactivated staff
                │   │   ├── Leave.jsx        # Leave balance view and application form
                │   │   ├── MyLearning.jsx   # Enrolled LMS courses
                │   │   ├── Payroll.jsx      # Employee personal payslip download
                │   │   ├── Profile.jsx      # Profile details & document uploads
                │   │   └── Tickets.jsx      # Employee support tickets
                │   │
                │   ├── hr/                  # Human Resources Persona views
                │   │   ├── AllTickets.jsx
                │   │   ├── AttendanceReport.jsx
                │   │   ├── EmployeeList.jsx # Staff directory, additions, edits
                │   │   ├── ExitManagement.jsx
                │   │   ├── FunSummary.jsx
                │   │   ├── HRDashboard.jsx
                │   │   ├── LeaveApprovals.jsx
                │   │   ├── OnboardingManagement.jsx
                │   │   ├── PerformanceManagement.jsx
                │   │   └── RecruitmentManagement.jsx # Job openings & applicant tracker
                │   │
                │   └── zoom/                # Zoom Integration views
                │       ├── Zoom.css
                │       ├── ZoomDashboard.jsx# Schedule & join meetings
                │       └── ZoomSettings.jsx # Enter Zoom credentials
                │
                └── utils/
                    ├── dateFormatter.js     # Date formatting utilities
                    └── pushHelper.js        # Service Worker & VAPID registration utility
```

---

## 3. Frontend Architecture & Dependencies

### Architecture Overview
- **Framework & Bundler:** React 19 SPA bundled by Vite 7.
- **Entry Points:** `frontend/index.html` mounts `frontend/src/main.jsx`, which renders `frontend/src/App.jsx`.
- **State & Context Architecture:**
  1. `AuthProvider` (`frontend/src/context/AuthContext.jsx`): Initializes state synchronously from `localStorage` (`hrms_user`, `hrms_token`, `hrms_refresh_token`). Automatically runs token refresh on 401 response via Axios interceptors.
  2. `SocketProvider` (`frontend/src/context/SocketContext.jsx`): Connects to `VITE_API_BASE_URL` or `window.location.origin`. Suppressed on `*.vercel.app` domains to prevent console error flood, falling back to Web Push notifications.
  3. `ThemeProvider` (`frontend/src/context/ThemeContext.jsx`): Manages dark/light mode classes.
  4. `ToastProvider` (`frontend/src/context/ToastContext.jsx`): In-app toast alerts.
  5. `BrandingProvider` (`frontend/src/context/BrandingContext.jsx`): Fetches company branding dynamically from `/api/settings` and caches it.
- **Routing:** Handled by React Router DOM 7 (`react-router-dom`).
  - Public Routes: `/login`, `/apply/:jobId`, `/verify`.
  - Protected Shell: `/dashboard/*` wrapped by `<ProtectedRoute>`. Sub-routes lazy-loaded with a `safeLazy` retry mechanism that reloads the browser if bundle loading fails after deployment updates.
- **Role & Module Authorization:**
  - `ModuleGuard` component conditionally hides or locks UI actions based on `user.permissions`.
  - `Sidebar` dynamically computes navigation items matching the authenticated user's permissions.

### Manifest Inspection: `hrms-hari/HRMS/frontend/package.json`
- **Package Name:** `frontend` (`version: 0.0.0`, `"type": "module"`, `"private": true`)
- **Package Manager:** `npm` (associated lockfile: `frontend/package-lock.json`, version 3).
- **Scripts:**
  - `dev`: `vite` (Runs local development server; binds to `0.0.0.0` as configured in `vite.config.js`).
  - `build`: `vite build` (Compiles production assets into `dist/`).
  - `lint`: `eslint .`
  - `preview`: `vite preview`
- **Dependencies (Production):**
  - `react` (`^19.2.0`), `react-dom` (`^19.2.0`)
  - `react-router-dom` (`^7.13.0`)
  - `axios` (`^1.13.5`)
  - `recharts` (`^3.7.0`)
  - `socket.io-client` (`^4.8.3`)
  - `marked` (`^17.0.3`)
  - `react-icons` (`^5.5.0`)
  - `uuid` (`^13.0.0`)
- **Dev Dependencies:**
  - `vite` (`^7.3.1`), `@vitejs/plugin-react` (`^5.1.1`), `eslint` (`^9.39.1`), etc.

---

## 4. Backend Architecture & Dependencies

### Architecture Overview
- **Runtime & Framework:** Node.js CommonJS (`"type": "commonjs"`) using Express 4.21.2.
- **Entry Points:**
  - **Local Development:** `backend/server.js` (starts HTTP server with `server.listen(PORT, '0.0.0.0')` and initializes Socket.io on line 350).
  - **Vercel Serverless:** `backend/api/index.js` (exports the Express `app` directly for serverless request handling).
- **Security & Middleware Pipeline:**
  1. `dns.setDefaultResultOrder('ipv4first')`: Eliminates Node.js DNS resolution latency on MongoDB SRV records.
  2. `cors(corsOptions)`: Mounted first to handle HTTP `OPTIONS` pre-flight requests before DB initialization. Whitelists `http://localhost:5173`, `http://localhost:5174`, `http://localhost:3000`, `http://127.0.0.1:5173`, `FRONTEND_URL`, and any `*.vercel.app` origin.
  3. Body Parsers: `express.json()`, `express.urlencoded({ extended: true })`.
  4. Diagnostic Routes: `GET /`, `/health`, `/api/health` providing MongoDB connection state and environment audit without leaking secret values.
  5. DB Initialization Middleware: Asynchronous on-demand connection (`connectDB()`) to guarantee connection before handling API routes. Returns HTTP 503 if the database fails to initialize.
  6. Static Files: `/uploads` mapped to `backend/uploads`.
  7. API Routes: 34 mounted route handlers prefixed with `/api/...`.
  8. Global Error Handler & 404 Handler: Intercepts `MongooseServerSelectionError` and returns structured JSON responses.
  9. Scheduled Crons: Weekly cleanup job runs every Sunday at midnight (`0 0 * * 0`) for `FunSubmission` (disabled on Vercel).

### Manifest Inspection: `hrms-hari/HRMS/backend/package.json`
- **Package Name:** `backend` (`version: 1.0.0`, `"main": "server.js"`, `"type": "commonjs"`)
- **Package Manager:** `npm` (associated lockfile: `backend/package-lock.json`, version 3).
- **Scripts:**
  - `start`: `node server.js`
  - `dev`: `nodemon server.js`
  - `test`: `echo "Error: no test specified" && exit 1`
- **Dependencies (Production):**
  - `express` (`^4.21.2`), `cors` (`^2.8.5`), `dotenv` (`^16.4.7`)
  - `mongoose` (`^8.10.1`)
  - `jsonwebtoken` (`^9.0.2`), `bcryptjs` (`^2.4.3`)
  - `socket.io` (`^4.8.1`), `web-push` (`^3.6.7`)
  - `cloudinary` (`^2.9.0`), `multer` (`^1.4.5-lts.1`)
  - `nodemailer` (`^6.10.0`), `pdfkit` (`^0.18.0`), `xlsx` (`^0.18.5`)
  - `node-cron` (`^4.2.1`), `express-rate-limit` (`^7.5.0`), `express-validator` (`^7.2.1`)
  - `axios` (`^1.13.6`)
- **Dev Dependencies:** `nodemon` (`^3.1.11`)

### Monorepo Manifest Inspection: `hrms-hari/HRMS/package.json`
- **Package Name:** `hrms-monorepo` (`version: 1.0.0`)
- **Scripts:**
  - `root-install`: `npm install`
  - `frontend-install`: `cd frontend && npm install`
  - `backend-install`: `cd backend && npm install`
  - `install-all`: `npm run root-install && npm run frontend-install && npm run backend-install`
  - `build`: `npm run frontend-install && cd frontend && npm run build`
- **Discrepancy / Inconsistency Noted:**
  - The root `package.json` duplicates all 18 production backend dependencies.
  - The root README claims `npm start` runs the application, but `HRMS/package.json` has **no** `start` script defined. Local startup requires running backend and frontend individually or running custom npm scripts.

---

## 5. Database Architecture

### Active Technology: MongoDB via Mongoose
- **Connection Module:** `backend/config/db.js`
- **Target Database Name:** Explicitly set to `dbName: 'hrms_db'` in connection options.
- **Connection Variable:** Reads `process.env.MONGODB_URI` or `process.env.MONGO_URI`.
- **Connection Pooling & Caching:** Reuses `mongoose.connection` if `readyState === 1`, and caches in-flight promises if `readyState === 2`. Configured with `serverSelectionTimeoutMS: 5000` to fail fast on serverless execution.

### Models & Schema Inventory (45 Total Models)
1. **Core Human Capital Management:**
   - `Employee`: ID (e.g. `EMP001`), name, email, `password_hash`, role, `department_id`, `shift_id`, `manager_id`, `salary_details` (allowances, deductions, bank account/IFSC), `permissions` array, `refresh_tokens` array, `push_subscription` object, `status` (`active`, `inactive`, `terminated`).
   - `Department`: Department names and descriptions.
   - `Shift` & `RotationShift`: Shift scheduling, punch timings, grace periods, rotation cycles.
   - `Attendance`: Date, check-in, check-out, working hours, status (`present`, `absent`, `half_day`, `leave`), geo-location/IP logs.
   - `Leave` & `LeaveBalance`: Leave applications, approval workflows, dynamic balance tracking (`casual_leave`, `sick_leave`, `earned_leave`, `maternity_leave`, `paternity_leave`).
   - `Payroll`: Monthly salary disbursement records, earnings, deductions, payslip generation status.
   - `Performance` & `Goal`: Appraisal cycles, KPIs, manager ratings.
   - `Onboarding` & `Recruitment`: Job postings, applicants, resume URLs, onboarding checklists.
   - `Resignation`: Exit requests, notice periods, handover status, clearance approvals.
   - `Document`: Binary document storage (photos, certificates, identity proofs) in MongoDB GridFS/Buffer format.
2. **ERP, Bookkeeping & Financials:**
   - `Ledger`, `Transaction`, `BankAccount`, `BankTransaction`, `Customer`, `Vendor`, `Item`, `StockTransaction`, `PurchaseInvoice`, `SalesInvoice`, `Payment`.
3. **LMS (Learning Management System):**
   - `LMSCategory`, `LMSCourse`, `LMSEnrollment`, `LMSQuiz`, `LMSSubmission`, `LMSCertificate`.
4. **Communication, Real-Time & Utilities:**
   - `Conversation`, `Message`, `Notification`, `Ticket`, `Announcement`, `Event`, `FunSubmission`, `AuditLog`, `CopilotSession`, `VerificationRequest`.
5. **System & Integrations:**
   - `Setting`: Global settings document containing `company_name`, `company_logo`, `leave_policies`, `roles_permissions` object, and `email_settings` (SMTP host, port, username, password, from email).
   - `ZoomAppConfig`, `ZoomIntegration`, `ZoomMeeting`, `ZoomParticipant`: Zoom Server-to-Server OAuth configuration, encrypted secrets, and scheduled meetings.

### Legacy MySQL Artifacts (Unused)
- The files `backend/database/schema.sql`, `backend/database/seed.sql`, and `backend/database/setup.js` define a legacy MySQL database.
- Neither `backend/package.json` nor `HRMS/package.json` includes the `mysql2` driver required by `setup.js`.
- No controller, route, or active service connects to MySQL. **These files are legacy artifacts and can be safely ignored.**

### Seed Scripts & High-Risk Warnings
- **CRITICAL RISK:** `backend/database/seed.js` executes `Promise.all([ Department.deleteMany({}), Employee.deleteMany({}), ... ])` across 27 collections, destroying all existing records before inserting default records.
- **DO NOT RUN `node database/seed.js` against any database containing real or existing company data.**
- The operational scripts in `backend/scripts/` (`delete_employees.js`, `migrate_admin.js`, `update_settings.js`) modify live data. Only run them if specifically required for administrative tasks.

---

## 6. Complete Environment-Variable Inventory

The following table documents every environment variable inspected in the codebase:

| Variable | Used By | Purpose | Required? | Safe Placeholder | Source to Obtain Value |
|---|---|---|---|---|---|
| `MONGODB_URI` / `MONGO_URI` | `backend/config/db.js`, `backend/server.js`, `backend/database/seed.js`, root maintenance scripts | Connection URI string to the MongoDB Atlas cluster or local database (`hrms_db`). | **YES** | `mongodb+srv://<user>:<password>@cluster0.abcde.mongodb.net/hrms_db?retryWrites=true&w=majority` | MongoDB Atlas Console -> Connect -> Drivers, or local MongoDB instance. |
| `PORT` | `backend/server.js`, `backend/utils/emailService.js` | HTTP port on which the Express server listens locally. | Optional (Defaults to `5000` in server, `5001` in emailService) | `5000` | Local development preference. |
| `NODE_ENV` | `backend/server.js`, `backend/utils/emailService.js` | Specifies runtime mode (`development` vs `production`). | Optional (Defaults to `development`) | `development` | Developer environment setting. |
| `JWT_SECRET` | `backend/server.js`, `backend/controllers/authController.js`, `backend/middleware/auth.js` | Secret key used to sign and verify 15-minute access JWT tokens. | **YES in Production** (In local dev, `server.js` provides fallback `'dev_jwt_secret_hrms_local_only'`, but setting it explicitly is recommended). | `<64-character-random-hex-string>` | Production Vercel project environment variables or generated randomly via `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `JWT_REFRESH_SECRET` | `backend/server.js`, `backend/controllers/authController.js` | Secret key used to sign and verify long-lived refresh tokens. | **YES in Production** (In local dev, `server.js` provides fallback `'dev_jwt_refresh_secret_hrms_local_only'`). | `<64-character-random-hex-string>` | Production Vercel project environment variables or generated randomly. |
| `FRONTEND_URL` | `backend/server.js`, `backend/controllers/employeeController.js` | Frontend URL added to CORS whitelist and included in employee welcome email links. | Optional (Defaults to `http://localhost:5173` in CORS whitelist; emails fallback to `https://hrms-delta-eight.vercel.app`). | `http://localhost:5173` | Local frontend origin or production domain. |
| `CLOUDINARY_CLOUD_NAME` | `backend/utils/cloudinary.js` | Cloudinary account name for uploading chat attachments, resumes, and branding images. | Optional for boot; Required for file uploads | `<your-cloud-name>` | Cloudinary Console Dashboard or Vercel backend env. |
| `CLOUDINARY_API_KEY` | `backend/utils/cloudinary.js` | Cloudinary API Key. | Optional for boot; Required for file uploads | `<your-api-key>` | Cloudinary Console Dashboard or Vercel backend env. |
| `CLOUDINARY_API_SECRET` | `backend/utils/cloudinary.js` | Cloudinary API Secret. | Optional for boot; Required for file uploads | `<your-api-secret>` | Cloudinary Console Dashboard or Vercel backend env. |
| `VAPID_PUBLIC_KEY` | `backend/services/push.service.js`, `backend/routes/notificationRoutes.js`, `backend/server.js` | Web Push public application server key (retrieved by frontend via `/api/notifications/vapid-key`). | Optional (Required only for browser push notifications) | `<base64-url-encoded-public-key>` | Generated via `npx web-push generate-vapid-keys` or Vercel backend env. |
| `VAPID_PRIVATE_KEY` | `backend/services/push.service.js`, `backend/server.js` | Web Push private key used to sign web push payloads. | Optional (Required only for browser push notifications) | `<base64-url-encoded-private-key>` | Generated via `npx web-push generate-vapid-keys` or Vercel backend env. |
| `VAPID_EMAIL` | `backend/services/push.service.js` | Subject contact email for VAPID push service. | Optional (Defaults to `mailto:admin@harihrms.com`) | `mailto:admin@example.com` | Company admin email. |
| `ZOOM_ENCRYPTION_KEY` | `backend/modules/zoom/zoom.crypto.js`, `backend/server.js` | 32-character (256-bit) encryption key for AES-256 encryption of Zoom credentials stored in DB. | Optional (Defaults to `'12345678901234567890123456789012'`) | `<32-character-random-string>` | Production Vercel backend environment variables. |
| `VERCEL` | `backend/server.js`, `backend/socket.js`, `frontend/src/context/SocketContext.jsx` | Environment flag automatically set by Vercel hosting platform. | Automatic (Do NOT set in local `.env`) | `1` (on Vercel only) | Injected automatically by Vercel platform runtime. |
| `VITE_API_BASE_URL` | `frontend/src/api/axios.js`, `frontend/src/context/SocketContext.jsx`, components | Base URL of the backend API without trailing `/api` (used by Axios and Socket.io). | **YES for Local Dev** (Without this, Axios defaults to `/api` on port 5173 which 404s because Vite has no proxy). | `http://localhost:5000` | Local backend server address (`http://localhost:5000`) or deployed backend URL. |

> [!NOTE]
> **Email (SMTP) Settings:** SMTP credentials (`mail_host`, `mail_port`, `mail_username`, `mail_password`, `mail_from_email`) are **not** loaded from `.env`. They are configured dynamically by the Admin inside the application database via the `Setting` collection (`frontend/src/pages/admin/Settings.jsx`).

---

## 7. Missing Configuration Files

### 1. Missing `.env` Files
- No `.env` file exists in `hrms-hari/HRMS/backend/`.
- No `.env` file exists in `hrms-hari/HRMS/frontend/`.
- No `.env.example` templates existed prior to this audit.
- **Git Exclusions:** The root `.gitignore`, `hrms-hari/.gitignore`, and `hrms-hari/HRMS/.gitignore` all explicitly exclude `.env`, `.env.*`, and `.env.local`. Therefore, `.env` files are never tracked in Git (by design for security).

### 2. Generated `.env.example` Templates
To resolve the missing templates without fabricating credentials or breaking security, two `.env.example` files have been generated:
- `hrms-hari/HRMS/backend/.env.example`
- `hrms-hari/HRMS/frontend/.env.example`

### 3. Missing Vite Development Proxy
`hrms-hari/HRMS/frontend/vite.config.js` does not contain a proxy configuration for `/api`. If a developer launches the frontend without creating `frontend/.env` containing `VITE_API_BASE_URL=http://localhost:5000`, all API requests will default to `http://localhost:5173/api/...` and return 404 Not Found. Setting `VITE_API_BASE_URL=http://localhost:5000` in `frontend/.env` resolves this completely.

---

## 8. Local Installation & Startup Guide (PowerShell)

Follow these exact steps in Windows PowerShell to set up and start the application on the new laptop.

### Step 1: Install Node.js (Prerequisite)
Since Node.js is currently missing on this machine, install the Long Term Support (LTS) release using Windows Package Manager (`winget`):

```powershell
# In PowerShell (Run as Administrator or standard terminal):
winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
```

*After installation finishes, close and reopen VS Code / PowerShell to refresh the system PATH environment variable.*

Verify installation:
```powershell
node -v    # Expected: v20.x.x or v22.x.x
npm -v     # Expected: 10.x.x or higher
git --version # Already installed: git version 2.56.0.windows.2
```

---

### Step 2: Install Dependencies Using npm Lockfiles

Do not alter dependencies. Use `npm ci` (or `npm install`) to install exact versions declared in the lockfiles.

```powershell
# 1. Navigate to application root
cd C:\Users\Asus\Desktop\Zograha\zoha-hrms\hrms-hari\HRMS

# 2. Install root dependencies
npm install

# 3. Install backend dependencies
cd backend
npm install

# 4. Install frontend dependencies
cd ..\frontend
npm install

# Return to HRMS root
cd ..
```

---

### Step 3: Create Local Environment Files

Create the local `.env` files from the provided templates:

```powershell
# Create backend .env from template
Copy-Item "C:\Users\Asus\Desktop\Zograha\zoha-hrms\hrms-hari\HRMS\backend\.env.example" "C:\Users\Asus\Desktop\Zograha\zoha-hrms\hrms-hari\HRMS\backend\.env"

# Create frontend .env from template
Copy-Item "C:\Users\Asus\Desktop\Zograha\zoha-hrms\hrms-hari\HRMS\frontend\.env.example" "C:\Users\Asus\Desktop\Zograha\zoha-hrms\hrms-hari\HRMS\frontend\.env"
```

Now open `hrms-hari/HRMS/backend/.env` in VS Code and set:
1. `MONGODB_URI`: Insert your authorized MongoDB Atlas connection string (or local MongoDB URI `mongodb://localhost:27017/hrms_db`).
2. `JWT_SECRET` and `JWT_REFRESH_SECRET`: For local standalone testing, you may generate random strings, or copy the production secret from your Vercel project dashboard if you need to authenticate existing sessions.
3. `FRONTEND_URL`: Keep as `http://localhost:5173`.

In `hrms-hari/HRMS/frontend/.env`:
Verify `VITE_API_BASE_URL=http://localhost:5000` is present.

---

### Step 4: Verify MongoDB Connectivity

Before starting the server, verify network connectivity to MongoDB Atlas:

```powershell
# If using MongoDB Atlas, check if your new laptop IP is whitelisted
Test-NetConnection -ComputerName cluster0.abcde.mongodb.net -Port 27017
```

> [!IMPORTANT]
> If connecting to MongoDB Atlas and you encounter a timeout or `MongooseServerSelectionError`, log in to **cloud.mongodb.com**, navigate to **Security -> Network Access**, and add your new laptop's current public IP address to the IP Access List.

---

### Step 5: Start the Backend Server

Open **Terminal 1** in VS Code:

```powershell
cd C:\Users\Asus\Desktop\Zograha\zoha-hrms\hrms-hari\HRMS\backend
npm run dev
```

*Expected Terminal Output:*
```
[nodemon] starting `node server.js`
Connecting to MongoDB Atlas (hrms_db)...
✅ Mongoose connected to MongoDB Atlas (hrms_db)
🚀 Mongoose connection is open and ready
Hari HRMS API started.
Backend URL: http://localhost:5000
```

Verify backend health in browser or PowerShell:
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/health"
```

---

### Step 6: Start the Frontend Application

Open **Terminal 2** in VS Code:

```powershell
cd C:\Users\Asus\Desktop\Zograha\zoha-hrms\hrms-hari\HRMS\frontend
npm run dev
```

*Expected Terminal Output:*
```
  VITE v7.3.1  ready in ... ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://<your-ip>:5173/
```

Open your browser to `http://localhost:5173`.

---

## 9. API & Authentication Testing Checklist

Use this checklist to verify application functionality locally:

- [ ] **Health Endpoint:** `GET http://localhost:5000/api/health` returns `success: true` and `database.status: "connected"`.
- [ ] **Frontend Loading:** `http://localhost:5173/` successfully redirects to `http://localhost:5173/login`.
- [ ] **Authentication Request:** Submitting login credentials sends a `POST` request to `http://localhost:5000/api/auth/login`.
- [ ] **Token Storage:** Upon successful login, inspect browser DevTools -> Application -> Local Storage:
  - `hrms_token`: Present (JWT string).
  - `hrms_refresh_token`: Present.
  - `hrms_user`: Present (JSON object with employee role and permissions).
- [ ] **Token Interceptor:** Subsequent API requests to `/api/employees`, `/api/settings`, etc., include `Authorization: Bearer <hrms_token>`.
- [ ] **Socket.io Connection:** Browser console logs `Socket connected: <id>` and confirms room join event.
- [ ] **RBAC Module Visibility:** Verify Sidebar menu options match user role (`admin`, `hr_manager`, or `employee`).
- [ ] **CORS Verification:** Verify no `Access-Control-Allow-Origin` errors appear in the browser console.

---

## 10. Deployment Considerations

### Current Vercel Production Configuration
- **Repository Link:** The GitHub repository `zograhatech/zoha-hrms` is connected to Vercel.
- **Frontend Vercel Root Directory:** Set to `hrms-hari/HRMS/frontend`.
  - Build Command: `vite build`
  - Output Directory: `dist`
  - Rewrite Rule (`frontend/vercel.json`): Rewrites `/(.*)` to `/index.html` to support client-side routing.
  - Vercel Environment Variables Required:
    - `VITE_API_BASE_URL`: Must point to the backend Vercel production URL (e.g., `https://<backend-app>.vercel.app`).
- **Backend Vercel Root Directory:** Set to `hrms-hari/HRMS/backend`.
  - Rewrite Rule (`backend/vercel.json`): Rewrites `/(.*)` to `/api/index.js`.
  - Vercel Serverless Function: `backend/api/index.js` imports and executes `backend/server.js`.
  - Vercel Environment Variables Required:
    - `MONGODB_URI`: Production connection string to MongoDB Atlas.
    - `JWT_SECRET`: Production access token secret.
    - `JWT_REFRESH_SECRET`: Production refresh token secret.
    - `FRONTEND_URL`: Production frontend URL (`https://hrms-delta-eight.vercel.app`).
    - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
    - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`.
    - `ZOOM_ENCRYPTION_KEY`.

### Environmental Differences: Local vs Vercel Serverless
1. **WebSockets (Socket.io):**
   - Vercel serverless functions cannot hold persistent TCP connections. In production, `process.env.VERCEL` automatically disables Socket.io on both backend and frontend, falling back to Web Push notifications.
   - In local development, the full bidirectional Socket.io real-time chat and live toast notification system is operational.
2. **Cron Jobs (`node-cron`):**
   - Serverless instances spin down when inactive. Weekly crons are disabled under `process.env.VERCEL`. In local development, the cron job runs on schedule.
3. **Local Uploads Directory:**
   - In production, serverless filesystems are ephemeral (read-only). File uploads rely on Cloudinary.
   - In local development, files can also fall back to `backend/uploads`.

---

## 11. Known Issues, Risks & Recommended Next Steps

### Identified Risks & Cautions
1. **Destructive Seed Script:**
   - `backend/database/seed.js` wipes all MongoDB collections. **Never run this script on a live database.**
2. **Role Migration Inconsistency:**
   - Scripts `migrate_admin.js` and `migrate_roles.js` reflect a transition where the system shifted from `admin` to `hr_manager` as the top-tier operational role. The codebase still maintains compatibility aliases (`['admin', 'hrmanager', 'hrmanger', 'hr_manager', 'hr_manger']`), but caution should be exercised when running migration scripts.
3. **Hardcoded URLs in Codebase:**
   - `backend/server.js`, `backend/controllers/employeeController.js`, and `backend/utils/emailService.js` have fallback references to `https://hrms-delta-eight.vercel.app` and `http://10.130.39.16:5173`. While non-blocking, defining `FRONTEND_URL` in `.env` ensures full environment portability.
4. **Unused Legacy Artifacts:**
   - `hrms-hari/hrms- hr/` contains an orphaned PowerPoint presentation (`M HRMS.pptx`).
   - `backend/database/schema.sql`, `seed.sql`, and `setup.js` are legacy MySQL files.
   - `frontend/src/fix_css.cjs` and `fix_css.py` reference hardcoded paths from a previous developer workstation (`e:\MS project\...`).

### Recommended Next Steps
1. **Install Node.js LTS** via `winget install OpenJS.NodeJS.LTS`.
2. **Obtain Authorized MongoDB Atlas Credentials:** Request the project `MONGODB_URI` from your team lead / database administrator and whitelist your new laptop's IP address.
3. **Copy `.env.example` to `.env`** in `backend` and `frontend` as described in Section 8.
4. **Install Packages & Launch:** Run `npm install` in `backend` and `frontend`, then start both servers via `npm run dev`.
5. **Verify Local Login:** Log in using authorized company credentials and confirm dashboard widgets load without error.

