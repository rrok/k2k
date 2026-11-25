import { Vector3 } from 'three';

/**
 * Atlante della vernice per un modello qualsiasi: niente coordinate UV, ma
 * cinque proiezioni piane dell'auto (sinistra, destra, alto, davanti, dietro)
 * affiancate nella stessa texture. Ogni punto della carrozzeria legge le
 * proiezioni verso cui è rivolto, pesate con la sua normale.
 * Spazio auto: X lunghezza (muso a −X), Y alto, Z larghezza. Unità: metri.
 */

export type ChartId = 'left' | 'right' | 'top' | 'front' | 'rear';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Touch {
  id: ChartId;
  u: number;
  v: number;
  /** Peso della proiezione per la normale del punto, 0…1. */
  w: number;
}

/** Spazio vuoto tra una proiezione e l'altra, in metri. */
const GAP = 0.06;

export class PaintAtlas {
  /** Dimensioni dell'atlante in metri. */
  readonly w: number;
  readonly h: number;
  /** Spostamenti in metri: riga destra, riga alto, riga davanti/dietro, colonna dietro. */
  readonly off: [number, number, number, number];
  private size: Vector3;

  constructor(readonly min: Vector3, readonly max: Vector3) {
    const L = (this.size = max.clone().sub(min));
    this.off = [L.y + GAP, 2 * (L.y + GAP), 2 * (L.y + GAP) + L.z + GAP, L.z + GAP];
    this.w = Math.max(L.x, 2 * L.z + GAP);
    this.h = this.off[2] + L.y;
  }

  /** Rettangolo di una proiezione, in coordinate normalizzate dell'atlante. */
  rect(id: ChartId): Rect {
    const L = this.size;
    const r: Rect =
      id === 'left' ? { x: 0, y: 0, w: L.x, h: L.y } :
      id === 'right' ? { x: 0, y: this.off[0], w: L.x, h: L.y } :
      id === 'top' ? { x: 0, y: this.off[1], w: L.x, h: L.z } :
      id === 'front' ? { x: 0, y: this.off[2], w: L.z, h: L.y } :
      { x: this.off[3], y: this.off[2], w: L.z, h: L.y };
    return { x: r.x / this.w, y: r.y / this.h, w: r.w / this.w, h: r.h / this.h };
  }

  /** Proiezioni toccate da un punto della superficie con normale n, la più pesante per prima. */
  touch(p: Vector3, n: Vector3): Touch[] {
    let wx = n.x ** 4;
    let wy = n.y < 0 ? 0 : n.y ** 4;
    let wz = n.z ** 4;
    const sum = wx + wy + wz + 1e-5;
    wx /= sum;
    wy /= sum;
    wz /= sum;
    const { min, max, off } = this;
    const out: Touch[] = [
      { id: p.z > 0 ? 'left' : 'right', u: p.x - min.x, v: max.y - p.y + (p.z > 0 ? 0 : off[0]), w: wz },
      { id: 'top', u: p.x - min.x, v: p.z - min.z + off[1], w: wy },
      { id: p.x < 0 ? 'front' : 'rear', u: p.z - min.z + (p.x < 0 ? 0 : off[3]), v: max.y - p.y + off[2], w: wx }
    ];
    for (const t of out) {
      t.u /= this.w;
      t.v /= this.h;
    }
    return out.filter(t => t.w >= 0.1).sort((a, b) => b.w - a.w);
  }

  /** Valori per gli shader (vedi ATLAS_GLSL). */
  uniforms(): Record<string, { value: unknown }> {
    return {
      k2kMin: { value: this.min },
      k2kMax: { value: this.max },
      k2kInv: { value: [1 / this.w, 1 / this.h] },
      k2kOff: { value: this.off }
    };
  }
}

/** Le stesse proiezioni, lato shader. */
export const ATLAS_GLSL = /* glsl */ `
uniform vec3 k2kMin;
uniform vec3 k2kMax;
uniform vec2 k2kInv;
uniform vec4 k2kOff;

vec3 k2kWeights(vec3 n) {
  vec3 w = n * n;
  w = w * w;
  if (n.y < 0.0) w.y = 0.0;
  return w / (w.x + w.y + w.z + 1e-5);
}
vec2 k2kSide(vec3 p) { return vec2(p.x - k2kMin.x, k2kMax.y - p.y + (p.z > 0.0 ? 0.0 : k2kOff.x)) * k2kInv; }
vec2 k2kTop(vec3 p) { return vec2(p.x - k2kMin.x, p.z - k2kMin.z + k2kOff.y) * k2kInv; }
vec2 k2kEnd(vec3 p) { return vec2(p.z - k2kMin.z + (p.x < 0.0 ? 0.0 : k2kOff.w), k2kMax.y - p.y + k2kOff.z) * k2kInv; }
`;
