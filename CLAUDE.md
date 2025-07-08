# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains two main Signal applications:
- **Signal-Android**: Native Android application (Kotlin/Java)
- **Signal-Desktop**: Cross-platform desktop application (TypeScript/React/Electron)

Both implement the Signal Protocol for end-to-end encrypted messaging.

## Signal-Android

### Build Commands

```bash
# Build debug APK
./gradlew assembleDebug

# Build release APKs (different variants)
./gradlew assemblePlayProdRelease
./gradlew assembleWebsiteProdRelease
./gradlew assembleProdRelease

# Build AAB (Android App Bundle) for Play Store
./gradlew bundlePlayProdRelease

# Clean build
./gradlew clean

# Build specific module
./gradlew :app:assembleDebug
./gradlew :libsignal-service:build
```

### Test Commands

```bash
# Run unit tests
./gradlew test
./gradlew testPlayProdReleaseUnitTest

# Run specific test class
./gradlew test --tests "org.thoughtcrime.securesms.SpecificTestClass"

# Run instrumented tests (requires device/emulator)
./gradlew connectedAndroidTest

# Run tests with coverage
./gradlew testPlayProdReleaseUnitTestCoverage

# Run spotless (code formatting check)
./gradlew spotlessCheck
./gradlew spotlessApply  # Auto-fix formatting
```

### Development Commands

```bash
# Install debug build on device
./gradlew installDebug

# Run lint checks
./gradlew lint
./gradlew lintPlayProdRelease

# List all available tasks
./gradlew tasks

# Run with specific build variant
./gradlew installPlayProdDebug
./gradlew installWebsiteProdDebug
```

### Reproducible Builds

```bash
# Run reproducible build comparison
python3 reproducible-builds/apkdiff.py <path-to-official-apk> <path-to-reproduced-apk>
```

### Architecture

- **Multi-module Architecture**: Core utilities, UI components, features are separate modules
- **Key Modules**:
  - `app/`: Main application module
  - `libsignal-service/`: Signal protocol service layer
  - `core-ui/`: Shared UI components
  - `core-util/`: Shared utilities
  - Feature modules: `donations/`, `device-transfer/`, `image-editor/`, `video/`
- **Database**: SQLCipher-encrypted SQLite with migrations in `app/src/main/java/org/thoughtcrime/securesms/database/`
- **Jobs**: Background job system in `app/src/main/java/org/thoughtcrime/securesms/jobs/`

## Signal-Desktop

### Prerequisites

- Use `pnpm` (NOT npm or yarn) - version 10.6.4
- Node.js 22.16.0 (check `.nvmrc` for version)
- Python 3 for building native modules
- Platform-specific build tools:
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Visual Studio 2022 with "Desktop development with C++"
  - **Linux**: gcc, g++, make

### Build Commands

```bash
# Initial setup (REQUIRED after clone)
pnpm install
pnpm run generate  # Generate protobuf files

# Development build
pnpm start

# Production builds
pnpm run build:dev
pnpm run build:staging
pnpm run build:alpha  
pnpm run build:production

# Platform-specific builds
pnpm run build:linux
pnpm run build:mac
pnpm run build:mac-arm64
pnpm run build:windows

# Release builds (creates installers)
pnpm run build-release
```

### Test Commands

```bash
# Run all tests
pnpm test

# Specific test suites
pnpm test-node      # Node.js tests
pnpm test-electron  # Electron tests
pnpm test-mock      # Mock server tests

# Run specific test file
pnpm test-node ts/test-node/path/to/test.js

# ESLint tests
pnpm run test-eslint
pnpm run test-eslint-run "--rule {ruleId}:{severity}"

# Type checking
pnpm run check:types

# Full CI validation
pnpm run ready
```

### Development Commands

```bash
# Start development mode
pnpm run dev:transpile  # Watch TypeScript
pnpm run dev:sass      # Watch SCSS
pnpm run dev:esbuild   # Watch and bundle
pnpm run dev:icu-types # Watch ICU types
pnpm run dev:protobuf  # Watch protobuf

# Run Storybook
pnpm storybook
pnpm run storybook:axe  # Run accessibility tests

# Linting and formatting
pnpm run lint          # Run all linters
pnpm run lint-fix      # Auto-fix issues
pnpm run format        # Prettier formatting
pnpm run stylelint     # CSS/SCSS linting
pnpm run lint-deps     # Check dependency constraints
pnpm run lint-license-comments  # Check license headers
pnpm run lint-intl     # Check internationalization

# Clean and rebuild
pnpm run clean-transpile
pnpm run build-protobuf

# React DevTools
pnpm run run-with-devtools
```

### Additional Utility Commands

