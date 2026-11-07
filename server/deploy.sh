#!/bin/bash

# Deployment script for Rushkill WebSocket Relay Server
# This script builds and deploys the server to Fly.io

set -e

echo "🚀 Starting deployment of Rushkill WebSocket Relay Server..."

# Check if fly CLI is installed
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI is not installed. Please install it first:"
    echo "   curl -L https://fly.io/install.sh | sh"
    exit 1
fi

# Check if authenticated
if ! fly auth status &> /dev/null; then
    echo "❌ Not authenticated with Fly. Please run:"
    echo "   fly auth login"
    exit 1
fi

# Build the server
echo "🔨 Building the server..."
cd "$(dirname "$0")"
npm run build

# Deploy to Fly.io
echo "🛫 Deploying to Fly.io..."
fly deploy --remote-only

# Check deployment status
echo "📊 Checking deployment status..."
sleep 10
fly status

# Test the deployment
echo "🧪 Testing the deployed server..."
echo "Server URL: wss://rushkill-relay.fly.dev"
echo "To test: curl -I https://rushkill-relay.fly.dev"

echo "✅ Deployment completed successfully!"
echo "🌐 Your server is now live at wss://rushkill-relay.fly.dev"