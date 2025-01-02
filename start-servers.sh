#!/bin/bash

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -i :$port > /dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to kill process using a port
kill_port() {
    local port=$1
    if check_port $port; then
        echo "Port $port is in use. Killing process..."
        lsof -ti :$port | xargs kill -9
    fi
}

# Kill any existing Node.js processes
echo "Killing existing Node.js processes..."
pkill -f node

# Kill processes on specific ports
kill_port 8000  # Backend port
kill_port 5173  # Frontend port

# Wait for ports to be freed
sleep 2

# Create logs directory if it doesn't exist
echo "Setting up logs directory..."
mkdir -p backend/logs
mkdir -p logs

# Create log files if they don't exist
touch logs/backend.log
touch logs/frontend.log

# Start backend server
echo "Starting backend server..."
cd backend
npm install
NODE_ENV=development npm run dev > ../logs/backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to start
echo "Waiting for backend to start..."
sleep 5

# Check if backend is running
if ! ps -p $BACKEND_PID > /dev/null; then
    echo "Backend failed to start. Check logs/backend.log for details."
    exit 1
fi

# Start frontend server
echo "Starting frontend server..."
cd ../frontend
npm install
npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait for frontend to start
echo "Waiting for frontend to start..."
sleep 5

# Check if frontend is running
if ! ps -p $FRONTEND_PID > /dev/null; then
    echo "Frontend failed to start. Check logs/frontend.log for details."
    exit 1
fi

# Show startup status
echo "Checking server status..."
if check_port 8000; then
    echo "Backend server running on port 8000"
else
    echo "Backend server failed to start"
fi

if check_port 5173; then
    echo "Frontend server running on port 5173"
else
    echo "Frontend server failed to start"
fi

# Monitor logs
echo "Monitoring logs (press Ctrl+C to stop)..."
cd ..
tail -f logs/backend.log logs/frontend.log 