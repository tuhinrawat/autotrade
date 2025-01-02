# Trading Application

A full-stack trading application that integrates with Zerodha's Kite Connect API for real-time market data and trading.

## Features

- User authentication with Kite Connect
- Real-time market data via WebSocket
- Order management
- Portfolio tracking
- Trade history
- Backtesting capabilities

## Prerequisites

- Node.js >= 18.0.0
- MongoDB >= 5.0
- Zerodha Kite Connect API credentials

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd <repository-name>
```

2. Install dependencies:
```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

3. Create a `.env` file in the backend directory with the following variables:
```env
NODE_ENV=development
PORT=8000
MONGODB_URI=mongodb://127.0.0.1:27017/trader
JWT_SECRET=your-jwt-secret
SESSION_SECRET=your-session-secret
KITE_API_KEY=your-kite-api-key
KITE_API_SECRET=your-kite-api-secret
FRONTEND_URL=http://localhost:5173
```

4. Start MongoDB:
```bash
mongod
```

5. Start the development servers:
```bash
# Start backend server
cd backend
npm run dev

# Start frontend server
cd ../frontend
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend: http://localhost:8000

## Project Structure

```
.
├── backend/
│   ├── config/         # Configuration files
│   ├── middleware/     # Express middleware
│   ├── models/         # Mongoose models
│   ├── routes/         # API routes
│   ├── services/       # Business logic
│   ├── app.js         # Express app setup
│   └── server.js      # Server entry point
└── frontend/
    ├── src/
    │   ├── components/ # React components
    │   ├── pages/      # Page components
    │   ├── services/   # API services
    │   └── store/      # State management
    └── index.html
```

## API Documentation

### Authentication

- `GET /api/auth/login` - Get Kite login URL
- `GET /api/auth/callback` - Handle Kite authentication callback
- `GET /api/auth/user` - Get authenticated user details
- `POST /api/auth/logout` - Logout user

### Orders

- `GET /api/orders` - Get all orders
- `POST /api/orders` - Place new order
- `PUT /api/orders/:orderId` - Modify order
- `DELETE /api/orders/:orderId` - Cancel order

### Market Data

- `GET /api/market/quote/:symbol` - Get quote for symbol
- `GET /api/market/ohlc/:symbol` - Get OHLC data
- `GET /api/market/depth/:symbol` - Get market depth

### WebSocket

Connect to `ws://localhost:8000/ws` for real-time market data.

Message format:
```json
{
  "type": "subscribe",
  "symbols": ["NSE:RELIANCE", "NSE:TCS"]
}
```

## Error Handling

The API uses standard HTTP status codes and returns errors in the following format:

```json
{
  "status": "error",
  "message": "Error message",
  "code": "ERROR_CODE"
}
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 