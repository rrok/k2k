/**
 * Motore "aerografo": pistola a spruzzo, nuvola di vernice e goccioline.
 * Condiviso da intro, hero, titoli verniciati e spruzzo con il mouse.
 */

/** Geometria di public/spray-gun.svg: l'ugello punta verso sinistra. */
export const GUN = { w: 200, h: 220, tipX: 9, tipY: 104 };

/** Direzione di spruzzo verso il basso a sinistra (35° sotto l'orizzontale). */
export const SPRAY_ANGLE = Math.PI - (35 * Math.PI) / 180;

type Rgb = [number, number, number];

const PALETTE: { rgb: Rgb; weight: number }[] = [
  { rgb: [200, 16, 46], weight: 0.62 },
  { rgb: [255, 60, 105], weight: 0.24 },
  { rgb: [255, 170, 190], weight: 0.14 }
];

export function gaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * 0.5;
}

/* ---------- Pistola ---------- */

let gunImage: HTMLImageElement | undefined;
const gunCache = new Map<number, HTMLCanvasElement>();

function gunImg(): HTMLImageElement {
  if (!gunImage) {
    gunImage = new Image();
    gunImage.src = 'spray-gun.svg';
  }
  return gunImage;
}

/** Precarica l'immagine della pistola. */
export function preloadGun(): void {
  gunImg();
}

/** Pistola rasterizzata una volta per ogni altezza (l'SVG ridisegnato a ogni frame costa). */
function gunRaster(height: number): HTMLCanvasElement | null {
  const img = gunImg();
  if (!img.complete || !img.naturalWidth) return null;
  const key = Math.round(height / 4) * 4;
  let c = gunCache.get(key);
  if (!c) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const s = (key / GUN.h) * dpr;
    c = document.createElement('canvas');
    c.width = Math.ceil(GUN.w * s);
    c.height = Math.ceil(GUN.h * s);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    gunCache.set(key, c);
  }
  return c;
}

/** Disegna la pistola con l'ugello in (x, y), orientata a spruzzare verso `angle`. */
export function drawGun(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, height: number, alpha = 1): void {
  const raster = gunRaster(height);
  if (!raster || alpha <= 0) return;
  const s = height / GUN.h;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle - Math.PI);
  ctx.drawImage(raster, -GUN.tipX * s, -GUN.tipY * s, GUN.w * s, GUN.h * s);
  ctx.restore();
}

/** Punto dell'impugnatura nell'SVG (dove la mano stringe la pistola). */
const GRIP = { x: 148, y: 150 };

/**
 * Disegna la pistola impugnata in (gx, gy), che spruzza verso `angle`.
 * `facing` 1 = rivolta a destra (specchiata), -1 = a sinistra.
 */
export function drawGunGrip(ctx: CanvasRenderingContext2D, gx: number, gy: number, angle: number, height: number, facing: number, alpha = 1): void {
  const raster = gunRaster(height);
  if (!raster || alpha <= 0) return;
  const s = height / GUN.h;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(gx, gy);
  if (facing > 0) {
    ctx.rotate(angle);
    ctx.scale(-1, 1);
  } else {
    ctx.rotate(angle - Math.PI);
  }
  ctx.drawImage(raster, -GRIP.x * s, -GRIP.y * s, GUN.w * s, GUN.h * s);
  ctx.restore();
}

/** Posizione dell'ugello per una pistola impugnata in (gx, gy). */
export function gunTip(gx: number, gy: number, angle: number, height: number, facing: number): { x: number; y: number } {
  const s = height / GUN.h;
  const lx = (GUN.tipX - GRIP.x) * s * (facing > 0 ? -1 : 1);
  const ly = (GUN.tipY - GRIP.y) * s;
  const a = facing > 0 ? angle : angle - Math.PI;
  return {
    x: gx + lx * Math.cos(a) - ly * Math.sin(a),
    y: gy + lx * Math.sin(a) + ly * Math.cos(a)
  };
}

/* ---------- Verniciatore ---------- */

/** Stato del verniciatore: piedi in (x, y), scala h (h = 100 unità di disegno). */
export interface Painter {
  x: number;
  y: number;
  h: number;
  facing: number;
  /** Fase del passo (radianti). */
  phase: number;
  /** Direzione di spruzzo. */
  aim: number;
  /** In aria durante un salto. */
  airborne: boolean;
  alpha: number;
}

const PAINTER_HAND = { x: 24, y: -66 };

function painterBob(p: Painter): number {
  return p.airborne ? 0 : Math.abs(Math.cos(p.phase)) * 2;
}

/** Mano che impugna la pistola, in coordinate schermo. */
export function painterHand(p: Painter): { x: number; y: number } {
  const s = p.h / 100;
  return { x: p.x + p.facing * PAINTER_HAND.x * s, y: p.y - (painterBob(p) - PAINTER_HAND.y) * s };
}

/** Ugello della pistola del verniciatore. */
export function painterTip(p: Painter): { x: number; y: number } {
  const hand = painterHand(p);
  return gunTip(hand.x, hand.y, p.aim, p.h * 0.36, p.facing);
}

