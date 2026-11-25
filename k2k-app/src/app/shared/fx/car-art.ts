/**
 * Auto illustrata in vista laterale (muso a sinistra), disegnata su canvas.
 * Unità di disegno: 1000 × 340, terreno a y = 320.
 */

export const CAR = {
  w: 1000,
  h: 340,
  ground: 320,
  wheelR: 61,
  /** Raggio del passaruota. */
  archR: 73,
  wheels: [{ x: 234, y: 259 }, { x: 788, y: 259 }],
  headlight: { x: 62, y: 190 },
  taillight: { x: 944, y: 162 }
} as const;

export type Rgb = [number, number, number];

export function hexRgb(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

function rgba(c: Rgb, a = 1): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

/** Versione più luminosa e satura della tinta: le superfici rivolte ai neon. */
function brighten(c: Rgb): Rgb {
  return [Math.min(255, c[0] * 1.26 + 20), Math.min(255, c[1] * 1.26 + 20), Math.min(255, c[2] * 1.26 + 20)].map(Math.round) as Rgb;
}

function luminance(c: Rgb): number {
  return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
}

/* ---------- Geometria ---------- */

const SHAPES = {
  body:
    'M 70 286 C 56 284 47 272 46 254 C 45 236 46 214 50 200 C 53 188 60 180 72 175 ' +
    'C 130 157 220 140 306 131 C 320 129 330 123 340 115 L 428 60 ' +
    'C 440 52 462 46 500 43 C 580 37 660 43 708 60 C 790 90 860 118 912 131 ' +
    'C 928 134 940 138 946 150 C 952 176 956 220 953 254 C 952 272 944 284 930 286 ' +
    'L 855.8 286 A 73 73 0 1 0 720.2 286 L 301.8 286 A 73 73 0 1 0 166.2 286 Z',
  glass:
    'M 366 131 L 450 73 C 458 65 476 60 510 58 C 590 53 655 58 700 74 ' +
    'C 752 93 800 111 838 124 C 844 127 843 132 836 132 Z',
  windshield: 'M 340 116 L 428 61 L 437 66 L 350 122 Z',
  rearScreen: 'M 714 63 C 792 92 852 116 904 130 L 894 134 C 846 122 786 99 708 70 Z',
  bPillar: 'M 572 132 L 579 54 L 593 54 L 589 132 Z',
  cPillar: 'M 714 132 L 708 78 L 716 81 L 723 132 Z',
  mirror: 'M 344 128 C 342 113 366 106 384 113 C 392 117 391 128 383 131 L 356 133 C 349 133 345 131 344 128 Z',
  skirt: 'M 301 286 L 307 271 C 440 265 600 265 715 271 L 721 286 Z',
  intake: 'M 50 238 C 74 233 104 236 128 246 L 136 264 C 110 263 84 266 62 276 C 54 271 50 260 49 250 Z',
  splitter: 'M 64 287 C 58 286 55 283 56 279 C 92 274 134 274 169 280 L 166.2 287 Z',
  vent: 'M 128 196 C 136 204 142 216 144 232 L 138 234 C 135 220 130 208 123 200 Z',
  diffuser: 'M 859 286 L 865 268 C 898 264 930 258 953 250 C 952 270 944 284 930 286 Z',
  headlight: 'M 55 191 C 70 180 98 171 134 167 C 141 167 142 173 137 176 C 112 184 84 191 60 202 C 53 202 51 195 55 191 Z',
  taillight: 'M 949 162 C 930 153 900 148 868 148 C 861 148 861 155 868 157 C 898 160 928 166 951 177 Z',
  shoulder:
    'M 60 182 C 130 160 220 143 306 135 C 330 132 345 131 366 131 L 838 131 C 880 131 922 137 946 151',
  roofline: 'M 430 62 C 442 54 462 48 500 45 C 580 39 660 45 708 62 C 790 92 860 120 912 133',
  crease: 'M 140 178 C 300 158 600 151 868 159',
  sculpt: 'M 324 245 C 450 232 600 230 712 241',
  horizon: 'M -40 226 C 300 198 700 194 1040 212',
  sky: 'M -40 -20 L 1040 -20 L 1040 212 C 700 194 300 198 -40 226 Z',
  ground: 'M -40 226 C 300 198 700 194 1040 212 L 1040 360 L -40 360 Z',
  doorFront: 'M 356 133 C 348 172 345 232 352 284',
  doorMid: 'M 581 132 L 576 284',
  doorRear: 'M 719 132 C 727 170 727 212 715 248',
  bumperFront: 'M 140 175 C 138 202 144 226 161 244',
  bumperRear: 'M 872 158 C 882 192 878 222 861 244'
} as const;

type ShapeName = keyof typeof SHAPES;
let cache: Record<ShapeName, Path2D> | undefined;

/** Tracciati dell'auto (creati al primo uso: Path2D esiste solo nel browser). */
export function carPaths(): Record<ShapeName, Path2D> {
  if (!cache) {
    cache = {} as Record<ShapeName, Path2D>;
    (Object.keys(SHAPES) as ShapeName[]).forEach(k => (cache![k] = new Path2D(SHAPES[k])));
  }
  return cache;
}

/** Tratto morbido: più passate di spessore e opacità diversi (niente filtri blur). */
function glow(ctx: CanvasRenderingContext2D, path: Path2D, rgb: string, layers: [number, number][]): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [w, a] of layers) {
    ctx.lineWidth = w;
    ctx.strokeStyle = `rgba(${rgb},${a})`;
    ctx.stroke(path);
  }
}

