# AutoTrade - Automated Trading Platform

A full-stack trading application that integrates with Zerodha's Kite API for automated trading.

## Features

- Real-time market data using WebSocket connection
- User authentication with Zerodha OAuth
- Dashboard with account overview and market status
- Real-time balance and margin updates
- Secure API key management
- Modern React frontend with Material-UI
- Node.js backend with Express
- MongoDB database integration

## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- Zerodha Kite API credentials
- npm or yarn package manager

## Project Structure

```
.
├── backend/             # Node.js backend
│   ├── routes/         # API routes
│   ├── models/         # MongoDB models
│   ├── services/       # Business logic
│   ├── middleware/     # Express middleware
│   └── config/         # Configuration files
│
└── frontend/           # React frontend
    ├── src/
    │   ├── components/ # React components
    │   ├── pages/      # Page components
    │   ├── services/   # API services
    │   ├── store/      # Redux store
    │   └── types/      # TypeScript types
    └── public/         # Static files
```

## Setup Instructions

1. Clone the repository:
   ```bash
   git clone https://github.com/tuhinrawat/autotrade.git
   cd autotrade
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

3. Set up environment variables:
   
   Backend (.env):
   ```
   PORT=8000
   MONGODB_URI=mongodb://localhost:27017/trader
   JWT_SECRET=your_jwt_secret
   KITE_API_KEY=your_kite_api_key
   KITE_API_SECRET=your_kite_api_secret
   ```

   Frontend (.env):
   ```
   VITE_API_URL=http://localhost:8000/api
   VITE_WS_URL=ws://localhost:8000/ws
   VITE_KITE_API_KEY=your_kite_api_key
   VITE_KITE_API_SECRET=your_kite_api_secret
   ```

4. Start the development servers:
   ```bash
   # Start both servers using the script
   ./start-servers.sh
   ```

   Or start them separately:
   ```bash
   # Start backend
   cd backend
   npm run dev

   # Start frontend (in another terminal)
   cd frontend
   npm run dev
   ```

5. Access the application:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000/api

## API Documentation

### Authentication Endpoints
- `GET /api/auth/login` - Get Zerodha login URL
- `POST /api/auth/callback` - Handle Zerodha OAuth callback
- `GET /api/auth/user` - Get user profile and account details

### Market Data Endpoints
- `GET /api/market/quote/:symbol` - Get real-time quote
- `GET /api/market/ohlc/:symbol` - Get OHLC data
- `GET /api/market/status` - Get market status

### Trading Endpoints
- `POST /api/orders` - Place new order
- `GET /api/orders` - Get order history
- `GET /api/positions` - Get current positions

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Zerodha Kite API](https://kite.trade/)
- [Material-UI](https://mui.com/)
- [React](https://reactjs.org/)
- [Node.js](https://nodejs.org/) 