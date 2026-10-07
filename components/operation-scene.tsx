"use client";

import { useEffect, useRef } from "react";
import { pulseStop, type QuestionStatus } from "@/lib/question-statuses";

type Three = typeof import("three");

type SceneHandle = {
  setStops(stops: QuestionStatus[]): void;
  dispose(): void;
};

/** Los colores de la paleta de `globals.css`, en hex para WebGL. */
const INK = 0x20211f;
const LINE = 0xd6d5cc;
const STATUS_COLOR: Record<QuestionStatus, number> = {
  passed: 0x603be4,
  cut: 0xa43428,
  unknown: 0x8d8e86,
  skipped: 0xd6d5cc,
};

const STOP_POINTS: [number, number, number][] = [
  [-4, 0, 0.6],
  [-2, 0.4, -0.5],
  [0, 0, 0.5],
  [2, -0.4, -0.5],
  [4, 0, 0.6],
];

/** Segundos que tarda el pulso entre dos paradas y la pausa antes de volver a salir. */
const LEG_SECONDS = 0.7;
const HOLD_SECONDS = 2.6;

/**
 * El recorrido de la operación en 3D: las cuatro preguntas y la firma. Un pulso sale
 * de la entrada y se detiene en la primera parada que no pasó. Es decorativo: toda la
 * información está en el resultado escrito al lado. Sin WebGL no se dibuja nada.
 */
