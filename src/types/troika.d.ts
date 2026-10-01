// Minimal typings for troika-three-text (the package ships none).
declare module 'troika-three-text' {
  import { Mesh, Material, Color } from 'three';

  export class Text extends Mesh {
    text: string;
    font: string | null;
    fontSize: number;
    fontWeight: number | 'normal' | 'bold';
    color: number | string | Color;
    anchorX: number | 'left' | 'center' | 'right' | string;
    anchorY: number | 'top' | 'top-baseline' | 'middle' | 'bottom-baseline' | 'bottom' | string;
    maxWidth: number;
    lineHeight: number | 'normal';
    letterSpacing: number;
    textAlign: 'left' | 'right' | 'center' | 'justify';
    whiteSpace: 'normal' | 'nowrap';
    overflowWrap: 'normal' | 'break-word';
    outlineWidth: number | string;
    outlineColor: number | string | Color;
    fillOpacity: number;
    depthOffset: number;
    sdfGlyphSize: number | null;
    material: Material;
    sync(callback?: () => void): void;
    dispose(): void;
  }

  export class BatchedText extends Mesh {
    addText(text: Text): void;
    removeText(text: Text): void;
    sync(callback?: () => void): void;
    dispose(): void;
  }

  export function preloadFont(
    options: { font?: string; characters?: string | string[]; sdfGlyphSize?: number },
    callback: () => void,
  ): void;

  export function configureTextBuilder(config: { useWorker?: boolean; sdfGlyphSize?: number }): void;
}
