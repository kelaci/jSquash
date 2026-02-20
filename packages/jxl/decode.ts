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
 * Notice: I (Jamie Sinclair) have copied this code from the @jsquash/webp decode module
 * and modified it to decode JPEG XL images.
 *
 * Extended with high bit depth decode support for 10/12/16-bit and float32 output.
 */

import jxlDecoder, { JXLModule } from './codec/dec/jxl_dec.js';
import { initEmscriptenModule } from './utils.js';

/**
 * Decoded image with high bit depth support
 */
export interface JxlDecodedImage {
  /** Pixel data - format depends on bitDepth */
  data: Uint8ClampedArray | Uint16Array | Float32Array;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Effective bit depth: 8, 10, 12, 16, or 32 (float) */
  bitDepth: 8 | 10 | 12 | 16 | 32;
  /** Color space identifier */
  colorSpace:
    | 'srgb'
    | 'display-p3'
    | 'rec2020-pq'
    | 'rec2020-hlg'
    | 'linear'
    | string;
  /** Whether the image has an alpha channel */
  hasAlpha: boolean;
  /** ICC profile data (may be empty) */
  iccProfile: Uint8Array;
}

/**
 * Decoded image in linear float format
 */
export interface JxlLinearFloatImage {
  /** Linear RGBA pixel data as Float32 */
  data: Float32Array;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Original source bit depth */
  sourceBitDepth: number;
  /** Color space identifier */
  colorSpace: string;
  /** ICC profile data (may be empty) */
  iccProfile: Uint8Array;
}

let emscriptenModule: Promise<JXLModule>;

export async function init(
  moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>,
): Promise<JXLModule>;
export async function init(
  module?: WebAssembly.Module,
  moduleOptionOverrides?: Partial<EmscriptenWasm.ModuleOpts>,
): Promise<JXLModule> {
  let actualModule: WebAssembly.Module | undefined = module;
  let actualOptions: Partial<EmscriptenWasm.ModuleOpts> | undefined =
    moduleOptionOverrides;

  // If only one argument is provided and it's not a WebAssembly.Module
  if (arguments.length === 1 && !(module instanceof WebAssembly.Module)) {
    actualModule = undefined;
    actualOptions = module as unknown as Partial<EmscriptenWasm.ModuleOpts>;
  }

  emscriptenModule = initEmscriptenModule(
    jxlDecoder,
    actualModule,
    actualOptions,
  );
  return emscriptenModule;
}

/**
 * Decode a JXL image to 8-bit ImageData (backward compatible).
 * All images are converted to 8-bit sRGB RGBA.
 *
 * @param buffer - JXL encoded data
 * @returns ImageData with 8-bit RGBA pixels
 */
export default async function decode(buffer: ArrayBuffer): Promise<ImageData> {
  if (!emscriptenModule) emscriptenModule = init();

  const module = await emscriptenModule;
  const result = module.decode(buffer);
  if (!result) throw new Error('Decoding error');
  return result;
}

/**
 * Decode a JXL image with high bit depth support.
 *
 * Returns the native bit depth and color space:
 * - 8-bit images: Uint8ClampedArray, sRGB
 * - 10/12/16-bit images: Uint16Array, native color space
 * - Float images: Float32Array, PQ/HLG/linear
 *
 * @param buffer - JXL encoded data
 * @returns Decoded image with metadata
 */
export async function decodeHighBitDepth(
  buffer: ArrayBuffer,
): Promise<JxlDecodedImage> {
  if (!emscriptenModule) emscriptenModule = init();

  const module = await emscriptenModule;
  const result = module.decodeHighBitDepth(buffer);
  if (!result) throw new Error('Decoding error');

  return {
    data: result.data as Uint8ClampedArray | Uint16Array | Float32Array,
    width: result.width as number,
    height: result.height as number,
    bitDepth: result.bitDepth as 8 | 10 | 12 | 16 | 32,
    colorSpace: result.colorSpace as string,
    hasAlpha: result.hasAlpha as boolean,
    iccProfile: result.iccProfile as Uint8Array,
  };
}

/**
 * Decode a JXL image to linear Float32 RGBA.
 *
 * Useful for HDR workflows where you need linear light values.
 * The pixel values are in the [0, 1] range for SDR, or may exceed 1.0 for HDR.
 *
 * @param buffer - JXL encoded data
 * @returns Decoded image with linear float pixels
 */
export async function decodeLinearFloat(
  buffer: ArrayBuffer,
): Promise<JxlLinearFloatImage> {
  if (!emscriptenModule) emscriptenModule = init();

  const module = await emscriptenModule;
  const result = module.decodeLinearFloat(buffer);
  if (!result) throw new Error('Decoding error');

  return {
    data: result.data as Float32Array,
    width: result.width as number,
    height: result.height as number,
    sourceBitDepth: result.sourceBitDepth as number,
    colorSpace: result.colorSpace as string,
    iccProfile: result.iccProfile as Uint8Array,
  };
}