export function OperationScene({ stops }: { stops: QuestionStatus[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const stopsRef = useRef(stops);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    let cancelled = false;
    import("three")
      .then((THREE) => {
        if (cancelled) return;
        handleRef.current = createScene(THREE, host, stopsRef.current);
      })
      .catch(() => {
        host.dataset.webgl = "no";
      });
    return () => {
      cancelled = true;
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    stopsRef.current = stops;
    handleRef.current?.setStops(stops);
  }, [stops]);

  return (
    <div
      ref={hostRef}
      className="operation-scene"
      aria-hidden="true"
      data-testid="recorrido"
      data-recorrido={stops.join(",")}
    />
  );
}

function createScene(THREE: Three, host: HTMLDivElement, initial: QuestionStatus[]): SceneHandle {
  let renderer: InstanceType<Three["WebGLRenderer"]>;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    host.dataset.webgl = "no";
    return { setStops() {}, dispose() {} };
  }
  host.dataset.webgl = "si";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  host.dataset.movimiento = reduced ? "reducido" : "animado";

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const target = new THREE.Vector3(0, -0.1, 0);

  const curve = new THREE.CatmullRomCurve3(
    STOP_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  );
  const stopT = (index: number) => index / (STOP_POINTS.length - 1);

  // El trazo de tinta y su sombra sobre el papel.
  const track = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 240, 0.016, 8, false),
    new THREE.MeshBasicMaterial({ color: INK }),
  );
  scene.add(track);
  const shadowCurve = new THREE.CatmullRomCurve3(
    STOP_POINTS.map(([x, , z]) => new THREE.Vector3(x, -1.25, z)),
  );
  const shadow = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(shadowCurve.getPoints(160)),
    new THREE.LineDashedMaterial({ color: LINE, dashSize: 0.12, gapSize: 0.1 }),
  );
  shadow.computeLineDistances();
  scene.add(shadow);

  // La retícula de puntos del papel, para que el recorrido tenga piso.
  const dots: number[] = [];
  for (let x = -6; x <= 6; x += 0.5) {
    for (let z = -3; z <= 3; z += 0.5) dots.push(x, -1.3, z);
  }
  const grid = new THREE.Points(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(dots, 3),
    ),
    new THREE.PointsMaterial({ color: LINE, size: 0.035 }),
  );
  scene.add(grid);

  // Las paradas: esfera de color de estado y aro de tinta. La firma es un octaedro.
  const nodes = STOP_POINTS.map(([x, y, z], index) => {
    const isSign = index === STOP_POINTS.length - 1;
    const body = new THREE.Mesh(
      isSign ? new THREE.OctahedronGeometry(0.36) : new THREE.SphereGeometry(0.28, 32, 16),
      new THREE.MeshBasicMaterial({ color: STATUS_COLOR.skipped }),
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.012, 8, 64),
      new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.9 }),
    );
    const stem = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -0.3, 0),
        new THREE.Vector3(0, -1.25 - y, 0),
      ]),
      new THREE.LineBasicMaterial({ color: LINE }),
    );
    const group = new THREE.Group();
    group.add(body, ring, stem);
    group.position.set(x, y, z);
    scene.add(group);
    return { group, body, ring, color: new THREE.Color(STATUS_COLOR.skipped) };
  });

  // El tramo recorrido se pinta de violeta hasta donde llegó el pulso.
  const trail = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({ color: STATUS_COLOR.passed }),
  );
  scene.add(trail);
  let trailUntil = -1;
  function setTrail(t: number) {
    const rounded = Math.round(t * 200) / 200;
    if (rounded === trailUntil) return;
    trailUntil = rounded;
    trail.geometry.dispose();
    if (rounded <= 0.002) {
      trail.geometry = new THREE.BufferGeometry();
      return;
    }
    const samples = Array.from({ length: 41 }, (_, i) => curve.getPoint((rounded * i) / 40));
    trail.geometry = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(samples),
      120,
      0.034,
      8,
      false,
    );
  }

  const pulse = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 24, 12),
    new THREE.MeshBasicMaterial({ color: STATUS_COLOR.passed }),
  );
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 24, 12),
    new THREE.MeshBasicMaterial({ color: STATUS_COLOR.passed, transparent: true, opacity: 0.18 }),
  );
  scene.add(pulse, halo);

  let stops = initial;
  let stopAt = pulseStop(stops);
  let startedAt = performance.now();

  function setStops(next: QuestionStatus[]) {
    stops = next;
    stopAt = pulseStop(stops);
    startedAt = performance.now();
    if (reduced) {
      paint(stopAt, 0, true);
      renderer.render(scene, camera);
    }
  }

  /** Dibuja el pulso en `progress` (en paradas) y pinta lo que ya alcanzó. */
  function paint(progress: number, time: number, snap: boolean) {
    const t = stopT(progress);
    const point = curve.getPoint(t);
    pulse.position.copy(point);
    halo.position.copy(point);
    halo.scale.setScalar(1 + 0.25 * Math.sin(time * 4));
    setTrail(t);

    nodes.forEach((node, index) => {
      const reached = progress >= index - 0.001;
      const status = reached ? stops[index] : "skipped";
      node.color.set(STATUS_COLOR[status]);
      const material = node.body.material as InstanceType<Three["MeshBasicMaterial"]>;
      if (snap) material.color.copy(node.color);
      else material.color.lerp(node.color, 0.18);
      const alive = status !== "skipped";
      (node.ring.material as InstanceType<Three["MeshBasicMaterial"]>).opacity = alive ? 0.9 : 0.25;
      const beat = index === stopAt && status !== "passed" ? 1 + 0.12 * Math.sin(time * 5) : 1;
      node.group.scale.setScalar(beat);
      node.body.rotation.y = time * 0.6;
    });

    const pulseColor = progress >= stopAt ? STATUS_COLOR[stops[stopAt]] : STATUS_COLOR.passed;
    (pulse.material as InstanceType<Three["MeshBasicMaterial"]>).color.set(pulseColor);
    (halo.material as InstanceType<Three["MeshBasicMaterial"]>).color.set(pulseColor);
  }

  // Distancia que hace entrar el recorrido entero a lo ancho, según la proporción.
  let distance = 9.2;
  function placeCamera(time: number) {
    const swing = reduced ? 0.35 : Math.sin(time * 0.18);
    camera.position.set(swing * 2.2, 2.4 + Math.cos(time * 0.13) * 0.3, distance);
    camera.lookAt(target);
  }

  function resize() {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const halfWidth = 5.4;
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    distance = Math.max(9.2, halfWidth / (Math.tan(halfFov) * camera.aspect));
    camera.updateProjectionMatrix();
    if (reduced) {
      placeCamera(0);
      renderer.render(scene, camera);
    }
  }

  let frame = 0;
  let visible = true;
  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    if (!visible || document.hidden) return;
    const time = now / 1000;
    const elapsed = (now - startedAt) / 1000;
    const travel = Math.max(stopAt, 0.0001) * LEG_SECONDS;
    if (elapsed > travel + HOLD_SECONDS) startedAt = now;
    const linear = Math.min(Math.max(elapsed / travel, 0), 1);
    const eased = 1 - Math.pow(1 - linear, 3);
    paint(eased * stopAt, time, false);
    placeCamera(time);
    renderer.render(scene, camera);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
  });
  visibility.observe(host);
  resize();

  if (reduced) {
    placeCamera(0);
    paint(stopAt, 0, true);
    renderer.render(scene, camera);
  } else {
    frame = requestAnimationFrame(tick);
  }

  return {
    setStops,
    dispose() {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibility.disconnect();
      scene.traverse((object) => {
        const mesh = object as Partial<InstanceType<Three["Mesh"]>>;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
      });
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
