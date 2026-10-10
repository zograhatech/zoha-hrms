# Hari HRMS - Backend API

The backend for Hari HRMS is a robust Express/Node.js API that serves as the engine for all HR operations, financial bookkeeping, and real-time communications.

## 📁 Directory Structure

- **`/controllers`:** Business logic for each domain (Employees, Payroll, Tally, LMS, etc.).
- **`/models`:** MongoDB schemas for structured data across all modules.
- **`/routes`:** RESTful API endpoint definitions.
- **`/middleware`:** Authentication layers, role-authorizers, and global error handlers.
- **`/services`:** External integrations (Twilio, Zoom, Cloudinary) and complex reusable logic.
- **`/socket`:** Real-time bidirectional message and notification handling.
- **`/modules`:** Specialized standalone modules (e.g., Document Management).

## 🛡 Security & Authentication
- **Authentication:** JWT-based stateless tokens.
- **Authorization:** Granular Role-Based Access Control (RBAC) with support for `admin`, `hr_manager`, `employee`, and specialized roles like `manage_lms`.
- **Encryption:** bcrypt hashing for passwords and private data encryption where required.

## 📡 API Core Domains

| Domain | Key Route | Primary Controller |
| --- | --- | --- |
| **Authentication**| `/api/auth` | `authController.js` |
| **Employees** | `/api/employee` | `employeeController.js` |
| **Tally/Finance** | `/api/tally` | `accountingController.js` |
| **LMS** | `/api/lms` | `lmsController.js` |
| **Messenger** | `/api/chat` | `chatController.js` |
| **Documents** | `/api/documents` | `document.controller.js` |

## 🛠 Setup & Run
1. `npm install` to install dependencies.
2. Setup `.env` with:
   - `MONGO_URI`: MongoDB connection string.
   - `JWT_SECRET`: Secret for signing tokens.
   - `PORT`: Server port (default 5000).
   - `CLOUDINARY_URL` / `AWS_ACCESS_KEY`: For media storage.
3. `npm start` for production or `npm run dev` (via nodemon) for development.
