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

export type JxlBitDepth = 8 | 10 | 12 | 16 | 32;
export type JxlInputType = 'u8' | 'u16' | 'f32';
export type JxlColorSpace =
  | 'srgb'
  | 'display-p3'
  | 'rec2020-pq'
  | 'rec2020-hlg';

export type JxlInputBuffer =
  | Uint8Array
  | Uint8ClampedArray
  | Uint16Array
  | Float32Array;

export interface EncodeOptions {
  effort: number;
  quality: number;
  progressive: boolean;
  epf: number;
  lossyPalette: boolean;
  decodingSpeedTier: number;
  photonNoiseIso: number;
  lossyModular: boolean;
  lossless: boolean;
  /**
   * Input bit depth.
   *
   * For `inputType: 'u16'`, the full `0..65535` range is used as container.
   * `bitDepth` indicates semantic depth to the encoder (`10`, `12`, or `16`).
   * No JS-side rescaling is performed.
   */
  bitDepth: JxlBitDepth;
  inputType: JxlInputType;
  colorSpace: JxlColorSpace;
  premultipliedAlpha: boolean;
  numChannels: 3 | 4;
}

export interface JxlImageDataLike<T extends JxlInputBuffer = JxlInputBuffer> {
  data: T;
  width: number;
  height: number;
  colorSpace?: PredefinedColorSpace;
}

export const label = 'JPEG XL (beta)';
export const mimeType = 'image/jxl';
export const extension = 'jxl';
export const defaultOptions: EncodeOptions = {
  effort: 7,
  quality: 75,
  progressive: false,
  epf: -1,
  lossyPalette: false,
  decodingSpeedTier: 0,
  photonNoiseIso: 0,
  lossyModular: false,
  lossless: false,
  bitDepth: 8,
  inputType: 'u8',
  colorSpace: 'srgb',
  premultipliedAlpha: false,
  numChannels: 4,
};
