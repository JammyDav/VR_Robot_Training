import * as THREE from 'three';
import { Text, BatchedText, configureTextBuilder } from 'troika-three-text';
import { FONTS, BRAND } from '../config/brand';

// Larger SDF glyphs keep small type crisp at VR viewing distances.
configureTextBuilder({ sdfGlyphSize: 64 });

export interface TextOpts {
  text: string;
  size: number; // em height in metres
  font?: keyof typeof FONTS;
  color?: number;
  anchorX?: 'left' | 'center' | 'right';
  anchorY?: 'top' | 'middle' | 'bottom' | 'top-baseline' | 'bottom-baseline';
  maxWidth?: number;
  lineHeight?: number;
  align?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  position?: [number, number, number];
}

export function makeText(o: TextOpts): Text {
  const t = new Text();
  t.text = o.text;
  t.font = FONTS[o.font ?? 'body'];
  t.fontSize = o.size;
  t.color = o.color ?? BRAND.darkGrey;
  t.anchorX = o.anchorX ?? 'left';
  t.anchorY = o.anchorY ?? 'top';
  if (o.maxWidth) t.maxWidth = o.maxWidth;
  if (o.lineHeight) t.lineHeight = o.lineHeight;
  if (o.align) t.textAlign = o.align;
  if (o.letterSpacing) t.letterSpacing = o.letterSpacing;
  if (o.position) t.position.set(...o.position);
  t.sync();
  return t;
}

/**
 * Groups Text objects into one BatchedText per font so a whole panel costs
 * about one draw call per font face.
 */
export class TextGroup extends THREE.Group {
  private batches = new Map<string, BatchedText>();

  addText(o: TextOpts): Text {
    const key = o.font ?? 'body';
    let batch = this.batches.get(key);
    if (!batch) {
      batch = new BatchedText();
      this.batches.set(key, batch);
      this.add(batch);
    }
    const t = makeText(o);
    batch.add(t);
    return t;
  }
}
