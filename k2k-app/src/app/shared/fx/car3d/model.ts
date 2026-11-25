import {
  Box3, BufferAttribute, CircleGeometry, Group, Material, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Vector3
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Il SUV del minigioco: "Mercedes Benz GLS 580" di Joses (L.F.Contop),
 * licenza CC BY 4.0 — vedi public/models/CREDITS.txt.
 * Il file ha solo geometria e nomi dei materiali: i materiali veri li
 * assegniamo qui, riconoscendo carrozzeria, vetri, fari e cromature dal nome.
 */

const URL = 'models/suv.glb';
/** Lunghezza reale dell'auto, in metri. */
const LENGTH = 5.21;

export type PartKind = 'body' | 'trim' | 'solid';

export interface Wheels {
  /** Assi anteriore e posteriore (x), altezza del mozzo (= raggio), faccia esterna (z). */
  front: number;
  rear: number;
  radius: number;
  outer: number;
}

export interface CarModel {
  root: Group;
  min: Vector3;
  max: Vector3;
  /** Carrozzeria: fondo grigio che si vernicia. */
  body: Mesh[];
  /** Vetri, fari, cromature, plastiche: si sporcano di vernice e si mascherano. */
  trim: Mesh[];
  /** Gomme, interni, sottoscocca: non si verniciano. */
  solid: Mesh[];
  /** Copriruota di carta, visibili con la mascheratura. */
  covers: Mesh[];
  wheels: Wheels;
}

interface Look {
  kind: PartKind;
  make: (base: MeshStandardMaterial) => Material;
}

const std = (o: ConstructorParameters<typeof MeshStandardMaterial>[0]) => () => new MeshStandardMaterial(o);
const chrome = (roughness: number) => (base: MeshStandardMaterial) =>
  new MeshStandardMaterial({ color: base.color, metalness: 1, roughness });

/** Aspetto di ogni materiale del file, riconosciuto dal nome. */
const LOOKS: [RegExp, Look][] = [
  [/^Polar_White/, {
    kind: 'body',
    // fondo opaco: vernice, lucido e trasparente arrivano dall'atlante
    make: () => new MeshPhysicalMaterial({ color: 0x686d73, roughness: 0.83, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06 })
  }],
  [/^WindowsTint/, { kind: 'trim', make: std({ color: 0x07090c, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.86 }) }],
  [/^Lights_Glass/, { kind: 'trim', make: std({ color: 0xdfe6ee, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.32 }) }],
  [/^Color_A07/, { kind: 'trim', make: std({ color: 0xb00d22, roughness: 0.22, emissive: 0x3a0008 }) }],
  [/^Color_A08/, { kind: 'trim', make: std({ color: 0x7a0a18, roughness: 0.22, emissive: 0x220005 }) }],
  [/^Color_M01/, { kind: 'trim', make: chrome(0.12) }],
  [/^Color_M02/, { kind: 'trim', make: chrome(0.2) }],
  [/^Color_M03/, { kind: 'trim', make: chrome(0.3) }],
  [/^Color_M04/, { kind: 'trim', make: chrome(0.35) }],
  [/^Color_M08/, { kind: 'trim', make: std({ color: 0x17181b, roughness: 0.5, metalness: 0.3 }) }],
  [/^ChromeBlack/, { kind: 'trim', make: std({ color: 0x08090a, roughness: 0.18, metalness: 0.6 }) }],
  [/^Grille/, { kind: 'trim', make: std({ color: 0x08090a, roughness: 0.45, metalness: 0.5 }) }],
  [/wire_/, { kind: 'trim', make: std({ color: 0x2a2c30, roughness: 0.55, metalness: 0.2 }) }],
  [/^Tyres/, { kind: 'solid', make: std({ color: 0x0b0c0d, roughness: 0.92, metalness: 0 }) }],
  [/^Interior/, { kind: 'solid', make: std({ color: 0x101113, roughness: 0.9, metalness: 0 }) }],
  [/^UnderCarriage/, { kind: 'solid', make: std({ color: 0x0b0b0c, roughness: 0.95, metalness: 0 }) }],
  // targhe
  [/^material$/, { kind: 'trim', make: std({ color: 0xe9ebed, roughness: 0.5, metalness: 0 }) }]
];

export async function loadCar(): Promise<CarModel> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(URL);

  // Nel file: X larghezza, Y alto, Z lunghezza con il muso a +Z. Qui: muso a −X.
  const root = new Group();
  root.add(gltf.scene);
  root.rotation.y = -Math.PI / 2;
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root);
  const size = box.getSize(new Vector3());
  const s = LENGTH / size.x;
  root.scale.setScalar(s);
  root.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
  root.updateMatrixWorld(true);

  const model: CarModel = {
    root, body: [], trim: [], solid: [], covers: [],
    min: new Vector3(), max: new Vector3(),
    wheels: { front: 0, rear: 0, radius: 0.4, outer: 1 }
  };
  let tyres: Mesh | undefined;
  root.traverse(o => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const base = mesh.material as MeshStandardMaterial;
    const look = LOOKS.find(([re]) => re.test(base.name))?.[1] ?? { kind: 'trim' as PartKind, make: std({ color: base.color, roughness: 0.5 }) };
    const material = look.make(base);
    material.name = base.name;
    mesh.material = material;
    base.dispose();
    // le posizioni compresse (interi) diventano decimali: servono al calcolo dei colpi
    const pos = mesh.geometry.getAttribute('position');
    if (!(pos.array instanceof Float32Array) || pos.normalized) {
      const arr = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        arr[i * 3] = pos.getX(i);
        arr[i * 3 + 1] = pos.getY(i);
        arr[i * 3 + 2] = pos.getZ(i);
      }
      mesh.geometry.setAttribute('position', new BufferAttribute(arr, 3));
    }
    model[look.kind].push(mesh);
    if (/^Tyres/.test(base.name)) tyres = mesh;
  });

  const all = new Box3().setFromObject(root);
  model.min.copy(all.min);
  model.max.copy(all.max);

  // Ruote: dedotte dall'ingombro delle gomme
  if (tyres) {
    const t = new Box3().setFromObject(tyres);
    const radius = (t.max.y - t.min.y) / 2;
    model.wheels = { front: t.min.x + radius, rear: t.max.x - radius, radius, outer: t.max.z };
  }
  const paper = new MeshStandardMaterial({ color: 0xcdbb8c, roughness: 0.95, metalness: 0 });
  const disc = new CircleGeometry(model.wheels.radius * 1.04, 40);
  for (const x of [model.wheels.front, model.wheels.rear]) {
    for (const side of [1, -1]) {
      const cover = new Mesh(disc, paper);
      cover.position.set(x, model.wheels.radius, (model.wheels.outer + 0.012) * side);
      if (side < 0) cover.rotation.y = Math.PI;
      cover.updateMatrixWorld(true);
      model.covers.push(cover);
    }
  }
  return model;
}
