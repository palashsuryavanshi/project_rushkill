// Simple test script to check WebSocket server functionality
import WebSocket from 'ws';

console.log('Testing WebSocket server...');

// Test room creation
const testRoom = 'TEST123';
const ws = new WebSocket(`ws://localhost:3000?room=${testRoom}`);

ws.on('open', () => {
  console.log('WebSocket connection opened');
  
  // Send join message
  const joinMsg = {
    type: 'join',
    name: 'TestPlayer'
  };
  
  console.log('Sending join message:', joinMsg);
  ws.send(JSON.stringify(joinMsg));
});

ws.on('message', (data) => {
  console.log('Received message:', data.toString());
  
  try {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'joined') {
      console.log('Successfully joined room!');
      console.log('Assigned ID:', msg.id);
      console.log('Is host:', msg.self);
      
      // Close connection
      ws.close();
    } else if (msg.type === 'error') {
      console.error('Error from server:', msg.message);
      ws.close();
    }
  } catch (err) {
    console.error('Failed to parse message:', err);
    ws.close();
  }
});

ws.on('close', () => {
  console.log('WebSocket connection closed');
  process.exit(0);
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err);
  process.exit(1);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('Test timed out');
  ws.close();
  process.exit(1);
}, 10000);