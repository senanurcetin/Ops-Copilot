#!/bin/bash

# Script to verify dependencies and security
# Run this before committing changes

echo "🔍 Checking dependencies..."

# Check for outdated packages
echo ""
echo "📦 Checking for outdated packages..."
npm outdated || true

# Run security audit
echo ""
echo "🔒 Running security audit..."
npm audit --audit-level=moderate || true

# Check for duplicate dependencies
echo ""
echo "🔗 Checking for duplicate dependencies..."
npm list --all 2>&1 | grep -E "duplicate|npm (WARN|ERR)" || echo "✓ No duplicates found"

# Verify lock file
echo ""
echo "🔐 Verifying package-lock.json..."
npm ls > /dev/null 2>&1 && echo "✓ Lock file is valid" || echo "✗ Lock file needs updating"

echo ""
echo "✅ Dependency check complete!"
