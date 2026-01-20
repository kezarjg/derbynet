#!/bin/bash
#
# Deploy DerbyNet website files to target location
#

set -e

SOURCE_DIR="${DERBYNET_SOURCE:-$HOME/derbynet/website}"
TARGET_DIR="${DERBYNET_TARGET:-/share/config/derbynet/website}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[*]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check source exists
if [ ! -d "$SOURCE_DIR" ]; then
    print_error "Source directory not found: $SOURCE_DIR"
    exit 1
fi

# Check target parent exists
TARGET_PARENT=$(dirname "$TARGET_DIR")
if [ ! -d "$TARGET_PARENT" ]; then
    print_error "Target parent directory not found: $TARGET_PARENT"
    exit 1
fi

# Create target if it doesn't exist
if [ ! -d "$TARGET_DIR" ]; then
    print_warning "Target directory does not exist, creating: $TARGET_DIR"
    mkdir -p "$TARGET_DIR"
fi

print_status "Deploying website files"
echo "  Source: $SOURCE_DIR"
echo "  Target: $TARGET_DIR"
echo

# Dry run first
print_status "Checking changes (dry run)..."
rsync -avhn --delete \
    --exclude='local/' \
    --exclude='local/**' \
    "$SOURCE_DIR/" "$TARGET_DIR/"

echo
read -p "Proceed with deployment? [y/N] " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Deployment cancelled"
    exit 0
fi

# Actual sync
print_status "Syncing files..."
rsync -avh --delete \
    --exclude='local/' \
    --exclude='local/**' \
    "$SOURCE_DIR/" "$TARGET_DIR/"

echo
print_status "Deployment complete!"
