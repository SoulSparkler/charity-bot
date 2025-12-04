@echo off
echo 🚀 Starting Charity Bot v1 Development Environment
echo ==================================================

REM Check if we're in the right directory
if not exist package.json (
    echo ❌ Error: package.json not found. Run this script from the charity-bot-v1 directory.
    pause
    exit /b 1
)

echo 📦 Installing dependencies...
npm install --silent

if %errorlevel% equ 0 (
    echo ✅ Dependencies installed successfully
) else (
    echo ⚠️  Warning: npm install had issues. Trying to continue anyway...
)

echo 🏗️  Building TypeScript...
npm run build

if %errorlevel% equ 0 (
    echo ✅ TypeScript build successful
) else (
    echo ❌ TypeScript build failed
    echo 💡 Trying to run in development mode without build...
)

echo 🔧 Setting up environment...
if not exist .env (
    echo 📋 Creating .env file from example...
    copy .env.example .env
    echo ✅ Environment file created
)

echo 🌟 Starting development server...
echo 📊 Dashboard will be available at: http://localhost:3000
echo 🔗 Backend API will be available at: http://localhost:3000 (same port)
echo.
echo Press Ctrl+C to stop the server
echo ==================================================

REM Start the worker in development mode
npm run dev

pause