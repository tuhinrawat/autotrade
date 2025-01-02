#!/bin/bash

# Function to check if a port is in use
check_port() {
    lsof -i :$1 >/dev/null 2>&1
    return $?
}

# Function to kill process using a port
kill_port() {
    echo "Killing process on port $1..."
    lsof -ti :$1 | xargs kill -9 2>/dev/null
}

# Kill any existing Node processes
echo "Killing existing Node.js processes..."
pkill -f node
sleep 2

# Check and clear ports if needed
if check_port 8000; then
    echo "Port 8000 is in use. Clearing..."
    kill_port 8000
    sleep 2
fi

if check_port 5173; then
    echo "Port 5173 is in use. Clearing..."
    kill_port 5173
    sleep 2
fi

# Start backend server
echo "Starting backend server..."
cd backend
npm run dev &
sleep 5  # Wait for backend to start

# Start frontend server
echo "Starting frontend server..."
cd ../frontend
npm run dev &

# Wait for both servers
wait 