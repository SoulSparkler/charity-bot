#!/usr/bin/env node

/**
 * Charity Bot v1 Backend Startup Script
 * This script handles the startup of the backend worker with proper error handling
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Charity Bot v1 Backend...\n');

// Check if TypeScript dependencies are available
const fs = require('fs');
const tsConfigExists = fs.existsSync('./tsconfig.json');
const srcExists = fs.existsSync('./src');

if (!tsConfigExists || !srcExists) {
  console.error('❌ Backend source files not found. Please ensure all files are present.');
  process.exit(1);
}

// Try to start with TypeScript first (preferred)
console.log('📋 Starting backend worker...');
console.log('   • Mode: Mock Database (development)');
console.log('   • Target: http://localhost:3000');
console.log('   • Dashboard: http://localhost:3001\n');

// Start the backend worker
const worker = spawn('node', ['./worker.ts'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production', USE_MOCK_KRAKEN: 'false' }
});

worker.on('error', (error) => {
  console.error('❌ Failed to start backend:', error);
  process.exit(1);
});

worker.on('exit', (code, signal) => {
  console.log(`\n🔄 Backend worker exited with code ${code}${signal ? ` and signal ${signal}` : ''}`);
  if (code !== 0) {
    console.log('\n💡 Troubleshooting tips:');
    console.log('   1. Ensure TypeScript dependencies are installed: npm install');
    console.log('   2. Check if port 3000 is available');
    console.log('   3. Verify environment variables in .env file');
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🔄 Shutting down backend...');
  worker.kill('SIGTERM');
  setTimeout(() => process.exit(0), 1000);
});

process.on('SIGTERM', () => {
  console.log('\n🔄 Received shutdown signal...');
  worker.kill('SIGTERM');
});