import {
  CanvasTexture, CylinderGeometry, DoubleSide, Group, LinearFilter, Material, Matrix3, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, NeutralToneMapping, NoColorSpace, Object3D, PerspectiveCamera, PlaneGeometry, PMREMGenerator,
  Raycaster, Scene, ShaderChunk, ShaderMaterial, SRGBColorSpace, TorusGeometry, Vector2, Vector3, WebGLRenderer,
  WebGLRenderTarget
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { hexRgb } from '../car-art';
import { SPRAY_ANGLE, SprayCloud, drawGun, preloadGun } from '../spray-engine';
import { drawCloth, drawPad } from '../tools-art';
import { ATLAS_GLSL, PaintAtlas } from './atlas';
import { CarModel, loadCar } from './model';
import { CarSkin, SkinMasks, SkinStats } from './skin';

export type Tool = 'spray' | 'sand' | 'wipe' | 'polish';

/** Cosa succede mentre si lavora: serve al verniciatore per commentare. */
export type StudioEvent = 'spray' | 'drip' | 'grain' | 'sand' | 'wipe' | 'polish' | 'bare' | 'rotate';

/** Raggio della passata (metri) e velocità con cui agisce ogni attrezzo. */
const TOOLS: Record<Tool, { radius: number; rate: number }> = {
  spray: { radius: 0.16, rate: 15 },
  sand: { radius: 0.14, rate: 10 },
  wipe: { radius: 0.19, rate: 14 },
  polish: { radius: 0.18, rate: 8 }
};

interface Hit {
  p: Vector3;
  n: Vector3;
  /** Superficie "in piedi": lì la vernice in eccesso cola. */
  steep: boolean;
}

const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

/**
 * Cabina 3D del minigioco: un SUV su pedana, luci da studio, camera che gli
 * gira attorno. Trascinando sull'auto si usa l'attrezzo scelto, trascinando
 * fuori (o con due dita) si ruota. Disegna solo quando qualcosa cambia.
 */
export class PaintStudio {
  tool: Tool = 'spray';
  color = '#c8102e';
  /** Moltiplicatore della larghezza della passata. */
  size = 1;
  onEvent: (e: StudioEvent) => void = () => {};

  readonly skin: CarSkin;

  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(24, 1, 0.1, 100);
  private atlas: PaintAtlas;
  private uniforms: Record<string, { value: unknown }>;
  private mapTex: CanvasTexture;
  private matTex: CanvasTexture;
  private ray = new Raycaster();
  private ndc = new Vector2();
  /** Ciò che il puntatore può colpire: carrozzeria, finiture, gomme e copriruota. */
  private targets: Object3D[] = [];

  private target = new Vector3(0, 0.82, 0);
  private az = -0.62;
  private el = 0.24;
  private zoom = 1;
  private fit = 9;
  private width = 1;
  private height = 1;
  private framed = false;
  private insets = { top: 0, bottom: 0 };

  private fx: CanvasRenderingContext2D;
  private cloud = new SprayCloud(900);
  private pointers = new Map<number, { x: number; y: number; touch: boolean }>();
  private mode: 'idle' | 'tool' | 'orbit' = 'idle';
  private aim = { x: 0, y: 0, touch: false };
  private lastHit: Hit | null = null;
  private pinch = 0;
  private spin = 0;
  private toolAlpha = 0;
  private raf = 0;
  private last = 0;
  private disposed = false;
  private unlisten: (() => void)[] = [];

  /** Scarica il modello e accende la cabina. */
  static async create(canvas: HTMLCanvasElement, overlay: HTMLCanvasElement, compact: boolean): Promise<PaintStudio> {
    return new PaintStudio(canvas, overlay, compact, await loadCar());
  }

  private constructor(
    private canvas: HTMLCanvasElement, private overlay: HTMLCanvasElement, compact: boolean, private model: CarModel
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    // tonemapping "neutro": i colori della vernice restano quelli scelti
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.fx = overlay.getContext('2d')!;
    preloadGun();

    // Luci da cabina: pannelli luminosi riflessi su carrozzeria, vetri e cromature
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    this.scene.environmentIntensity = 0.7;
    pmrem.dispose();

    this.atlas = new PaintAtlas(model.min, model.max);
    const width = compact ? 768 : 1024;
    const height = Math.round((width * this.atlas.h) / this.atlas.w / 2) * 2;
    this.skin = new CarSkin(this.renderMasks(width, height));

    this.mapTex = this.texture(this.skin.map);
    this.mapTex.colorSpace = SRGBColorSpace;
    this.matTex = this.texture(this.skin.mat);
    this.matTex.colorSpace = NoColorSpace;
    const w = model.wheels;
    this.uniforms = {
      ...this.atlas.uniforms(),
      k2kMap: { value: this.mapTex },
      k2kMat: { value: this.matTex },
      // ruote: asse anteriore, asse posteriore, raggio, da dove cominciano in larghezza
      k2kWheel: { value: [w.front, w.rear, w.radius, w.outer - 0.42] }
    };

    for (const mesh of model.body) this.paintable(mesh, false);
    for (const mesh of model.trim) this.paintable(mesh, true);
    for (const mesh of [...model.body, ...model.trim, ...model.solid]) {
      // gli interni non si possono colpire: davanti c'è sempre un vetro
      if (/^Interior/.test((mesh.material as Material).name)) continue;
      mesh.geometry.boundsTree = new MeshBVH(mesh.geometry);
      mesh.raycast = acceleratedRaycast;
    }
    this.ray.firstHitOnly = true;

    const covers = new Group();
    covers.add(...model.covers);
    this.scene.add(model.root, covers, this.floor());
    this.retarget();
    this.listen();
  }

  /* ---------- comandi ---------- */

  resize(width: number, height: number): void {
    if (!width || !height) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.overlay.width = Math.ceil(width * dpr);
    this.overlay.height = Math.ceil(height * dpr);
    this.fx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.reframe();
    this.invalidate();
  }

  /** Spazio occupato dai comandi sopra e sotto (px): l'auto viene centrata in quello libero. */
  setInsets(top: number, bottom: number): void {
    if (Math.abs(top - this.insets.top) < 1 && Math.abs(bottom - this.insets.bottom) < 1) return;
    this.insets = { top, bottom };
    this.reframe();
    this.invalidate();
  }

  /** Ruota la camera attorno all'auto (radianti). */
  orbit(dAz: number, dEl: number): void {
    this.az += dAz;
    this.el = clamp(this.el + dEl, 0.03, 1.2);
    this.invalidate();
  }

  dolly(factor: number): void {
    this.zoom = clamp(this.zoom * factor, 0.4, 1.3);
    this.invalidate();
  }

  setMasking(on: boolean): void {
    this.skin.setMasking(on);
    this.retarget();
    this.invalidate();
  }

  reset(): void {
    this.skin.reset();
    this.retarget();
    this.invalidate();
  }

  stats(): SkinStats {
    return this.skin.stats();
  }

  /** Foto dell'auto così com'è, su sfondo scuro. */
  snapshot(): HTMLCanvasElement {
    this.draw();
    const out = document.createElement('canvas');
    out.width = this.canvas.width;
    out.height = this.canvas.height;
    const ctx = out.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, out.height);
    g.addColorStop(0, '#0b0b0e');
    g.addColorStop(0.6, '#17171c');
    g.addColorStop(1, '#0b0b0d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(this.canvas, 0, 0);
    return out;
  }

  invalidate(): void {
    if (this.raf || this.disposed) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unlisten.forEach(fn => fn());
    this.scene.traverse(o => {
      const m = o as Mesh;
      m.geometry?.dispose();
      const mat = m.material;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach(x => x.dispose());
    });
    this.mapTex.dispose();
    this.matTex.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }

  /* ---------- ciclo ---------- */

  private frame = (now: number): void => {
    this.raf = 0;
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;

    const working = this.mode === 'tool';
    if (working) this.work(dt);
    else this.lastHit = null;
    const flowing = this.skin.update(dt);
    this.cloud.update(dt);
    this.toolAlpha = clamp(this.toolAlpha + (working ? dt * 8 : -dt * 5), 0, 1);
    this.spin += dt * 34;

    this.draw();
    this.drawOverlay();

    if (working || flowing || this.cloud.alive || this.toolAlpha > 0) {
      this.raf = requestAnimationFrame(this.frame);
    }
  };

  private draw(): void {
    if (this.skin.consume()) {
      this.mapTex.needsUpdate = true;
      this.matTex.needsUpdate = true;
    }
    const d = this.fit * this.zoom;
    const c = Math.cos(this.el);
    this.camera.position.set(
      this.target.x + Math.sin(this.az) * c * d,
      this.target.y + Math.sin(this.el) * d,
      this.target.z + Math.cos(this.az) * c * d
    );
    this.camera.lookAt(this.target);
    this.renderer.render(this.scene, this.camera);
  }

  /** Obiettivo stretto (24°) e camera lontana: poca distorsione anche vista di tre quarti. */
  private reframe(): void {
    const { width: w, height: h } = this;
    const aspect = w / h;
    const narrow = (12 * Math.PI) / 180;
    // su schermi verticali i 24° valgono in orizzontale e l'auto parte più di muso
    const portrait = aspect < 0.85;
    if (!this.framed) {
      this.framed = true;
      if (portrait) {
        this.az = -1.02;
        this.el = 0.28;
      }
    }
    const vHalf = portrait ? Math.atan(Math.tan(narrow) / aspect) : narrow;
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    const free = Math.max(h - this.insets.top - this.insets.bottom, h * 0.3);
    this.fit = Math.max((portrait ? 2.5 : 3.35) / Math.sin(hHalf), (1.3 / Math.tan(vHalf)) * (h / free));
    this.camera.fov = (vHalf * 360) / Math.PI;
    this.camera.aspect = aspect;
    // l'immagine sale o scende per centrare l'auto tra i comandi
    this.camera.setViewOffset(w, h, 0, (this.insets.bottom - this.insets.top) / 2, w, h);
  }

  /* ---------- attrezzi ---------- */

  /** Applica l'attrezzo nel punto mirato, unendo le passate tra un fotogramma e l'altro. */
  private work(dt: number): void {
    const hit = this.pick(this.aim.x, this.aim.y);
    if (!hit) {
      this.lastHit = null;
      return;
    }
    const spec = TOOLS[this.tool];
    const radius = spec.radius * this.size;
    const amount = 1 - Math.exp(-dt * spec.rate);
    const from = this.lastHit;
    // tra due punti vicini si riempie il tratto, così il movimento veloce non lascia buchi
    const gap = from ? from.p.distanceTo(hit.p) : 0;
    const steps = from && gap < radius * 8 ? Math.max(1, Math.ceil(gap / (radius * 0.6))) : 1;
    const step: Hit = { p: new Vector3(), n: new Vector3(), steep: hit.steep };
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      if (from && steps > 1) {
        step.p.lerpVectors(from.p, hit.p, k);
        step.n.lerpVectors(from.n, hit.n, k).normalize();
      } else {
        step.p.copy(hit.p);
        step.n.copy(hit.n);
      }
      this.apply(step, radius, amount / Math.sqrt(steps), dt / steps);
    }
    this.lastHit = hit;
  }

  /** Una passata in un punto: tocca tutte le proiezioni verso cui è rivolta la superficie. */
  private apply(hit: Hit, radius: number, amount: number, seconds: number): void {
    const ru = radius / this.atlas.w;
    const rv = radius / this.atlas.h;
    this.atlas.touch(hit.p, hit.n).forEach((t, i) => {
      // commenti e colature nascono solo dalla proiezione principale
      const main = i === 0;
      this.skin.focus(this.atlas.rect(t.id));
      switch (this.tool) {
        case 'spray': {
          const bad = this.skin.spray(t.u, t.v, ru, rv, this.color, amount, main && hit.steep, main ? seconds : 0);
          if (main) this.onEvent(bad ?? 'spray');
          break;
        }
        case 'sand':
          this.skin.sand(t.u, t.v, ru, rv, amount);
          if (main) this.onEvent('sand');
          break;
        case 'wipe':
          if (this.skin.wipe(t.u, t.v, ru, rv, amount) && main) this.onEvent('wipe');
          break;
        case 'polish': {
          const had = this.skin.polish(t.u, t.v, ru, rv, amount);
          if (main) this.onEvent(had ? 'polish' : 'bare');
          break;
        }
      }
      this.skin.release();
    });
  }

  /** Punto dell'auto sotto il puntatore, se si può verniciare. */
  private pick(x: number, y: number): Hit | null {
    this.ndc.set((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const h = this.ray.intersectObjects(this.targets, false)[0];
    if (!h?.face) return null;
    const kind = h.object.userData['kind'];
    if (kind !== 'body' && kind !== 'trim') return null; // gomme e copriruota
    if (kind === 'trim' && this.inWheel(h.point)) return null; // cerchi
    const n = h.face.normal.clone().applyNormalMatrix(h.object.userData['normalMatrix']).normalize();
    if (n.dot(this.ray.ray.direction) > 0) n.negate();
    return { p: h.point.clone(), n, steep: Math.abs(n.y) < 0.72 };
  }

  private inWheel(p: Vector3): boolean {
    const w = this.model.wheels;
    const dx = Math.min(Math.abs(p.x - w.front), Math.abs(p.x - w.rear));
    return Math.hypot(dx, p.y - w.radius) < w.radius * 1.05 && Math.abs(p.z) > w.outer - 0.42;
  }

  /** Con la mascheratura le ruote hanno il copriruota di carta, che ferma lo spruzzo. */
  private retarget(): void {
    const masked = this.skin.masking;
    for (const cover of this.model.covers) cover.visible = masked;
    this.targets = [];
    this.model.root.traverse(o => {
      const mesh = o as Mesh;
      if (mesh.isMesh && mesh.geometry.boundsTree) this.targets.push(mesh);
    });
    if (masked) this.targets.push(...this.model.covers);
  }

  /* ---------- attrezzo e nebbia sopra la scena ---------- */

  private drawOverlay(): void {
    const ctx = this.fx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.cloud.draw(ctx, 'lighter');
    if (this.toolAlpha <= 0) return;
    const { x, y } = this.aim;
    const unit = clamp(Math.min(this.width, this.height) * 0.05, 22, 44);
    const a = this.toolAlpha;

    // mirino: mostra dove arriva l'attrezzo (utile col dito, che copre la visuale)
    ctx.strokeStyle = `rgba(255,255,255,${0.55 * a})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, unit * 0.62 * this.size, 0, Math.PI * 2);
    ctx.stroke();

    if (this.tool === 'spray') {
      const reach = unit * 2.3;
      const gx = x - Math.cos(SPRAY_ANGLE) * reach;
      const gy = y - Math.sin(SPRAY_ANGLE) * reach;
      if (this.mode === 'tool') {
        this.cloud.emit(gx, gy, SPRAY_ANGLE, { reach, mist: 2, drops: 5, cloud: 0.9, tint: hexRgb(this.color) });
      }
      drawGun(ctx, gx, gy, SPRAY_ANGLE, unit * 3.1, a);
    } else if (this.tool === 'sand') {
      drawPad(ctx, x, y, unit * 0.62, this.spin, a, '#aeb4ba', '#6f757c');
    } else if (this.tool === 'polish') {
      drawPad(ctx, x, y, unit * 0.7, this.spin, a, '#f6cf4d', '#c08d0c');
    } else {
      drawCloth(ctx, x, y, unit * 0.72, this.spin * 0.3, a);
    }
  }

  /* ---------- puntatore ---------- */

  private listen(): void {
    const el = this.canvas;
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    /** Col dito l'attrezzo lavora un po' sopra il polpastrello, così si vede. */
    const aimAt = (p: { x: number; y: number; touch: boolean }) => {
      this.aim = { x: p.x, y: p.y - (p.touch ? 56 : 0), touch: p.touch };
    };

    const down = (e: PointerEvent) => {
      if (e.button > 0) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const p = { ...local(e), touch: e.pointerType === 'touch' };
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 1) {
        aimAt(p);
        // sull'auto si lavora, fuori si ruota (vale sia il dito sia il mirino sopra il dito)
        this.mode = this.onCar(this.aim.x, this.aim.y) || this.onCar(p.x, p.y) ? 'tool' : 'orbit';
      } else {
        this.mode = 'orbit';
        this.pinch = this.spread();
      }
      this.invalidate();
    };

    const move = (e: PointerEvent) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const p = { ...local(e), touch: prev.touch };
      this.pointers.set(e.pointerId, p);
      if (this.mode === 'tool') {
        aimAt(p);
      } else if (this.mode === 'orbit') {
        const n = this.pointers.size;
        this.orbit((-(p.x - prev.x) / this.width) * 4 / n, ((p.y - prev.y) / this.height) * 1.8 / n);
        if (n > 1) {
          const s = this.spread();
          if (this.pinch > 0 && s > 0) this.dolly(this.pinch / s);
          this.pinch = s;
        }
        this.onEvent('rotate');
      }
      this.invalidate();
    };

    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (!this.pointers.size) this.mode = 'idle';
      else this.pinch = this.spread();
      this.invalidate();
    };

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.dolly(Math.exp(e.deltaY * 0.0012));
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    this.unlisten.push(
      () => el.removeEventListener('pointerdown', down),
      () => el.removeEventListener('pointermove', move),
      () => el.removeEventListener('pointerup', up),
      () => el.removeEventListener('pointercancel', up),
      () => el.removeEventListener('wheel', wheel)
    );
  }

  /** Distanza tra le prime due dita (per lo zoom). */
  private spread(): number {
    const [a, b] = Array.from(this.pointers.values());
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /** Il puntatore è sopra l'auto? */
  private onCar(x: number, y: number): boolean {
    this.ndc.set((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    return this.ray.intersectObjects(this.targets, false).length > 0;
  }

  /* ---------- materiali e maschere ---------- */

  private texture(source: HTMLCanvasElement): CanvasTexture {
    const t = new CanvasTexture(source);
    t.flipY = false;
    // niente mipmap: si aggiornano di continuo e ai bordi delle proiezioni farebbero aloni
    t.generateMipmaps = false;
    t.minFilter = t.magFilter = LinearFilter;
    return t;
  }

  /**
   * Aggancia l'atlante della vernice a un materiale: colore, ruvidità e lucido
   * di ogni punto arrivano dalle proiezioni verso cui è rivolto.
   * `trim`: vetri, fari e finiture, dove la vernice si sovrappone al materiale vero.
   */
  private paintable(mesh: Mesh, trim: boolean): void {
    const material = mesh.material as MeshStandardMaterial;
    mesh.userData['kind'] = trim ? 'trim' : 'body';
    mesh.userData['normalMatrix'] = new Matrix3().getNormalMatrix(mesh.matrixWorld);
    if (trim) material.defines = { ...(material.defines ?? {}), K2K_TRIM: '' };
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vK2kPos;\nvarying vec3 vK2kN;')
        .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvK2kN = inverseTransformDirection(transformedNormal, viewMatrix);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvK2kPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vK2kPos;
          varying vec3 vK2kN;
          uniform sampler2D k2kMap;
          uniform sampler2D k2kMat;
          uniform vec4 k2kWheel;
          ${ATLAS_GLSL}
          vec3 k2kM = vec3(0.0);`
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          {
            vec3 kw = k2kWeights(normalize(vK2kN));
            vec2 ks = k2kSide(vK2kPos);
            vec2 kt = k2kTop(vK2kPos);
            vec2 ke = k2kEnd(vK2kPos);
            vec3 kc = kw.z * texture2D(k2kMap, ks).rgb + kw.y * texture2D(k2kMap, kt).rgb + kw.x * texture2D(k2kMap, ke).rgb;
            k2kM = kw.z * texture2D(k2kMat, ks).rgb + kw.y * texture2D(k2kMat, kt).rgb + kw.x * texture2D(k2kMat, ke).rgb;
            float kSum = kw.x + kw.y + kw.z;
            #ifdef K2K_TRIM
              // le ruote non si verniciano
              vec2 kd = vec2(min(abs(vK2kPos.x - k2kWheel.x), abs(vK2kPos.x - k2kWheel.y)), vK2kPos.y - k2kWheel.z);
              if (dot(kd, kd) < k2kWheel.z * k2kWheel.z * 1.1 && abs(vK2kPos.z) > k2kWheel.w) k2kM.b = 0.0;
              diffuseColor.rgb = mix(diffuseColor.rgb, kc / max(kSum, 1e-4), k2kM.b);
              diffuseColor.a = max(diffuseColor.a, k2kM.b);
            #else
              // carrozzeria: l'atlante contiene già il fondo, quindi si usa così com'è
              diffuseColor.rgb = kc + (1.0 - kSum) * diffuseColor.rgb;
              k2kM.b = kSum;
            #endif
          }`
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, k2kM.g, k2kM.b);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.14 * k2kM.r, k2kM.b);')
        .replace(
          '#include <lights_physical_fragment>',
          ShaderChunk.lights_physical_fragment.replace('material.clearcoat = clearcoat;', 'material.clearcoat = clearcoat * k2kM.r;')
        );
    };
  }

  /**
   * Fotografa l'auto dalle cinque direzioni dell'atlante per sapere, punto per
   * punto, se lì fuori c'è carrozzeria, una parte da mascherare o altro.
   */
  private renderMasks(width: number, height: number): SkinMasks {
    const chart = { value: 0 };
    const make = (kind: number) => new ShaderMaterial({
      side: DoubleSide,
      uniforms: { ...this.atlas.uniforms(), uChart: chart, uKind: { value: kind } },
      vertexShader: `
        ${ATLAS_GLSL}
        uniform int uChart;
        varying vec3 vN;
        void main() {
          vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
          vN = mat3(modelMatrix) * normal;
          vec3 L = k2kMax - k2kMin;
          vec2 uv;
          float d;
          if (uChart == 0) { uv = vec2(p.x - k2kMin.x, k2kMax.y - p.y); d = (k2kMax.z - p.z) / L.z; }
          else if (uChart == 1) { uv = vec2(p.x - k2kMin.x, k2kMax.y - p.y + k2kOff.x); d = (p.z - k2kMin.z) / L.z; }
          else if (uChart == 2) { uv = vec2(p.x - k2kMin.x, p.z - k2kMin.z + k2kOff.y); d = (k2kMax.y - p.y) / L.y; }
          else if (uChart == 3) { uv = vec2(p.z - k2kMin.z, k2kMax.y - p.y + k2kOff.z); d = (p.x - k2kMin.x) / L.x; }
          else { uv = vec2(p.z - k2kMin.z + k2kOff.w, k2kMax.y - p.y + k2kOff.z); d = (k2kMax.x - p.x) / L.x; }
          uv *= k2kInv;
          gl_Position = vec4(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, d * 1.98 - 0.99, 1.0);
        }`,
      fragmentShader: `
        ${ATLAS_GLSL}
        uniform int uChart;
        uniform int uKind;
        varying vec3 vN;
        void main() {
          vec3 n = normalize(vN);
          vec3 w = k2kWeights(vec3(n.x, abs(n.y), n.z));
          float facing = uChart < 2 ? w.z : (uChart == 2 ? w.y : w.x);
          if (uKind == 0) gl_FragColor = vec4(facing > 0.4 ? 1.0 : 0.0, 0.0, 0.0, 1.0);
          else if (uKind == 1) gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
          else gl_FragColor = vec4(0.0, 0.0, 1.0, 1.0);
        }`
    });
    const kinds = [make(0), make(1), make(2)];
    const scene = new Scene();
    const add = (meshes: Mesh[], kind: number) => {
      for (const src of meshes) {
        const m = new Mesh(src.geometry, kinds[kind]);
        m.matrixAutoUpdate = false;
        m.matrix.copy(src.matrixWorld);
        m.frustumCulled = false;
        scene.add(m);
      }
    };
    add(this.model.body, 0);
    add(this.model.trim, 1);
    add(this.model.solid, 2);

    const rt = new WebGLRenderTarget(width, height);
    const r = this.renderer;
    const auto = r.autoClear;
    r.autoClear = false;
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    for (chart.value = 0; chart.value < 5; chart.value++) r.render(scene, this.camera);
    const raw = new Uint8Array(width * height * 4);
    r.readRenderTargetPixels(rt, 0, 0, width, height, raw);
    r.setRenderTarget(null);
    r.autoClear = auto;
    rt.dispose();
    kinds.forEach(k => k.dispose());

    // la lettura parte dal basso: si capovolgono le righe
    const data = new Uint8Array(raw.length);
    const row = width * 4;
    for (let y = 0; y < height; y++) data.set(raw.subarray((height - 1 - y) * row, (height - y) * row), y * row);
    return { width, height, data };
  }

  /** Pedana opaca con ombra di contatto. */
  private floor(): Group {
    const group = new Group();
    const disc = new Mesh(
      new CylinderGeometry(3.8, 3.8, 0.06, 72),
      new MeshStandardMaterial({ color: 0x1a1b20, roughness: 0.92, metalness: 0, envMapIntensity: 0.45 })
    );
    disc.position.y = -0.03;
    const ring = new Mesh(new TorusGeometry(3.7, 0.012, 8, 96), new MeshBasicMaterial({ color: 0xffffff }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.004;

    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.translate(128, 64);
    ctx.scale(1, 0.5);
    const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 126);
    g.addColorStop(0, 'rgba(0,0,0,0.92)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 126, 0, Math.PI * 2);
    ctx.fill();
    const shadow = new Mesh(
      new PlaneGeometry(6.6, 3.2),
      new MeshBasicMaterial({ map: new CanvasTexture(c), transparent: true, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.006;
    group.add(disc, ring, shadow);
    return group;
  }
}
