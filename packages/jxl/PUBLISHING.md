# Publishing @kelaci/jsquash-jxl

This document describes how to build and publish the forked JXL package with high bit depth decode support.

## Prerequisites

1. **Docker** - Required for WASM build
2. **Node.js** - v18+ recommended
3. **npm account** - With publish permissions for the scope

## Build Process

### Step 1: Build WASM (Docker)

```bash
cd jSquash/packages/jxl/codec
npm run build
```

This runs `tools/build-cpp.sh` which:
- Uses Docker with emscripten SDK
- Compiles `jxl_dec.cpp` and `jxl_enc.cpp` to WASM
- Outputs to `codec/dec/*.wasm` and `codec/enc/*.wasm`

**Environment variables:**
- `EMSDK_VERSION` - Emscripten version (default: 2.0.34)
- `DEFAULT_CFLAGS` - Compiler flags (default: `-O3 -flto`)

### Step 2: Build TypeScript and Prepare Package

```bash
cd jSquash/packages/jxl
npm install
npm run build:fork
```

This:
1. Cleans `dist/` directory
2. Compiles TypeScript to `dist/`
3. Copies WASM files, README, LICENSE to `dist/`
4. Runs `prepare-fork-package.mjs` to customize package.json

### Step 3: Test Locally (Optional)

```bash
# Create tarball
npm run pack:fork

# This creates: dist/kelaci-jsquash-jxl-1.3.0-kelaci.0.tgz

# Install in imgjpg for testing
cd ../../../imgjpg
npm install ../jSquash/packages/jxl/dist/kelaci-jsquash-jxl-1.3.0-kelaci.0.tgz
```

### Step 4: Publish to npm

```bash
# Set your npm auth token
npm login

# Publish with custom settings
FORK_PACKAGE_NAME="@your-scope/jsquash-jxl" \
FORK_PACKAGE_VERSION="1.3.0-yourtag.0" \
FORK_PACKAGE_REPOSITORY="yourname/jSquash" \
npm run publish:fork

# Or use defaults (@kelaci/jsquash-jxl)
npm run publish:fork
```

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `FORK_PACKAGE_NAME` | `@kelaci/jsquash-jxl` | NPM package name |
| `FORK_PACKAGE_VERSION` | `1.3.0-kelaci.0` | Semantic version |
| `FORK_PACKAGE_REPOSITORY` | `kelaci/jSquash` | GitHub repository |
| `FORK_NPM_TAG` | `fork` | npm dist-tag |

## Version Bumping

Update version in `package.json`:
```json
{
  "version": "1.4.0"
}
```

Then set appropriate version for fork:
```bash
FORK_PACKAGE_VERSION="1.4.0-kelaci.0" npm run publish:fork
```

## What's Different in This Fork

Compared to original `@jsquash/jxl`:

1. **High bit depth decode** - `decodeHighBitDepth()` returns native 10/12/16-bit data
2. **Linear float decode** - `decodeLinearFloat()` returns linear light values
3. **ICC profile preservation** - Decode output includes embedded ICC profile
4. **Color space detection** - Automatic detection of sRGB, P3, PQ, HLG
5. **Full HDR support** - PQ/HLG transfer functions

## TypeScript Types

The package exports these types:
```typescript
export type { 
  JxlDecodedImage, 
  JxlLinearFloatImage 
} from './decode.js';
```

## imgjpg Integration

After publishing, update `imgjpg/package.json`:

```json
{
  "dependencies": {
    "@kelaci/jsquash-jxl": "^1.3.0-kelaci.0"
  }
}
```

Or use local linking for development:
```bash
cd jSquash/packages/jxl
npm link

cd ../../../imgjpg
npm link @kelaci/jsquash-jxl
```

## Troubleshooting

### WASM build fails
- Ensure Docker is running
- Check emscripten SDK version compatibility
- Review build logs in Docker container

### TypeScript compilation errors
- Check `tsconfig.json` extends correctly
- Ensure all type dependencies are installed

### npm publish fails
- Verify npm authentication: `npm whoami`
- Check package name scope permissions
- Ensure version doesn't already exist

## CI/CD Integration

For automated publishing, use GitHub Actions:

```yaml
# .github/workflows/publish.yml
name: Publish to npm
on:
  push:
    tags:
      - 'v*'
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - run: cd jSquash/packages/jxl/codec && npm run build
      - run: cd jSquash/packages/jxl && npm ci && npm run build:fork
      - run: cd jSquash/packages/jxl/dist && npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}