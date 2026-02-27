# Personal Finance Tracker

A comprehensive web application to track income, expenses, and investments with detailed reporting and budgeting features.

Built with **Node.js + Express + PostgreSQL** for the backend and vanilla **HTML/CSS/JS** for the frontend.

## Features

### Day 1-2: Basic Functionality ✅
- **User Authentication**: Register, login, and manage profiles
- **Database Structure**: 
  - Income sources and amounts
  - Expense categories and amounts
  - Transactions with date, amount, description
- **Transaction Management**: 
  - Add, edit, and delete income/expense transactions
  - Handle negative amounts and refunds
  - Handle category deletion with existing transactions
  - Precise decimal handling using Decimal.js
- **Dashboard**: Overview with graphical representations (charts)
- **Reporting**: Monthly and yearly income vs. expenses reports
- **Budgeting**: Set budget goals for expense categories and track progress

### Day 3: Additional Features ✅
- **OAuth Integration**: Google Sign-in support
- **Notification System**: Email notifications for budget overruns (SendGrid)
- **Receipt Uploading**: Upload and store receipts for transactions
- **Multiple Currencies**: Support for 20+ currencies with real-time exchange rates

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL
- **Authentication**: JWT, Passport.js (Google OAuth)
- **Email**: Nodemailer with SendGrid
- **Frontend**: HTML5, CSS3, JavaScript, Chart.js

## Project Structure

```
├── public/                 # Frontend files
│   ├── index.html         # Main HTML
│   ├── css/style.css      # Styles
│   └── js/app.js          # Frontend JavaScript
├── src/
│   ├── config/
│   │   ├── database.js    # PostgreSQL connection
│   │   ├── migrate.js     # Database migrations
│   │   └── passport.js    # OAuth configuration
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── transactionController.js
│   │   ├── categoryController.js
│   │   ├── budgetController.js
│   │   ├── dashboardController.js
│   │   └── reportController.js
│   ├── middleware/
│   │   ├── auth.js        # JWT authentication
│   │   └── validation.js  # Input validation
│   ├── routes/
│   │   ├── auth.js
│   │   ├── transactions.js
│   │   ├── categories.js
│   │   ├── budgets.js
│   │   ├── dashboard.js
│   │   └── reports.js
│   ├── services/
│   │   ├── emailService.js
│   │   └── currencyService.js
│   └── server.js          # App entry point
├── uploads/               # Receipt uploads
├── .env.example           # Environment variables template
├── package.json
└── README.md
```

## Installation

### Prerequisites
- Node.js (v16+)
- PostgreSQL (v13+)
- npm or yarn

### Setup

1. **Clone the repository**
```bash
git clone https://github.com/your-username/FJ-BE-R2-YourName-YourCollege.git
cd FJ-BE-R2-YourName-YourCollege
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your database credentials and API keys
```

4. **Create PostgreSQL database**
```sql
CREATE DATABASE finance_tracker;
```

5. **Run database migrations**
```bash
npm run db:migrate
```

6. **Start the server**
```bash
# Development
npm run dev

# Production
npm start
```

7. **Access the application**
Open `http://localhost:3000` in your browser

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 3000) |
| `DB_HOST` | PostgreSQL host |
| `DB_PORT` | PostgreSQL port |
| `DB_NAME` | Database name |
| `DB_USER` | Database user |
| `DB_PASSWORD` | Database password |
| `JWT_SECRET` | Secret for JWT tokens |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Secret |
| `SENDGRID_API_KEY` | SendGrid API key for emails |

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update profile
- `GET /api/auth/google` - Google OAuth login

### Transactions
- `GET /api/transactions` - List transactions (with filters)
- `POST /api/transactions` - Create transaction
- `GET /api/transactions/:id` - Get transaction
- `PUT /api/transactions/:id` - Update transaction
- `DELETE /api/transactions/:id` - Delete transaction
- `POST /api/transactions/:id/receipt` - Upload receipt

### Categories
- `GET /api/categories` - List categories
- `POST /api/categories` - Create category
- `PUT /api/categories/:id` - Update category
- `DELETE /api/categories/:id` - Delete category

### Budgets
- `GET /api/budgets` - List budgets
- `POST /api/budgets` - Create budget
- `PUT /api/budgets/:id` - Update budget
- `DELETE /api/budgets/:id` - Delete budget
- `GET /api/budgets/progress` - Get budget progress

### Dashboard
- `GET /api/dashboard` - Dashboard overview
- `GET /api/dashboard/balance` - Account balance
- `GET /api/dashboard/currencies` - Supported currencies
- `GET /api/dashboard/exchange-rates` - Exchange rates

### Reports
- `GET /api/reports/monthly` - Monthly report
- `GET /api/reports/yearly` - Yearly report
- `GET /api/reports/custom` - Custom date range report
- `GET /api/reports/export` - Export as CSV

## Database Schema

### Users
- id, email, password, first_name, last_name, google_id, profile_picture, preferred_currency, email_notifications

### Categories
- id, user_id, name, type (income/expense), color, icon, is_default

### Transactions
- id, user_id, category_id, amount, currency, type, description, date, is_refund, receipt_url

### Budgets
- id, user_id, category_id, amount, currency, period, start_date, end_date, alert_threshold, alert_sent

### Notifications
- id, user_id, type, title, message, is_read

## Edge Cases Handled

1. **Negative amounts in expenses**: Treated as refunds
2. **Deleting category with transactions**: Option to move to another category or set as uncategorized
3. **Decimal precision**: Using Decimal.js for accurate financial calculations
4. **Budget alerts**: Notifications when spending exceeds threshold
5. **OAuth users**: Cannot change password if registered via Google

## License

MIT

## Author

Sarthak Mazumder
