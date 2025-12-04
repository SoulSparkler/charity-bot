#!/bin/bash

echo "🚀 Starting Charity Bot v1 Development Environment"
echo "=================================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Run this script from the charity-bot-v1 directory."
    exit 1
fi

echo "📦 Installing dependencies..."
npm install --silent

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully"
else
    echo "⚠️  Warning: npm install had issues. Trying to continue anyway..."
fi

echo "🏗️  Building TypeScript..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ TypeScript build successful"
else
    echo "❌ TypeScript build failed"
    echo "💡 Trying to run in development mode without build..."
fi

echo "🔧 Setting up environment..."
if [ ! -f ".env" ]; then
    echo "📋 Creating .env file from example..."
    cp .env.example .env
    echo "✅ Environment file created"
fi

echo "🌟 Starting development server..."
echo "📊 Dashboard will be available at: http://localhost:3000"
echo "🔗 Backend API will be available at: http://localhost:3000 (same port)"
echo ""
echo "Press Ctrl+C to stop the server"
echo "=================================================="

# Start the worker in development mode
npm run dev