const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');

// Create a transform stream to format log entries
const formatLogStream = new Transform({
  transform(chunk, encoding, callback) {
    try {
      const line = chunk.toString();
      // Try to parse as JSON first
      try {
        const parsed = JSON.parse(line);
        this.push(JSON.stringify({
          timestamp: new Date().toISOString(),
          source: 'backend',
          message: line
        }) + '\n');
      } catch {
        // If not JSON, send as plain text
        this.push(JSON.stringify({
          timestamp: new Date().toISOString(),
          source: 'backend',
          message: line
        }) + '\n');
      }
    } catch (error) {
      console.error('Error formatting log:', error);
    }
    callback();
  }
});

// Stream logs endpoint
router.get('/', (req, res) => {
  const logsPath = path.join(__dirname, '..', '..', 'logs');
  const backendLogPath = path.join(logsPath, 'backend.log');
  const frontendLogPath = path.join(logsPath, 'frontend.log');

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Create file streams
  const backendLogStream = fs.createReadStream(backendLogPath, { encoding: 'utf8' });
  const frontendLogStream = fs.createReadStream(frontendLogPath, { encoding: 'utf8' });

  // Pipe through formatter
  backendLogStream.pipe(formatLogStream).pipe(res, { end: false });

  // Handle frontend logs separately
  const frontendFormatStream = new Transform({
    transform(chunk, encoding, callback) {
      try {
        const line = chunk.toString();
        this.push(JSON.stringify({
          timestamp: new Date().toISOString(),
          source: 'frontend',
          message: line
        }) + '\n');
      } catch (error) {
        console.error('Error formatting frontend log:', error);
      }
      callback();
    }
  });

  frontendLogStream.pipe(frontendFormatStream).pipe(res, { end: false });

  // Handle client disconnect
  req.on('close', () => {
    backendLogStream.destroy();
    frontendLogStream.destroy();
  });
});

module.exports = router; 