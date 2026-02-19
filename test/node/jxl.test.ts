import test from 'ava';
import { importWasmModule, getFixturesImage } from './utils.js';

import decode, { init as initDecode } from '@jsquash/jxl/decode.js';
import encode, { init as initEncode } from '@jsquash/jxl/encode.js';

test('can successfully decode image', async (t) => {
  const [testImage, decodeWasmModule] = await Promise.all([
    getFixturesImage('test.jxl'),
    importWasmModule('node_modules/@jsquash/jxl/codec/dec/jxl_dec.wasm'),
  ]);
  initDecode(decodeWasmModule);
  const data = await decode(testImage);
  t.is(data.width, 50);
  t.is(data.height, 50);
  t.is(data.data.length, 4 * 50 * 50);
});

test('can successfully encode image', async (t) => {
  const encodeWasmModule = await importWasmModule(
    'node_modules/@jsquash/jxl/codec/enc/jxl_enc.wasm',
  );
  await initEncode(encodeWasmModule);
  const data = await encode({
    data: new Uint8ClampedArray(4 * 50 * 50),
    height: 50,
    width: 50,
    colorSpace: 'srgb' as const,
  });
  t.assert(data instanceof ArrayBuffer);
});

test('can successfully encode u16 input with 10-bit semantic depth', async (t) => {
  const encodeWasmModule = await importWasmModule(
    'node_modules/@jsquash/jxl/codec/enc/jxl_enc.wasm',
  );
  await initEncode(encodeWasmModule);

  const width = 8;
  const height = 8;
  const pixels = new Uint16Array(width * height * 4);
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = (i * 257) % 65536;
  }

  const encoded = await encode(
    { data: pixels, width, height },
    {
      inputType: 'u16',
      bitDepth: 10,
      colorSpace: 'display-p3',
    },
  );

  t.assert(encoded instanceof ArrayBuffer);
  t.true(encoded.byteLength > 0);
});

test('throws for unsupported u8 + 10-bit combination', async (t) => {
  const encodeWasmModule = await importWasmModule(
    'node_modules/@jsquash/jxl/codec/enc/jxl_enc.wasm',
  );
  await initEncode(encodeWasmModule);

  await t.throwsAsync(
    () =>
      encode(
        {
          data: new Uint8ClampedArray(4 * 4 * 4),
          width: 4,
          height: 4,
        },
        {
          inputType: 'u8',
          bitDepth: 10,
        } as any,
      ),
    {
      message:
        'Unsupported combination: inputType "u8" only supports bitDepth 8.',
    },
  );
});

test('throws for unsupported u16 + 8-bit combination', async (t) => {
  const encodeWasmModule = await importWasmModule(
    'node_modules/@jsquash/jxl/codec/enc/jxl_enc.wasm',
  );
  await initEncode(encodeWasmModule);

  await t.throwsAsync(
    () =>
      encode(
        {
          data: new Uint16Array(4 * 4 * 4),
          width: 4,
          height: 4,
        },
        {
          inputType: 'u16',
          bitDepth: 8,
        } as any,
      ),
    {
      message:
        'Unsupported combination: inputType "u16" only supports bitDepth 10, 12 or 16.',
    },
  );
});

test('can successfully encode and decode lossless image', async (t) => {
  const [encodeWasmModule, decodeWasmModule] = await Promise.all([
    importWasmModule('node_modules/@jsquash/jxl/codec/enc/jxl_enc.wasm'),
    importWasmModule('node_modules/@jsquash/jxl/codec/dec/jxl_dec.wasm'),
  ]);
  await initEncode(encodeWasmModule);
  initDecode(decodeWasmModule);

  const originalImageData = {
    width: 10,
    height: 10,
    data: new Uint8ClampedArray(4 * 10 * 10),
    colorSpace: 'srgb' as const,
  };
  // Fill with some non-zero data
  for (let i = 0; i < originalImageData.data.length; i++) {
    originalImageData.data[i] = (i * 3 + 7) % 256;
  }

  const encodedData = await encode(originalImageData, { lossless: true });
  t.assert(encodedData instanceof ArrayBuffer);

  const decodedData = await decode(encodedData);
  if (!decodedData) {
    t.fail('Failed to decode image');
    return;
  }

  t.is(decodedData.width, originalImageData.width);
  t.is(decodedData.height, originalImageData.height);
  t.deepEqual(
    decodedData.data,
    originalImageData.data,
    'Decoded data should match original for lossless',
  );
});

test('encodes lossless even with conflicting quality option', async (t) => {
  const [encodeWasmModule, decodeWasmModule] = await Promise.all([
    importWasmModule('node_modules/@jsquash/jxl/codec/enc/jxl_enc.wasm'),
    importWasmModule('node_modules/@jsquash/jxl/codec/dec/jxl_dec.wasm'),
  ]);
  await initEncode(encodeWasmModule);
  initDecode(decodeWasmModule);

  const originalImageData = {
    width: 8,
    height: 8,
    data: new Uint8ClampedArray(4 * 8 * 8),
    colorSpace: 'srgb' as const,
  };
  for (let i = 0; i < originalImageData.data.length; i++) {
    originalImageData.data[i] = (i * 5) % 256;
  }

  // Encode with lossless true but also a lossy quality setting
  const encodedData = await encode(originalImageData, {
    lossless: true,
    quality: 50,
  });
  t.assert(encodedData instanceof ArrayBuffer);

  const decodedData = await decode(encodedData);
  if (!decodedData) {
    t.fail('Failed to decode image');
    return;
  }

  t.deepEqual(
    decodedData.data,
    originalImageData.data,
    'Decoded data should match original even with conflicting quality',
  );
});
