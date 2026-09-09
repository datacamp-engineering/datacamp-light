# List available recipes
default:
	just --list

# Install all project dependencies
setup:
	npm install

# Update dependencies
update-deps:
	npm update

# Run typecheck and full production build
check:
	npm run typecheck && npm run build

# Run format and lint auto-fixes
fix:
	npm run typecheck

# Run full test suite including unit tests, WASM runtime, and external tutorials
test:
	npm test && node scripts/test-wasm-runtime.mjs && node scripts/audit-external-tutorials.mjs --site=learnshell.org && node scripts/audit-external-tutorials.mjs --site=learnpython.org

# Run unit tests only
test-unit:
	npm test

# Run WebAssembly & Python runtime integration tests
test-wasm:
	node scripts/test-wasm-runtime.mjs

# Run external tutorial compatibility audit suite (learnpython.org & learnshell.org)
test-external:
	node scripts/audit-external-tutorials.mjs

# Measure live HTTP network footprint and compression ratios (Brotli / Gzip)
test-network:
	node scripts/measure-network-footprint.mjs

# Start local development server
dev:
	npm run dev

# Start local high-performance compressed static server with Brotli and Gzip
serve:
	node scripts/serve-compressed.mjs
