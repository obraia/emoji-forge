declare module 'gifuct-js' {
  export interface ParsedFrame {
    dims: { width: number; height: number; top: number; left: number };
    patch: Uint8ClampedArray;
    delay: number;
    disposalType: number;
  }
  export interface ParsedGif {
    lsd: { width: number; height: number };
  }
  export function parseGIF(buf: ArrayBuffer): ParsedGif;
  export function decompressFrames(gif: ParsedGif, buildPatch: boolean): ParsedFrame[];
}
