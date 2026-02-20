export interface JXLModule extends EmscriptenWasm.Module {
  decode(data: BufferSource): ImageData | null;
  decodeHighBitDepth(data: BufferSource): {
    data: Uint8ClampedArray | Uint16Array | Float32Array;
    width: number;
    height: number;
    bitDepth: 8 | 10 | 12 | 16 | 32;
    colorSpace: string;
    hasAlpha: boolean;
    iccProfile: Uint8Array;
  } | null;
  decodeLinearFloat(data: BufferSource): {
    data: Float32Array;
    width: number;
    height: number;
    sourceBitDepth: number;
    colorSpace: string;
    iccProfile: Uint8Array;
  } | null;
}

declare var moduleFactory: EmscriptenWasm.ModuleFactory<JXLModule>;

export default moduleFactory;