/**
 * Verniciatore di carrozzeria: tuta blu con cappuccio, semimaschera con due
 * filtri, occhiali protettivi, guanti in nitrile, scarpe antinfortunistiche.
 * Unità di disegno: piedi a y = 0, testa a y ≈ -112.
 */
export function drawPainter(ctx: CanvasRenderingContext2D, p: Painter): void {
  if (p.alpha <= 0) return;
  const s = p.h / 100;
  const swing = p.airborne ? 0.5 : Math.sin(p.phase);
  const bob = painterBob(p);
  const suit = '#22427e';
  const suitDark = '#172f5c';
  const glove = '#3f7ae0';

  ctx.save();
  ctx.globalAlpha = p.alpha;
  ctx.translate(p.x, p.y - bob * s);
  ctx.scale(p.facing * s, s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (!p.airborne) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, bob + 1, 16, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Gambe (coscia + stinco con ginocchio piegato) e scarpe
  const leg = (hx: number, a: number, color: string) => {
    const kx = hx + Math.sin(a) * 21;
    const ky = -46 + Math.cos(a) * 21;
    const bend = Math.max(0, -a) * 0.9 + 0.08;
    const fx = kx + Math.sin(a - bend) * 23;
    const fy = ky + Math.cos(a - bend) * 23 - (p.airborne ? 6 : 0);
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(hx, -46);
    ctx.lineTo(kx, ky);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    ctx.fillStyle = '#16181b';
    ctx.beginPath();
    ctx.roundRect(fx - 5, fy - 3, 14, 6, 3);
    ctx.fill();
  };
  leg(-3, swing * 0.45, suitDark);

  // Braccio posteriore che oscilla
  ctx.strokeStyle = suitDark;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-4, -84);
  ctx.lineTo(-6 - swing * 6, -68);
  ctx.lineTo(-5 - swing * 10, -54);
  ctx.stroke();
  ctx.fillStyle = glove;
  ctx.beginPath();
  ctx.arc(-5 - swing * 10, -53, 4, 0, Math.PI * 2);
  ctx.fill();

  leg(3, -swing * 0.45, suit);

  // Busto
  ctx.fillStyle = suit;
  ctx.beginPath();
  ctx.roundRect(-13, -92, 26, 50, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(3, -90);
  ctx.lineTo(3, -46);
  ctx.stroke();
  // Toppa K2K e striscia catarifrangente
  ctx.fillStyle = '#c8102e';
  ctx.fillRect(5, -84, 7, 5);
  ctx.fillStyle = 'rgba(220,230,240,0.75)';
  ctx.fillRect(-13, -52, 26, 3);
  // Schizzi di vernice
  ctx.fillStyle = 'rgba(200,16,46,0.85)';
  ctx.beginPath();
  ctx.arc(-6, -70, 1.6, 0, Math.PI * 2);
  ctx.arc(8, -62, 2, 0, Math.PI * 2);
  ctx.arc(-2, -48, 1.3, 0, Math.PI * 2);
  ctx.fill();

  // Cappuccio
  ctx.fillStyle = suitDark;
  ctx.beginPath();
  ctx.ellipse(0, -104, 12.5, 13.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Viso
  ctx.fillStyle = '#e8b896';
  ctx.beginPath();
  ctx.ellipse(5, -104, 7.5, 9.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Occhiali protettivi
  ctx.fillStyle = 'rgba(160, 215, 245, 0.85)';
  ctx.strokeStyle = '#1d2024';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(1, -110, 12, 6, 2.5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(3, -109, 3, 1.4);
  // Semimaschera con filtri
  ctx.fillStyle = '#eceff2';
  ctx.beginPath();
  ctx.roundRect(2, -102, 11, 9, 4);
  ctx.fill();
  ctx.fillStyle = '#b5517f';
  ctx.beginPath();
  ctx.arc(12, -96.5, 3.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8c3a60';
  ctx.beginPath();
  ctx.arc(12, -96.5, 1.6, 0, Math.PI * 2);
  ctx.fill();

  // Braccio anteriore teso verso la pistola
  ctx.strokeStyle = suit;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(4, -84);
  ctx.lineTo(14, -72);
  ctx.lineTo(PAINTER_HAND.x, PAINTER_HAND.y);
  ctx.stroke();
  ctx.restore();

  // Pistola e guanto sopra il braccio
  const hand = painterHand(p);
  drawGunGrip(ctx, hand.x, hand.y, p.aim, p.h * 0.36, p.facing, p.alpha);
  ctx.save();
  ctx.globalAlpha = p.alpha;
  ctx.fillStyle = glove;
  ctx.beginPath();
  ctx.arc(hand.x, hand.y, 4.2 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ---------- Particelle ---------- */

const spriteCache = new Map<string, HTMLCanvasElement>();

/** Sfera morbida pre-renderizzata per la nebbia. */
function sprite([r, g, b]: Rgb): HTMLCanvasElement {
  const key = `${r},${g},${b}`;
  let c = spriteCache.get(key);
  if (!c) {
    const size = 64;
    c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d')!;
    const grad = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grad.addColorStop(0.35, `rgba(${r},${g},${b},0.55)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = grad;
    x.fillRect(0, 0, size, size);
    spriteCache.set(key, c);
  }
  return c;
}

function pickColor(): Rgb {
  let n = Math.random();
  for (const p of PALETTE) {
    if ((n -= p.weight) <= 0) return p.rgb;
  }
  return PALETTE[0].rgb;
}

export interface Particle {
  kind: 'mist' | 'drop' | 'splat';
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rMax: number;
  age: number;
  life: number;
  alpha: number;
  sprite?: HTMLCanvasElement;
  color: string;
  /** Distanza da percorrere prima di "atterrare" (solo goccioline). */
  dist: number;
  travelled: number;
  owner?: unknown;
}

export interface EmitOptions {
  /** Distanza ugello → superficie, in px. */
  reach: number;
  mist?: number;
  drops?: number;
  /** Moltiplicatore della dimensione delle nuvole. */
  cloud?: number;
  /** Moltiplicatore dell'opacità della nebbia. */
  density?: number;
  owner?: unknown;
}

export class SprayCloud {
  readonly items: Particle[] = [];

  constructor(private cap = 1800) {}

  get alive(): boolean {
    return this.items.length > 0;
  }

  emit(x: number, y: number, angle: number, o: EmitOptions): void {
    if (this.items.length > this.cap) return;
    const mist = o.mist ?? 2;
    const drops = o.drops ?? 10;
    const cloud = o.cloud ?? 1;
    const density = o.density ?? 1;

    for (let i = 0; i < mist; i++) {
      // Velocità molto varie: la nebbia si distribuisce lungo tutto il cono
      const a = angle + gaussian() * 0.36;
      const f = Math.random();
      const speed = o.reach * (0.5 + f * 2.6);
      this.items.push({
        kind: 'mist',
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: 2 + Math.random() * 3,
        rMax: o.reach * (0.08 + f * 0.32 + Math.random() * 0.08) * cloud,
        age: 0,
        life: 0.8 + Math.random() * 0.8,
        alpha: (0.06 + Math.random() * 0.08) * density,
        sprite: sprite(pickColor()),
        color: '',
        dist: 0,
        travelled: 0,
        owner: o.owner
      });
    }

    for (let i = 0; i < drops; i++) {
      const a = angle + gaussian() * 0.3;
      const speed = o.reach * (3 + Math.random() * 1.5);
      const tone = Math.random();
      this.items.push({
        kind: 'drop',
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: 0.5 + Math.random() * 1.6,
        rMax: 0,
        age: 0,
        life: 1.5,
        alpha: 1,
        color: tone < 0.75 ? `rgba(200,16,46,${0.55 + Math.random() * 0.4})` : `rgba(150,8,30,${0.6 + Math.random() * 0.4})`,
        dist: o.reach * (0.85 + Math.abs(gaussian()) * 0.5),
        travelled: 0,
        owner: o.owner
      });
    }
  }

  /** Goccia ferma che sbiadisce (vernice depositata). */
  splat(x: number, y: number, r: number, color: string, life = 2.6): void {
    if (this.items.length > this.cap * 1.5) return;
    this.items.push({ kind: 'splat', x, y, vx: 0, vy: 0, r, rMax: r, age: 0, life, alpha: 1, color, dist: 0, travelled: 0 });
  }

  update(dt: number, onLand?: (p: Particle) => void, push?: { x: number; y: number; radius: number }): void {
    const drag = Math.exp(-dt * 2.6);
    const list = this.items;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) continue;

      if (p.kind === 'mist') {
        p.vx *= drag;
        p.vy = p.vy * drag - 6 * dt; // la nebbia sale leggermente
        if (push) {
          const dx = p.x - push.x;
          const dy = p.y - push.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < push.radius * push.radius && d2 > 1) {
            const d = Math.sqrt(d2);
            const f = (1 - d / push.radius) * 900 * dt;
            p.vx += (dx / d) * f;
            p.vy += (dy / d) * f;
          }
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.r += (p.rMax - p.r) * Math.min(1, dt * 2.4);
      } else if (p.kind === 'drop') {
        const sx = p.vx * dt;
        const sy = p.vy * dt;
        p.x += sx;
        p.y += sy;
        p.travelled += Math.sqrt(sx * sx + sy * sy);
        if (p.travelled >= p.dist) {
          onLand?.(p);
          continue;
        }
      }
      list[w++] = p;
    }
    list.length = w;
  }

  draw(ctx: CanvasRenderingContext2D, mistComposite: GlobalCompositeOperation = 'source-over'): void {
    ctx.globalCompositeOperation = mistComposite;
    for (const p of this.items) {
      if (p.kind !== 'mist' || !p.sprite) continue;
      const t = p.age / p.life;
      const env = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
      ctx.globalAlpha = p.alpha * env;
      ctx.drawImage(p.sprite, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const p of this.items) {
      if (p.kind === 'mist') continue;
      const t = p.age / p.life;
      ctx.globalAlpha = p.kind === 'splat' ? Math.min(1, (1 - t) * 2.5) : 1;
      ctx.fillStyle = p.color;
      if (p.r > 1.4) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
    }
    ctx.globalAlpha = 1;
  }
}