/* ---------- Texture ---------- */

let flakeTile: HTMLCanvasElement | undefined;

/** Scaglie del metallizzato / grana della carteggiatura. */
function flakes(): HTMLCanvasElement {
  if (!flakeTile) {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d')!;
    for (let i = 0; i < 3400; i++) {
      x.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.4})`;
      const s = 0.5 + Math.random() * 0.5;
      x.fillRect(Math.random() * size, Math.random() * size, s, s);
    }
    flakeTile = c;
  }
  return flakeTile;
}

/* ---------- Passaruota (sotto la carrozzeria) ---------- */

export function drawWells(ctx: CanvasRenderingContext2D): void {
  for (const w of CAR.wheels) {
    const g = ctx.createRadialGradient(w.x, w.y, 36, w.x, w.y, CAR.archR + 4);
    g.addColorStop(0, '#050506');
    g.addColorStop(1, '#0d0e10');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w.x, w.y, CAR.archR + 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fondo scocca tra le ruote
  ctx.fillStyle = '#08090a';
  ctx.fillRect(150, 268, 720, 20);
}

/* ---------- Vernice ---------- */

/** Carrozzeria verniciata e lucida nel colore indicato (esadecimale). */
export function drawPaint(ctx: CanvasRenderingContext2D, color: string): void {
  const p = carPaths();
  const c = hexRgb(color);
  const lum = luminance(c);
  // Su tinte chiare i riflessi bianchi non si vedono: contano di più le ombre
  const hi = 1 - lum * 0.45;
  const lo = 0.8 + lum * 0.7;

  ctx.save();
  ctx.clip(p.body);

  const g = ctx.createLinearGradient(0, 36, 0, 290);
  const hot = brighten(c);
  g.addColorStop(0, rgba(mix(hot, WHITE, 0.2 * hi)));
  g.addColorStop(0.3, rgba(hot));
  g.addColorStop(0.52, rgba(c));
  g.addColorStop(0.74, rgba(mix(c, BLACK, Math.min(0.24 * lo, 0.6))));
  g.addColorStop(0.92, rgba(mix(c, BLACK, Math.min(0.52 * lo, 0.8))));
  g.addColorStop(1, rgba(mix(c, BLACK, Math.min(0.36 * lo, 0.7))));
  ctx.fillStyle = g;
  ctx.fillRect(-40, 0, CAR.w + 80, CAR.h);

  // Riflesso delle pareti illuminate: più chiaro appena sopra l'orizzonte
  ctx.save();
  ctx.clip(p.sky);
  const sky = ctx.createLinearGradient(0, 128, 0, 226);
  sky.addColorStop(0, 'rgba(255,255,255,0)');
  sky.addColorStop(0.72, `rgba(255,255,255,${0.04 * hi})`);
  sky.addColorStop(1, `rgba(255,255,255,${0.2 * hi})`);
  ctx.fillStyle = sky;
  ctx.fillRect(-40, 0, CAR.w + 80, CAR.h);
  ctx.restore();

  // Sotto l'orizzonte si riflette il pavimento scuro, con un rimbalzo di luce in basso
  ctx.save();
  ctx.clip(p.ground);
  const floor = ctx.createLinearGradient(0, 196, 0, 290);
  floor.addColorStop(0, `rgba(0,0,0,${Math.min(0.26 * lo, 0.5)})`);
  floor.addColorStop(0.55, 'rgba(0,0,0,0.06)');
  floor.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = floor;
  ctx.fillRect(-40, 0, CAR.w + 80, CAR.h);
  ctx.restore();
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = `rgba(255,255,255,${0.34 * hi})`;
  ctx.stroke(p.horizon);

  // Spalla e tetto: le superfici rivolte verso i neon
  glow(ctx, p.shoulder, '255,255,255', [[34, 0.045 * hi], [20, 0.07 * hi], [10, 0.11 * hi], [2.6, 0.42 * hi]]);
  glow(ctx, p.roofline, '255,255,255', [[16, 0.07 * hi], [8, 0.13 * hi], [2.2, 0.5 * hi]]);

  // Punti luce sui parafanghi
  for (const [x, y, r, a] of [[236, 152, 96, 0.26], [800, 146, 104, 0.22], [560, 140, 150, 0.1]] as const) {
    const spot = ctx.createRadialGradient(x, y, 0, x, y, r);
    spot.addColorStop(0, `rgba(255,255,255,${a * hi})`);
    spot.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spot;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Nervature della fiancata: filo di luce con ombra sotto
  ctx.save();
  ctx.translate(0, 3);
  glow(ctx, p.crease, '0,0,0', [[7, 0.07 * lo], [3, 0.12 * lo]]);
  ctx.restore();
  glow(ctx, p.crease, '255,255,255', [[5, 0.08 * hi], [1.4, 0.36 * hi]]);
  ctx.save();
  ctx.translate(0, -4);
  glow(ctx, p.sculpt, '0,0,0', [[10, 0.08 * lo], [4, 0.1 * lo]]);
  ctx.restore();
  glow(ctx, p.sculpt, '255,255,255', [[6, 0.06 * hi], [1.6, 0.24 * hi]]);

  // Scaglie del metallizzato
  ctx.globalAlpha = 0.26 * hi;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = ctx.createPattern(flakes(), 'repeat')!;
  ctx.fillRect(-40, 0, CAR.w + 80, CAR.h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  edgeShade(ctx, 0.5 * lo);
  ctx.restore();
}

/** Ombre ai bordi: muso e coda che girano, labbri dei passaruota, sottoscocca. */
function edgeShade(ctx: CanvasRenderingContext2D, k: number): void {
  const a = Math.min(k, 0.75);
  const front = ctx.createLinearGradient(44, 0, 104, 0);
  front.addColorStop(0, `rgba(0,0,0,${a * 0.6})`);
  front.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = front;
  ctx.fillRect(40, 150, 70, 150);
  const rear = ctx.createLinearGradient(958, 0, 900, 0);
  rear.addColorStop(0, `rgba(0,0,0,${a * 0.75})`);
  rear.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rear;
  ctx.fillRect(880, 120, 80, 180);

  for (const w of CAR.wheels) {
    ctx.lineWidth = 9;
    ctx.strokeStyle = `rgba(0,0,0,${a * 0.5})`;
    ctx.beginPath();
    ctx.arc(w.x, w.y, CAR.archR + 2, Math.PI * 1.02, Math.PI * 1.98);
    ctx.stroke();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = `rgba(255,255,255,${0.2 * (1 - a * 0.4)})`;
    ctx.beginPath();
    ctx.arc(w.x, w.y, CAR.archR + 6, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  }
}

/* ---------- Riflessi mobili dei neon ---------- */

const BARS: { x: number; w: number; a: number; speed: number }[] = [
  { x: 120, w: 150, a: 0.3, speed: 1 },
  { x: 430, w: 56, a: 0.26, speed: 1.25 },
  { x: 560, w: 210, a: 0.24, speed: 0.8 },
  { x: 900, w: 90, a: 0.3, speed: 1.1 }
];

/**
 * Riflessi dei tubi al neon che scorrono sulla fiancata.
 * `shift` −1…1 sposta i riflessi (mouse, scroll, deriva lenta).
 */
export function drawShine(ctx: CanvasRenderingContext2D, shift: number, strength = 1): void {
  if (strength <= 0) return;
  const p = carPaths();
  ctx.save();
  ctx.clip(p.body);
  ctx.clip(p.sky);
  shineBars(ctx, shift, strength, 300);
  ctx.restore();
}

/** Stessi riflessi, più tenui, sui vetri. */
export function drawGlassShine(ctx: CanvasRenderingContext2D, shift: number, strength = 1): void {
  if (strength <= 0) return;
  const p = carPaths();
  ctx.save();
  ctx.clip(p.glass);
  shineBars(ctx, shift * 0.7 + 0.2, strength * 0.75, 240);
  ctx.restore();
}

function shineBars(ctx: CanvasRenderingContext2D, shift: number, strength: number, travel: number): void {
  // Barre inclinate: x' = x − 0.42·y
  ctx.transform(1, 0, -0.42, 1, 0, 0);
  const span = CAR.w + 400;
  for (const b of BARS) {
    let x = b.x + shift * travel * b.speed + 96;
    x = ((x % span) + span) % span - 120;
    const g = ctx.createLinearGradient(x, 0, x + b.w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.16, `rgba(255,255,255,${b.a * strength * 0.55})`);
    g.addColorStop(0.24, `rgba(255,255,255,${b.a * strength})`);
    g.addColorStop(0.7, `rgba(255,255,255,${b.a * strength * 0.5})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, b.w, CAR.h);
  }
}

