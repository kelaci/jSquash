/**
 * Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Notice: I (Jamie Sinclair) have modified this file.
 * Updated to support JPEG XL native input types and bit depth configuration.
 */
import type { EncodeOptions as CodecEncodeOptions } from './codec/enc/jxl_enc.js';
import type { JXLModule } from './codec/enc/jxl_enc.js';
import type {
  EncodeOptions,
  JxlBitDepth,
  JxlColorSpace,
  JxlImageDataLike,
  JxlInputBuffer,
  JxlInputType,
} from './meta.js';

import { defaultOptions } from './meta.js';
import { simd, threads } from 'wasm-feature-detect';
import { initEmscriptenModule } from './utils.js';

let emscriptenModule: Promise<JXLModule>;

type JxlInputArray = JxlInputBuffer;
type JxlEncodeInput = ImageData | JxlImageDataLike<JxlInputArray>;

const INPUT_TYPE_TO_WASM: Record<JxlInputType, number> = {
  u8: 0,
  u16: 1,
  f32: 2,
};

const COLOR_SPACE_TO_WASM: Record<JxlColorSpace, number> = {
  srgb: 0,
  'display-p3': 1,
  'rec2020-pq': 2,
  'rec2020-hlg': 3,
};

const isRunningInNode = () =>
  typeof process !== 'undefined' &&
  process.release &&
  process.release.name === 'node';
const isRunningInCloudflareWorker = () =>
  (globalThis.caches as any)?.default !== undefined;

export async function init(
  moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>,
): Promise<JXLModule>;
export async function init(
  module?: WebAssembly.Module,
  moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>,
) {
  let actualModule: WebAssembly.Module | undefined = module;
  let actualOptions: Partial<EmscriptenWasm.ModuleOpts> | undefined =
    moduleOptionOverrides;

  // If only one argument is provided and it's not a WebAssembly.Module
  if (arguments.length === 1 && !(module instanceof WebAssembly.Module)) {
    actualModule = undefined;
    actualOptions = module as unknown as Partial<EmscriptenWasm.ModuleOpts>;
  }

  if (
    !isRunningInNode() &&
    !isRunningInCloudflareWorker() &&
    (await threads())
  ) {
    if (await simd()) {
      const jxlEncoder = await import('./codec/enc/jxl_enc_mt_simd.js');
      emscriptenModule = initEmscriptenModule(
        jxlEncoder.default,
        actualModule,
        actualOptions,
      );
      return emscriptenModule;
    }
    const jxlEncoder = await import('./codec/enc/jxl_enc_mt.js');
    emscriptenModule = initEmscriptenModule(
      jxlEncoder.default,
      actualModule,
      actualOptions,
    );
    return emscriptenModule;
  }
  const jxlEncoder = await import('./codec/enc/jxl_enc.js');
  emscriptenModule = initEmscriptenModule(
    jxlEncoder.default,
    actualModule,
    actualOptions,
  );
  return emscriptenModule;
}

export default async function encode(
  data: ImageData | JxlImageDataLike<Uint8Array | Uint8ClampedArray>,
  options?: Partial<EncodeOptions> & {
    bitDepth?: 8;
    inputType?: 'u8';
  },
): Promise<ArrayBuffer>;
export default async function encode(
  data: JxlImageDataLike<Uint16Array>,
  options: Partial<EncodeOptions> & {
    bitDepth: 10 | 12 | 16;
    inputType?: 'u16';
  },
): Promise<ArrayBuffer>;
export default async function encode(
  data: JxlImageDataLike<Float32Array>,
  options?: Partial<EncodeOptions> & {
    bitDepth?: 32;
    inputType?: 'f32';
  },
): Promise<ArrayBuffer>;
export default async function encode(
  data: JxlEncodeInput,
  options: Partial<EncodeOptions> = {},
): Promise<ArrayBuffer> {
  if (!emscriptenModule) emscriptenModule = init();

  const normalized = normalizeInput(data);
  const inputType = resolveInputType(normalized.data, options.inputType);
  const bitDepth = resolveBitDepth(inputType, options.bitDepth);
  const numChannels = resolveNumChannels(
    normalized.data.length,
    normalized.width,
    normalized.height,
    options.numChannels,
  );
  const colorSpace =
    options.colorSpace ??
    mapImageColorSpace(normalized.colorSpace) ??
    defaultOptions.colorSpace;
  const premultipliedAlpha =
    options.premultipliedAlpha ?? defaultOptions.premultipliedAlpha;

  validateInputCombination(inputType, bitDepth);

  const merged: EncodeOptions = {
    ...defaultOptions,
    ...options,
    bitDepth,
    inputType,
    numChannels,
    colorSpace,
    premultipliedAlpha,
  };

  if (merged.lossless) {
    if (options.quality !== undefined && options.quality !== 100) {
      console.warn(
        'JXL lossless: Quality setting is ignored when lossless is enabled (quality must be 100).',
      );
    }

    if (options.lossyModular) {
      console.warn(
        'JXL lossless: LossyModular setting is ignored when lossless is enabled (lossyModular must be false).',
      );
    }

    if (options.lossyPalette) {
      console.warn(
        'JXL lossless: LossyPalette setting is ignored when lossless is enabled (lossyPalette must be false).',
      );
    }

    merged.quality = 100;
    merged.lossyModular = false;
    merged.lossyPalette = false;
  }

  const wasmOptions: CodecEncodeOptions = {
    effort: merged.effort,
    quality: merged.quality,
    progressive: merged.progressive,
    epf: merged.epf,
    lossyPalette: merged.lossyPalette,
    decodingSpeedTier: merged.decodingSpeedTier,
    photonNoiseIso: merged.photonNoiseIso,
    lossyModular: merged.lossyModular,
    lossless: merged.lossless,
    bitDepth: merged.bitDepth,
    inputType: INPUT_TYPE_TO_WASM[merged.inputType],
    colorSpace: COLOR_SPACE_TO_WASM[merged.colorSpace],
    premultipliedAlpha: merged.premultipliedAlpha,
    numChannels: merged.numChannels,
  };

  const module = await emscriptenModule;
  const bytes = new Uint8Array(
    normalized.data.buffer,
    normalized.data.byteOffset,
    normalized.data.byteLength,
  );
  const resultView = module.encode(
    bytes,
    normalized.width,
    normalized.height,
    wasmOptions,
  );
  if (!resultView) {
    throw new Error(
      `Encoding error for combination inputType=${merged.inputType}, bitDepth=${merged.bitDepth}.`,
    );
  }

  return resultView.buffer as ArrayBuffer;
}

