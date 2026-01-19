# CodeSupport - Server

A robust Node.js/Express backend API for managing custom software development projects. The server handles user authentication, project management, real-time communication, payments, and administrative operations.

## Features

### Authentication & Authorization
- 🔐 **JWT-based Authentication**: Secure token-based user sessions
- 🔑 **OAuth Integration**: Social login support (Google, GitHub, etc.)
- 👥 **Role-based Access Control**: Customer, Developer, and Admin roles
- 🛡️ **Security Middleware**: Helmet, rate limiting, XSS protection, NoSQL injection prevention

### Project Management
- 📋 **Order Management**: Create, update, and track development orders
- 💬 **Quote System**: Generate and manage project quotes
- 📄 **Contract Management**: Digital contract creation and signing
- 💳 **Invoice Generation**: Automatic invoice creation from contracts
- 📊 **Payment Tracking**: Monitor order payments and payment proofs

### Real-time Communication
- 💬 **WebSocket Support**: Socket.io for real-time messaging
- 📱 **Notifications**: Push notifications for order updates and deadlines
- 💭 **Chat System**: Direct messaging between customers and developers
- 🔔 **Deadline Reminders**: Automated email reminders for upcoming deadlines

### Developer Management
- 👨‍💻 **Developer Profiles**: Manage developer information and expertise
- 📝 **Task Assignment**: Assign development tasks to team members
- 📊 **Performance Analytics**: Track developer productivity and metrics
- 🏢 **Team Workspace**: Team collaboration and project management

### Admin Features
- 📊 **Analytics Dashboard**: Monitor platform activity, revenue, and metrics
- 👥 **User Management**: Manage customers, developers, and admins
- 💰 **Payment Management**: Track all orders and payments
- ⚙️ **Settings Management**: Platform-wide configuration
- 📈 **Reports**: Business intelligence and reporting tools

### File Management
- 📁 **File Uploads**: Handle assignments, deliverables, messages, and payment proofs
- 🎯 **QR Code Generation**: Generate and manage QR codes
- 🔒 **Secure Storage**: Organized file structure with access control

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js 5
- **Database**: MongoDB with Mongoose
- **Real-time**: Socket.io
- **Authentication**: JWT, bcryptjs
- **Security**: Helmet, Rate Limiting, XSS Protection, NoSQL Sanitization
- **Email**: Nodemailer
- **File Upload**: Multer
- **Task Scheduling**: Node-cron (for deadline reminders)
- **CORS**: Cross-Origin Resource Sharing support

## Project Structure

```
server/
├── config/                    # Configuration files
│   ├── db.js                 # Database connection
│   ├── oauth.js              # OAuth configuration
│   └── socket.js             # Socket.io setup
├── controllers/              # Route handlers
│   ├── adminController.js
│   ├── authController.js
│   ├── chatController.js
│   ├── contractController.js
│   ├── invoiceController.js
│   ├── orderController.js
│   ├── paymentController.js
│   ├── quoteController.js
│   ├── userController.js
│   └── ...
├── middleware/               # Express middleware
│   └── authMiddleware.js
├── models/                   # Mongoose schemas
│   ├── User.js
│   ├── Order.js
│   ├── Quote.js
│   ├── Contract.js
│   ├── Invoice.js
│   ├── Message.js
│   ├── Notification.js
│   └── ...
├── routes/                   # API route definitions
│   ├── authRoutes.js
│   ├── adminRoutes.js
│   ├── orderRoutes.js
│   ├── paymentRoutes.js
│   └── ...
├── services/                 # Business logic services
│   ├── emailService.js
│   ├── invoiceService.js
│   └── deadlineReminderService.js
├── uploads/                  # File upload directories
│   ├── assignments/
│   ├── deliverables/
│   ├── messages/
│   └── payment-proofs/
├── utils/                    # Utility functions
│   ├── generateToken.js
│   └── oauthService.js
├── index.js                  # Entry point
└── seeder.js                 # Database seeding script
```

## Getting Started

### Prerequisites
- Node.js 16+
- npm or yarn
- MongoDB instance (local or Atlas)

### Installation

1. Navigate to the server directory:
```bash
cd server
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with required environment variables:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/codesupport
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRATION=7d

# OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# Email Configuration
EMAIL_SERVICE=gmail
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password

# Client URL (for CORS and OAuth redirects)
CLIENT_URL=http://localhost:5173

# AWS S3 (optional, for file storage)
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_S3_BUCKET=your_bucket_name
```

