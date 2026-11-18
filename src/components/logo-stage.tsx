"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { Canvas, createPortal, useThree, type ThreeEvent } from "@react-three/fiber";
import { Decal, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export type ProductId = "shirt" | "laptop";

const MODEL_URL: Record<ProductId, string> = {
  shirt: "/models/shirt.glb",
  laptop: "/models/laptop.glb",
};

useGLTF.preload(MODEL_URL.shirt);
useGLTF.preload(MODEL_URL.laptop);

export function LogoStage({
  product,
  mode,
  logoUrl,
  logoAspect,
  logoScale,
  offset,
  dragging,
  locked = false,
  onOffset,
  onDragChange,
  resetToken,
}: {
  product: ProductId;
  mode: "3d" | "photo";
  logoUrl: string | null;
  logoAspect: number;
  logoScale: number;
  offset: { x: number; y: number };
  dragging: boolean;
  locked?: boolean;
  onOffset: (next: { x: number; y: number }) => void;
  onDragChange: (dragging: boolean) => void;
  resetToken: number;
}) {
  return (
    <Canvas
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
      camera={{ position: [0, 0.08, 4.15], fov: 30 }}
      className="h-full w-full"
    >
      <color attach="background" args={["#efefed"]} />
      <hemisphereLight args={["#ffffff", "#e4e2dc", 0.95]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 5, 6]} intensity={1.45} />
      <directionalLight position={[-4, 2, 2]} intensity={0.35} />
      <Suspense fallback={null}>
        <ProductModel
          key={product}
          product={product}
          logoUrl={logoUrl}
          logoAspect={logoAspect}
          logoScale={logoScale}
          offset={offset}
          locked={locked}
          onOffset={onOffset}
          onDragChange={onDragChange}
        />
      </Suspense>
      <CameraRig
        mode={mode}
        product={product}
        dragging={dragging}
        resetToken={resetToken}
      />
    </Canvas>
  );
}

function CameraRig({
  mode,
  product,
  dragging,
  resetToken,
}: {
  mode: "3d" | "photo";
  product: ProductId;
  dragging: boolean;
  resetToken: number;
}) {
  const { camera } = useThree();
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;

  useEffect(() => {
    const preset =
      product === "laptop"
        ? new THREE.Vector3(1.35, 2.15, 2.35)
        : new THREE.Vector3(0, 0.05, 4.15);
    const framed = mode === "photo" ? new THREE.Vector3(0, product === "laptop" ? 3.1 : 0.02, product === "laptop" ? 0.2 : 4.4) : preset;
    camera.position.copy(framed);
    camera.lookAt(0, 0, 0);
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [camera, controls, mode, product, resetToken]);

  return (
    <OrbitControls
      makeDefault
      enablePan={false}
      enableDamping
      enabled={mode === "3d" && !dragging}
      minDistance={2.4}
      maxDistance={8}
    />
  );
}

function ProductModel({
  product,
  logoUrl,
  logoAspect,
  logoScale,
  offset,
  locked,
  onOffset,
  onDragChange,
}: {
  product: ProductId;
  logoUrl: string | null;
  logoAspect: number;
  logoScale: number;
  offset: { x: number; y: number };
  locked: boolean;
  onOffset: (next: { x: number; y: number }) => void;
  onDragChange: (dragging: boolean) => void;
}) {
  const gltf = useGLTF(MODEL_URL[product]);
  const scene = useMemo(() => prepareScene(gltf.scene, product), [gltf.scene, product]);
  const [fit, setFit] = useState<number>(1);

  useLayoutEffect(() => {
    const parent = scene.parent;
    parent?.remove(scene);

    scene.position.set(0, 0, 0);
    scene.rotation.set(0, product === "shirt" ? Math.PI : 0, 0);
    scene.scale.set(1, 1, 1);
    scene.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z) || 1;
    const scale = 1.7 / span;

    scene.scale.setScalar(scale);
    scene.position.copy(center).multiplyScalar(-scale);
    scene.updateMatrixWorld(true);

    parent?.add(scene);
    setFit(scale);
  }, [scene, product]);

  const tilt: [number, number, number] = product === "laptop" ? [-Math.PI / 2, 0.42, 0] : [0, 0, 0];
  const place = useRef<LogoPlaceApi | null>(null);

  return (
    <group rotation={tilt}>
      <primitive
        object={scene}
        onPointerDown={(event: ThreeEvent<PointerEvent>) => {
          if (!locked) place.current?.down(event);
        }}
        onPointerMove={(event: ThreeEvent<PointerEvent>) => {
          if (!locked) place.current?.move(event);
        }}
        onPointerUp={() => {
          if (!locked) place.current?.up();
        }}
      />
      <LogoDecal
        api={place}
        scene={scene}
        product={product}
        fit={fit}
        logoUrl={logoUrl}
        logoAspect={logoAspect}
        logoScale={logoScale}
        offset={offset}
        onOffset={onOffset}
        onDragChange={onDragChange}
      />
    </group>
  );
}

function prepareScene(source: THREE.Group, product: ProductId) {
  const clone = source.clone(true);
  clone.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const sourceMaterial = mesh.material;
    const list = Array.isArray(sourceMaterial) ? sourceMaterial : [sourceMaterial];
    const cloned = list.map((material) => {
      const next = material.clone();
        next.side = THREE.DoubleSide;
        if (product === "shirt" && next instanceof THREE.MeshStandardMaterial) {
          next.color.set("#ffffff");
          next.roughness = 0.72;
          next.metalness = 0;
        }
        return next;
    });
    mesh.material = Array.isArray(sourceMaterial) ? cloned : cloned[0];
  });
  return clone;
}