/* ---------- Dettagli fissi: vetri, modanature, fari, giunti ---------- */

export function drawParts(ctx: CanvasRenderingContext2D): void {
  const p = carPaths();

  // Parabrezza e lunotto visti di taglio
  ctx.fillStyle = '#0a0c0f';
  ctx.fill(p.windshield);
  ctx.fill(p.rearScreen);

  // Vetri laterali
  const glass = ctx.createLinearGradient(0, 54, 0, 134);
  glass.addColorStop(0, '#46535f');
  glass.addColorStop(0.42, '#1a222b');
  glass.addColorStop(1, '#07090c');
  ctx.fillStyle = glass;
  ctx.fill(p.glass);
  ctx.save();
  ctx.clip(p.glass);
  // interno appena intuibile: poggiatesta e volante
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  for (const [x, y] of [[512, 104], [668, 108]]) {
    ctx.beginPath();
    ctx.roundRect(x, y, 30, 40, 9);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(430, 124, 9, 20, -0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.4;
  ctx.strokeStyle = '#06070a';
  ctx.stroke(p.glass);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.moveTo(372, 129.5);
  ctx.lineTo(834, 129.5);
  ctx.stroke();

  // Montanti neri lucidi
  for (const k of ['bPillar', 'cPillar'] as const) {
    ctx.fillStyle = '#07080a';
    ctx.fill(p[k]);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(582, 60);
  ctx.lineTo(577, 128);
  ctx.stroke();

  // Plastiche scure: minigonna, presa d'aria, estrattore
  const plastic = ctx.createLinearGradient(0, 228, 0, 290);
  plastic.addColorStop(0, '#22252a');
  plastic.addColorStop(1, '#0b0c0e');
  ctx.fillStyle = plastic;
  ctx.fill(p.skirt);
  ctx.fill(p.intake);
  ctx.fill(p.splitter);
  ctx.fill(p.diffuser);
  ctx.fillStyle = '#0c0d0f';
  ctx.fill(p.vent);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(316, 271.5);
  ctx.bezierCurveTo(440, 265.5, 600, 265.5, 706, 271.5);
  ctx.stroke();
  // lamelle della presa d'aria
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1.4;
  for (const y of [246, 255]) {
    ctx.beginPath();
    ctx.moveTo(58 + (y - 246) * 0.4, y);
    ctx.lineTo(124 + (y - 246) * 0.5, y + 4);
    ctx.stroke();
  }

  // Giunti di porte e paraurti
  ctx.lineCap = 'round';
  for (const k of ['doorFront', 'doorMid', 'doorRear', 'bumperFront', 'bumperRear'] as const) {
    ctx.lineWidth = 1.7;
    ctx.strokeStyle = 'rgba(0,0,0,0.58)';
    ctx.stroke(p[k]);
    ctx.save();
    ctx.translate(1.4, 0);
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.stroke(p[k]);
    ctx.restore();
  }

  // Maniglie
  for (const [x, y] of [[520, 160], [664, 162]]) {
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.roundRect(x, y, 36, 7.5, 3.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(x + 3, y, 30, 1.2);
  }

  // Sportello carburante
  ctx.strokeStyle = 'rgba(0,0,0,0.38)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(866, 196, 11, 0, Math.PI * 2);
  ctx.stroke();

  // Specchietto nero lucido
  const mirror = ctx.createLinearGradient(0, 108, 0, 134);
  mirror.addColorStop(0, '#3a3f46');
  mirror.addColorStop(0.5, '#101215');
  mirror.addColorStop(1, '#050506');
  ctx.fillStyle = mirror;
  ctx.fill(p.mirror);

  // Fari spenti
  const head = ctx.createLinearGradient(54, 0, 140, 0);
  head.addColorStop(0, '#dfe8f2');
  head.addColorStop(0.5, '#8f9aa6');
  head.addColorStop(1, '#2a2f36');
  ctx.fillStyle = head;
  ctx.fill(p.headlight);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.stroke(p.headlight);

  const tail = ctx.createLinearGradient(866, 0, 952, 0);
  tail.addColorStop(0, '#4a0611');
  tail.addColorStop(1, '#a30d25');
  ctx.fillStyle = tail;
  ctx.fill(p.taillight);
  ctx.stroke(p.taillight);
}

/* ---------- Ruote ---------- */

/** Ruota in proporzioni reali: spalla alta, cerchio in lega a cinque razze sdoppiate. */
export function drawWheel(ctx: CanvasRenderingContext2D, cx: number, cy: number, spin = 0): void {
  const R = CAR.wheelR;
  const rim = 41;
  ctx.save();
  ctx.translate(cx, cy);

  // Pneumatico: battistrada scuro, spalla appena più chiara
  const tyre = ctx.createRadialGradient(0, 0, rim, 0, 0, R);
  tyre.addColorStop(0, '#1e2023');
  tyre.addColorStop(0.5, '#17181b');
  tyre.addColorStop(0.86, '#0f1012');
  tyre.addColorStop(1, '#060607');
  ctx.fillStyle = tyre;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  // luce sulla spalla in alto e cordolo salvacerchio
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath();
  ctx.arc(0, 0, R - 3.5, Math.PI * 1.14, Math.PI * 1.86);
  ctx.stroke();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  for (const r of [R - 8, rim + 3.2]) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Canale del cerchio, in ombra
  const barrel = ctx.createRadialGradient(0, -6, 4, 0, 0, rim);
  barrel.addColorStop(0, '#2a2d31');
  barrel.addColorStop(1, '#0b0c0d');
  ctx.fillStyle = barrel;
  ctx.beginPath();
  ctx.arc(0, 0, rim, 0, Math.PI * 2);
  ctx.fill();

  // Disco freno e pinza, in parte nascosti dalle razze
  const disc = ctx.createRadialGradient(0, 0, 9, 0, 0, 27);
  disc.addColorStop(0, '#4b5057');
  disc.addColorStop(0.55, '#7d848b');
  disc.addColorStop(1, '#545a61');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(0, 0, 27, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 0.6;
  for (const r of [16, 22]) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#b30f29';
  ctx.beginPath();
  ctx.arc(0, 0, 30, -Math.PI * 0.33, -Math.PI * 0.08);
  ctx.arc(0, 0, 17, -Math.PI * 0.08, -Math.PI * 0.33, true);
  ctx.closePath();
  ctx.fill();

  // Razze sdoppiate: partono vicine dal mozzo e si aprono verso il bordo
  ctx.rotate(spin);
  const alloy = ctx.createLinearGradient(0, -rim, 0, rim);
  alloy.addColorStop(0, '#f6f7f8');
  alloy.addColorStop(0.45, '#c3c9ce');
  alloy.addColorStop(1, '#858c93');
  for (let i = 0; i < 5; i++) {
    const base = (i * Math.PI * 2) / 5 - Math.PI / 2;
    for (const side of [-1, 1]) {
      const a0 = base + side * 0.13;
      const a1 = base + side * 0.27;
      const x0 = Math.cos(a0) * 8;
      const y0 = Math.sin(a0) * 8;
      const x1 = Math.cos(a1) * (rim - 1.2);
      const y1 = Math.sin(a1) * (rim - 1.2);
      const len = Math.hypot(x1 - x0, y1 - y0);
      const nx = -(y1 - y0) / len;
      const ny = (x1 - x0) / len;
      ctx.fillStyle = alloy;
      ctx.beginPath();
      ctx.moveTo(x0 + nx * 2.7, y0 + ny * 2.7);
      ctx.lineTo(x1 + nx * 2, y1 + ny * 2);
      ctx.lineTo(x1 - nx * 2, y1 - ny * 2);
      ctx.lineTo(x0 - nx * 2.7, y0 - ny * 2.7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }

  // Bordo del cerchio
  ctx.strokeStyle = alloy;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.arc(0, 0, rim - 1.4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(0, 0, rim + 0.5, 0, Math.PI * 2);
  ctx.stroke();

  // Mozzo con i bulloni
  ctx.fillStyle = alloy;
  ctx.beginPath();
  ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a1c1f';
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5 + 0.3;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 6.4, Math.sin(a) * 6.4, 1.15, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#121315';
  ctx.beginPath();
  ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c8102e';
  ctx.beginPath();
  ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/* ---------- Fari accesi ---------- */

export function drawLamps(ctx: CanvasRenderingContext2D, on: number): void {
  if (on <= 0) return;
  const p = carPaths();
  ctx.save();
  ctx.globalAlpha = Math.min(on, 1);
  ctx.fillStyle = '#ffffff';
  ctx.fill(p.headlight);
  ctx.fillStyle = '#ff2742';
  ctx.fill(p.taillight);
  ctx.globalCompositeOperation = 'lighter';
  const head = ctx.createRadialGradient(80, 187, 0, 80, 187, 52);
  head.addColorStop(0, 'rgba(240,247,255,0.9)');
  head.addColorStop(0.3, 'rgba(205,228,255,0.3)');
  head.addColorStop(1, 'rgba(205,228,255,0)');
  ctx.fillStyle = head;
  ctx.fillRect(20, 130, 130, 120);
  // riflesso orizzontale della lente
  const flare = ctx.createLinearGradient(-30, 0, 190, 0);
  flare.addColorStop(0, 'rgba(210,230,255,0)');
  flare.addColorStop(0.45, 'rgba(225,238,255,0.5)');
  flare.addColorStop(1, 'rgba(210,230,255,0)');
  ctx.fillStyle = flare;
  ctx.fillRect(-30, 185.5, 220, 2);
  const tail = ctx.createRadialGradient(912, 161, 0, 912, 161, 46);
  tail.addColorStop(0, 'rgba(255,70,90,0.8)');
  tail.addColorStop(0.35, 'rgba(255,25,55,0.26)');
  tail.addColorStop(1, 'rgba(255,25,55,0)');
  ctx.fillStyle = tail;
  ctx.fillRect(860, 110, 110, 100);
  ctx.restore();
}