### Development

Start the development server with auto-reload:
```bash
npm run dev
```

The server will run on `http://localhost:5000`

### Production

Start the production server:
```bash
npm start
```

### Database Seeding

Populate the database with initial data:
```bash
node seeder.js
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/oauth/google` - Google OAuth initiation
- `GET /api/auth/oauth/callback` - OAuth callback handler

### Orders
- `GET /api/orders` - Get all orders
- `POST /api/orders` - Create new order
- `GET /api/orders/:id` - Get order details
- `PUT /api/orders/:id` - Update order
- `DELETE /api/orders/:id` - Delete order

### Quotes
- `GET /api/quotes` - Get all quotes
- `POST /api/quotes` - Create new quote
- `GET /api/quotes/:id` - Get quote details
- `PUT /api/quotes/:id` - Update quote

### Contracts
- `GET /api/contracts` - Get all contracts
- `POST /api/contracts` - Create new contract
- `GET /api/contracts/:id` - Get contract details
- `PUT /api/contracts/:id/sign` - Sign contract

### Payments
- `GET /api/payments` - Get all payments
- `POST /api/payments` - Create payment
- `GET /api/payments/:id` - Get payment details

### Invoices
- `GET /api/invoices` - Get all invoices
- `POST /api/invoices` - Create invoice
- `GET /api/invoices/:id` - Get invoice details
- `POST /api/invoices/:id/send` - Send invoice email

### Messages
- `GET /api/messages` - Get messages
- `POST /api/messages` - Send message
- `GET /api/conversations` - Get conversations

### Admin
- `GET /api/admin/analytics` - Get analytics
- `GET /api/admin/users` - Get all users
- `PUT /api/admin/settings` - Update settings

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | 5000 |
| `MONGODB_URI` | MongoDB connection string | mongodb://localhost:27017/codesupport |
| `JWT_SECRET` | JWT signing secret | your_secret_key |
| `JWT_EXPIRATION` | JWT token expiration | 7d |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | your_id.apps.googleusercontent.com |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret | your_secret |
| `CLIENT_URL` | Frontend URL for CORS | http://localhost:5173 |
| `EMAIL_SERVICE` | Email service provider | gmail |
| `EMAIL_USER` | Email account | your_email@gmail.com |
| `EMAIL_PASSWORD` | Email password/app password | your_password |

## Database Models

### User
```
{
  _id: ObjectId,
  email: String,
  password: String (hashed),
  firstName: String,
  lastName: String,
  phone: String,
  avatar: String,
  role: String (customer/developer/admin),
  isVerified: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### Order
```
{
  _id: ObjectId,
  customerId: ObjectId,
  developerId: ObjectId,
  title: String,
  description: String,
  status: String (pending/in-progress/completed),
  deadline: Date,
  budget: Number,
  attachments: Array,
  createdAt: Date,
  updatedAt: Date
}
```

### Quote
```
{
  _id: ObjectId,
  customerId: ObjectId,
  developerId: ObjectId,
  projectTitle: String,
  description: String,
  estimatedCost: Number,
  estimatedDuration: String,
  validUntil: Date,
  status: String (draft/sent/accepted/rejected),
  createdAt: Date,
  updatedAt: Date
}
```

## Security Features

- ✅ **JWT Token-based Authentication**
- ✅ **Rate Limiting**: Prevent brute-force attacks
- ✅ **HELMET**: Secure HTTP headers
- ✅ **XSS Protection**: Input sanitization
- ✅ **NoSQL Injection Prevention**: Mongoose sanitization
- ✅ **Password Hashing**: bcryptjs
- ✅ **CORS**: Configured for frontend origin
- ✅ **HTTPS Ready**: Production-ready SSL/TLS support

## Socket.io Events

### Real-time Communication
- `message:send` - Send real-time message
- `message:receive` - Receive message
- `notification:send` - Send notification
- `order:update` - Order status update
- `contract:sign` - Contract signed notification

## Error Handling

The API uses standard HTTP status codes:
- `200 OK` - Successful request
- `201 Created` - Resource created
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Authentication failed
- `403 Forbidden` - Access denied
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

## Contributing

1. Create a feature branch
2. Commit your changes with clear messages
3. Push to the branch
4. Create a Pull Request

## License

ISC
# assignment_guide_backend