```bash
# Dependency management
pnpm run check-upgradeable-deps

# String/localization management
pnpm run localize  # Extract strings for translation

# Build utilities
pnpm run build-bundles          # Build JS bundles
pnpm run build-acknowledge-assets  # Build acknowledgments
pnpm run build-css-assets       # Build CSS
pnpm run build-css-editor       # Build WYSIWYG editor CSS

# Verification
pnpm run verify-artifacts      # Verify build reproducibility
```

### Architecture

- **Main Process**: `app/main.ts` - Electron main process
- **Renderer Process**: React app in `ts/` directory
- **State Management**: Redux-style with ducks pattern in `ts/state/ducks/`
- **Components**: React components in `ts/components/`
- **Services**: Core services in `ts/services/`
- **SQL Database**: Better-SQLite3 with SQLCipher encryption, migrations in `ts/sql/`
- **Protocol Buffers**: `.proto` files in `protos/` compiled to TypeScript
- **Sticker Creator**: Separate Vite-based app in `sticker-creator/`

### Key Directories

- **app/**: Electron main process
- **ts/**: TypeScript source (renderer)
  - **components/**: React components
  - **state/ducks/**: Redux state modules
  - **services/**: Core business logic
  - **sql/**: Database layer
  - **util/**: Utility functions
  - **test-**/: Test directories
- **protos/**: Protocol buffer definitions
- **stylesheets/**: SCSS files
- **build/**: Build outputs
- **bundles/**: JS bundles
- **config/**: Environment configs
- **fixtures/**: Test fixtures
- **scripts/**: Build and utility scripts

### ESLint Configuration

The project uses custom ESLint rules:
- **Custom local rules** in `ts/eslint-rules/`
- Prefer `type` over `interface` (enforced)
- Use `assert` in tests, not `expect` or `should`
- Strict TypeScript mode enabled
- Function component naming: `ComponentName` or `useHookName`

### Testing Patterns

- **Test Runner**: Mocha with Chai assertions
- **Retry Logic**: Tests retry 3 times on failure
- **Worker Count**: 6 parallel test workers
- **Test Types**:
  - Unit tests: `test-node/`
  - Electron tests: `test-electron/`
  - Mock tests: `test-mock/`
  - Storybook tests: Visual component tests
- **Test Artifacts**: Screenshots and logs generated on failure

### CI/CD Pipeline

- **GitHub Actions**: Primary CI system
- **Required Checks**:
  - Type checking (`pnpm run check:types`)
  - Linting (`pnpm run lint`)
  - All test suites
  - Build verification
- **Ready Command**: `pnpm run ready` runs full CI locally

## Common Development Workflows

### Signal-Android
1. Make code changes
2. Run `./gradlew spotlessApply` to fix formatting
3. Run `./gradlew assembleDebug` to build
4. Run `./gradlew test` to verify tests pass
5. Install with `./gradlew installDebug`

### Signal-Desktop
1. Make code changes
2. Run `pnpm run check:types` to verify TypeScript
3. Run `pnpm run lint-fix` to fix linting issues
4. Run `pnpm test-node` for quick tests
5. Run `pnpm start` to test in development mode

## Environment Variables

### Signal-Desktop
- `NODE_ENV`: Set to 'development', 'production', 'test'
- `SIGNAL_ENV`: Controls which server environment to use
- `MOCK_TEST`: Set to 'true' for mock server tests
- `ELECTRON_ENABLE_LOGGING`: Enable Electron logging
- See `config/` directory for environment-specific configurations

## Important Notes

1. **Protocol Buffers**: Both projects use protobuf. Desktop requires `pnpm run generate` after `.proto` changes
2. **Reproducible Builds**: Both projects support reproducible builds for security verification
3. **Testing**: Always run tests before committing. Android uses JUnit, Desktop uses Mocha
4. **Code Style**: Android uses Spotless, Desktop uses Prettier/ESLint
5. **Translations**: Located in `_locales/` (Desktop) and `app/src/main/res/values-*/` (Android)
6. **pnpm Patches**: Desktop uses pnpm patches for dependency modifications
7. **Strict TypeScript**: Desktop enforces strict mode - no `any` types

## Troubleshooting

### Signal-Android
- Gradle sync issues: Try `./gradlew clean` and invalidate Android Studio caches
- Build failures: Check Java version (use Java 11 or 17)

### Signal-Desktop
- Node-gyp errors: Ensure Python 3 and build tools are installed
- Module not found: Run `pnpm install` and `pnpm run generate`
- Electron issues: Clear `~/.electron` cache
- ESLint cache issues: Delete `.eslintcache`
- TypeScript incremental build issues: Delete `tsconfig.tsbuildinfo`