type LogoPlaceApi = {
  down: (event: ThreeEvent<PointerEvent>) => void;
  move: (event: ThreeEvent<PointerEvent>) => void;
  up: () => void;
};

type Spot = { x: number; y: number; z: number; nx: number; ny: number; nz: number };

function LogoDecal({
  api,
  scene,
  product,
  fit,
  logoUrl,
  logoAspect,
  logoScale,
  offset,
  onOffset,
  onDragChange,
}: {
  api: MutableRefObject<LogoPlaceApi | null>;
  scene: THREE.Group;
  product: ProductId;
  fit: number;
  logoUrl: string | null;
  logoAspect: number;
  logoScale: number;
  offset: { x: number; y: number };
  onOffset: (next: { x: number; y: number }) => void;
  onDragChange: (dragging: boolean) => void;
}) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [preview, setPreview] = useState<Spot | null>(null);
  const previewRef = useRef<Spot | null>(null);
  const dragging = useRef(false);
  const mesh = useMemo(() => findLogoMesh(scene, product), [scene, product]);

  useEffect(() => {
    if (!logoUrl) {
      setTexture(null);
      return;
    }
    let alive = true;
    const loader = new THREE.TextureLoader();
    loader.load(logoUrl, (next) => {
      next.colorSpace = THREE.SRGBColorSpace;
      next.anisotropy = 8;
      if (!alive) {
        next.dispose();
        return;
      }
      setTexture((prev) => {
        prev?.dispose();
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [logoUrl]);

  const bounds = mesh?.geometry.boundingBox ?? null;
  const meshRef = useRef<THREE.Mesh>(null);
  if (mesh) meshRef.current = mesh;

  api.current = {
    down: (event) => {
      if (!mesh || !bounds || !texture) return;
      event.stopPropagation();
      dragging.current = true;
      onDragChange(true);
      const spot = spotFromHit(event, product);
      previewRef.current = spot;
      setPreview(spot);
    },
    move: (event) => {
      if (!dragging.current) return;
      event.stopPropagation();
      const spot = spotFromHit(event, product);
      previewRef.current = spot;
      setPreview(spot);
    },
    up: () => {
      const spot = previewRef.current;
      if (!dragging.current || !mesh || !bounds || !spot) {
        dragging.current = false;
        previewRef.current = null;
        setPreview(null);
        onDragChange(false);
        return;
      }
      dragging.current = false;
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const anchorY = product === "shirt" ? bounds.min.y + size.y * 0.62 : center.y;
      const worldPerLocal = (mesh.scale.x || 1) * fit;
      const limitX = size.x * 0.34 * worldPerLocal;
      const limitY = size.y * 0.3 * worldPerLocal;
      onOffset({
        x: THREE.MathUtils.clamp((spot.x - center.x) * worldPerLocal, -limitX, limitX),
        y: THREE.MathUtils.clamp((spot.y - anchorY) * worldPerLocal, -limitY, limitY),
      });
      previewRef.current = null;
      setPreview(null);
      onDragChange(false);
    },
  };

  if (!mesh || !texture || !bounds) return null;

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const worldPerLocal = (mesh.scale.x || 1) * fit;
  const height = size.y * (product === "shirt" ? 0.16 : 0.22) * logoScale;
  const width = height * logoAspect;
  const depth = Math.max(size.z * 0.55, height * 0.45);
  const position: [number, number, number] =
    product === "shirt"
      ? [center.x + offset.x / worldPerLocal, bounds.min.y + size.y * 0.62 + offset.y / worldPerLocal, bounds.min.z]
      : [center.x + offset.x / worldPerLocal, center.y + offset.y / worldPerLocal, bounds.max.z];

  if (preview) {
    return createPortal(
      <LogoPreview texture={texture} spot={preview} width={width} height={height} flipX={product === "shirt"} />,
      mesh,
    );
  }

  return createPortal(
    <Decal
      mesh={meshRef as RefObject<THREE.Mesh>}
      position={position}
      rotation={product === "shirt" ? [0, Math.PI, 0] : [0, 0, 0]}
      scale={[width, height, depth]}
      map={texture}
      depthTest
      polygonOffsetFactor={-8}
    />,
    mesh,
  );
}

function LogoPreview({
  texture,
  spot,
  width,
  height,
  flipX,
}: {
  texture: THREE.Texture;
  spot: Spot;
  width: number;
  height: number;
  flipX: boolean;
}) {
  const normal = new THREE.Vector3(spot.nx, spot.ny, spot.nz).normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  const position = new THREE.Vector3(spot.x, spot.y, spot.z).addScaledVector(normal, Math.min(width, height) * 0.04);
  return (
    <mesh position={position} quaternion={quaternion} scale={[flipX ? -1 : 1, 1, 1]} raycast={() => null}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} depthWrite={false} polygonOffset polygonOffsetFactor={-4} />
    </mesh>
  );
}

function spotFromHit(event: ThreeEvent<PointerEvent>, product: ProductId): Spot {
  const mesh = event.object as THREE.Mesh;
  const local = mesh.worldToLocal(event.point.clone());
  const normal = event.face?.normal.clone() ?? new THREE.Vector3(0, 0, product === "shirt" ? -1 : 1);
  if (product === "shirt" && normal.z > 0) normal.negate();
  if (product === "laptop" && normal.z < 0) normal.negate();
  return { x: local.x, y: local.y, z: local.z, nx: normal.x, ny: normal.y, nz: normal.z };
}

function findLogoMesh(scene: THREE.Object3D, product: ProductId): THREE.Mesh | null {
  const matches: THREE.Mesh[] = [];
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (product === "laptop" && mesh.name !== "lid") return;
    matches.push(mesh);
  });
  const found = matches[0] ?? null;
  found?.geometry.computeBoundingBox();
  return found;
}
