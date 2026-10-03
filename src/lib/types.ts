export interface Frame {
  id: string;
  /** Imagem original (já reduzida na importação). */
  source: ImageBitmap;
  /** Versão com fundo removido por IA (se aplicada). */
  cutout: ImageBitmap | null;
  /** Duração do quadro em ms. */
  delay: number;
}

export type Rotation = 0 | 90 | 180 | 270;

export interface Transform {
  zoom: number;
  /** Deslocamento em frações do tamanho do recorte. */
  offsetX: number;
  offsetY: number;
  rotation: Rotation;
  flipH: boolean;
}

export type OutputMode = 'static' | 'animated';
export type Matte = 'none' | 'dark' | 'light';

export interface ExportSettings {
  mode: OutputMode;
  size: number;
  auto: boolean;
  colors: number;
  tolerance: number;
  frameStep: number;
  alphaThreshold: number;
  matte: Matte;
  speed: number;
}

export interface ChromaSettings {
  enabled: boolean;
  color: [number, number, number];
  tolerance: number;
  softness: number;
  /** Remove só a cor conectada às bordas (varinha mágica). */
  contiguous: boolean;
}

export type SourceKind = 'image' | 'sequence' | 'animation' | 'video';

export interface EncodeResult {
  blob: Blob;
  bytes: number;
  size: number;
  colors: number;
  frameStep: number;
  tolerance: number;
  frames: number;
  overLimit: boolean;
  mime: 'image/png' | 'image/gif';
}

export const LIMIT_BYTES = 256_000;
export const MATTE_COLORS: Record<Exclude<Matte, 'none'>, [number, number, number]> = {
  dark: [49, 51, 56],
  light: [255, 255, 255],
};