function normalizeInput(data: JxlEncodeInput): JxlImageDataLike<JxlInputArray> {
  if ('data' in data && 'width' in data && 'height' in data) {
    return {
      data: data.data as JxlInputArray,
      width: data.width,
      height: data.height,
      colorSpace: 'colorSpace' in data ? data.colorSpace : undefined,
    };
  }

  throw new Error('Invalid input image format.');
}

function resolveInputType(
  data: JxlInputArray,
  requested?: JxlInputType,
): JxlInputType {
  const inferred = inferInputType(data);

  if (!requested) return inferred;

  if (requested !== inferred) {
    throw new Error(
      `inputType mismatch: received ${requested}, but data buffer implies ${inferred}.`,
    );
  }

  return requested;
}

function inferInputType(data: JxlInputArray): JxlInputType {
  if (data instanceof Uint16Array) return 'u16';
  if (data instanceof Float32Array) return 'f32';
  return 'u8';
}

function resolveBitDepth(
  inputType: JxlInputType,
  requested?: JxlBitDepth,
): JxlBitDepth {
  if (requested !== undefined) return requested;
  if (inputType === 'u16') return 16;
  if (inputType === 'f32') return 32;
  return 8;
}

function resolveNumChannels(
  dataLength: number,
  width: number,
  height: number,
  requested?: 3 | 4,
): 3 | 4 {
  const pixelCount = width * height;
  const rgbLength = pixelCount * 3;
  const rgbaLength = pixelCount * 4;

  if (requested === 3) {
    if (dataLength !== rgbLength) {
      throw new Error(
        `Invalid buffer size for RGB input. Expected ${rgbLength}, received ${dataLength}.`,
      );
    }
    return 3;
  }

  if (requested === 4) {
    if (dataLength !== rgbaLength) {
      throw new Error(
        `Invalid buffer size for RGBA input. Expected ${rgbaLength}, received ${dataLength}.`,
      );
    }
    return 4;
  }

  if (dataLength === rgbaLength) return 4;
  if (dataLength === rgbLength) return 3;

  throw new Error(
    `Invalid buffer size. Expected ${rgbLength} (RGB) or ${rgbaLength} (RGBA), received ${dataLength}.`,
  );
}

function validateInputCombination(
  inputType: JxlInputType,
  bitDepth: JxlBitDepth,
): void {
  if (inputType === 'u8' && bitDepth !== 8) {
    throw new Error('Unsupported combination: inputType "u8" only supports bitDepth 8.');
  }

  if (inputType === 'u16' && bitDepth !== 10 && bitDepth !== 12 && bitDepth !== 16) {
    throw new Error(
      'Unsupported combination: inputType "u16" only supports bitDepth 10, 12 or 16.',
    );
  }

  if (inputType === 'f32' && bitDepth !== 32) {
    throw new Error('Unsupported combination: inputType "f32" only supports bitDepth 32.');
  }
}

function mapImageColorSpace(
  colorSpace: PredefinedColorSpace | undefined,
): JxlColorSpace | undefined {
  if (colorSpace === 'display-p3') return 'display-p3';
  if (colorSpace === 'srgb') return 'srgb';
  return undefined;
}
