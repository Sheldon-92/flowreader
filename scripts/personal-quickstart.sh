#!/bin/bash

# FlowReader Personal Quick Start Script
# This script helps set up FlowReader for personal use with minimal configuration

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored messages
print_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
print_success() { echo -e "${GREEN}✅ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error() { echo -e "${RED}❌ $1${NC}"; }

echo "========================================="
echo "  FlowReader Personal Quick Start Setup  "
echo "========================================="
echo ""

# Check Node.js version
print_info "Checking Node.js version..."
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    echo "Visit: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi
print_success "Node.js $(node -v) detected"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm."
    exit 1
fi
print_success "npm $(npm -v) detected"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    print_info "Installing dependencies (this may take a few minutes)..."
    npm ci
    print_success "Dependencies installed"
else
    print_info "Dependencies already installed. Run 'npm ci' to update if needed."
fi

# Set up environment file
if [ ! -f ".env.local" ]; then
    if [ -f ".env.example" ]; then
        print_info "Creating .env.local from template..."
        cp .env.example .env.local
        print_success "Created .env.local"
        echo ""
        print_warning "IMPORTANT: You need to edit .env.local with your actual values:"
        echo ""
        echo "  Required configuration:"
        echo "  1. PUBLIC_SUPABASE_URL     - From your Supabase project"
        echo "  2. PUBLIC_SUPABASE_ANON_KEY - From your Supabase project"
        echo "  3. SUPABASE_SERVICE_ROLE_KEY - From your Supabase project"
        echo "  4. OPENAI_API_KEY          - From platform.openai.com"
        echo "  5. JWT_SECRET              - Generate a 32+ character random string"
        echo ""
        echo "  To generate a random JWT_SECRET, you can use:"
        echo "  openssl rand -base64 32"
        echo ""
        print_info "Opening .env.local in your default editor..."

        # Try to open in a text editor
        if command -v code &> /dev/null; then
            code .env.local
        elif command -v nano &> /dev/null; then
            nano .env.local
        elif command -v vim &> /dev/null; then
            vim .env.local
        else
            print_warning "Please manually edit .env.local with your configuration"
        fi

        echo ""
        read -p "Press Enter when you've updated .env.local with your values..."
    else
        print_error ".env.example not found. Cannot create .env.local"
        exit 1
    fi
else
    print_info ".env.local already exists. Skipping configuration."
fi

# Check for Supabase CLI
print_info "Checking Supabase CLI..."
if ! command -v supabase &> /dev/null; then
    print_warning "Supabase CLI not found. Installing globally..."
    npm install -g supabase
    print_success "Supabase CLI installed"
else
    print_success "Supabase CLI detected"
fi

# Offer to set up local Supabase
echo ""
read -p "Do you want to set up local Supabase for development? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Setting up local Supabase..."

    if [ ! -f "supabase/config.toml" ]; then
        supabase init
    fi

    print_info "Starting Supabase services..."
    supabase start

    print_info "Running database migrations..."
    supabase db reset

    print_success "Local Supabase setup complete"
else
    print_info "Skipping local Supabase setup. Using remote Supabase instance."
fi

# Final instructions
echo ""
echo "========================================="
echo "         Setup Complete! 🎉              "
echo "========================================="
echo ""
print_success "FlowReader is ready for personal use!"
echo ""
echo "To start the application:"
echo "  ${GREEN}npm run dev${NC}"
echo ""
echo "The app will be available at:"
echo "  ${BLUE}http://localhost:5173${NC}"
echo ""
echo "Next steps:"
echo "  1. Start the app with 'npm run dev'"
echo "  2. Create an account or sign in"
echo "  3. Upload your first EPUB file"
echo "  4. Start reading with AI assistance!"
echo ""
echo "For testing, see: docs/personal-smoke-check.md"
echo "For full guide, see: docs/personal-usage.md"
echo ""

# Offer to start the app
read -p "Would you like to start FlowReader now? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Starting FlowReader..."
    npm run dev
else
    print_info "Run 'npm run dev' when you're ready to start."
fi