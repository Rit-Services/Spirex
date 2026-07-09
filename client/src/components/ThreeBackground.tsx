// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function ThreeBackground() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth;
    const H = mount.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000);
    camera.position.set(0, 0, 62);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    // ── Particles ────────────────────────────────────────────────────────────
    const COUNT = 220;
    const pos = new Float32Array(COUNT * 3);
    const px: number[] = [];
    const py: number[] = [];
    const pz: number[] = [];

    for (let i = 0; i < COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 20 + Math.random() * 18;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * 0.72 * Math.sin(phi) * Math.sin(theta);
      const z = r * 0.48 * Math.cos(phi);
      px.push(x); py.push(y); pz.push(z);
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0x5b8dee,
      size: 0.75,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.82,
    });
    group.add(new THREE.Points(pGeo, pMat));

    // ── Connection lines ──────────────────────────────────────────────────────
    const linePos: number[] = [];
    const MAX_D = 13;
    const MAX_L = 320;

    outer: for (let i = 0; i < COUNT; i++) {
      for (let j = i + 1; j < COUNT; j++) {
        if (linePos.length / 6 >= MAX_L) break outer;
        const dx = px[i] - px[j];
        const dy = py[i] - py[j];
        const dz = pz[i] - pz[j];
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) < MAX_D) {
          linePos.push(px[i], py[i], pz[i], px[j], py[j], pz[j]);
        }
      }
    }

    const lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linePos), 3));
    const lMat = new THREE.LineBasicMaterial({ color: 0x1e44a8, transparent: true, opacity: 0.20 });
    group.add(new THREE.LineSegments(lGeo, lMat));

    // ── Wireframe meshes ──────────────────────────────────────────────────────
    const configs: { geo: THREE.BufferGeometry; px: number; py: number; pz: number; op: number; sp: [number, number, number] }[] = [
      { geo: new THREE.IcosahedronGeometry(7.5, 1),       px: -19,  py:  7,  pz: -14, op: 0.10, sp: [0.003,  0.005,  0.000] },
      { geo: new THREE.OctahedronGeometry(5.5, 0),        px:  22,  py: -8,  pz: -9,  op: 0.12, sp: [0.005,  0.003,  0.002] },
      { geo: new THREE.TorusGeometry(8.5, 1.6, 6, 14),    px:   5,  py: 15,  pz: -22, op: 0.08, sp: [0.004,  0.002,  0.003] },
      { geo: new THREE.DodecahedronGeometry(4.5, 0),      px: -27,  py: -13, pz: -7,  op: 0.11, sp: [0.002,  0.004,  0.001] },
    ];

    const meshes = configs.map((c) => {
      const mat = new THREE.MeshBasicMaterial({ color: 0x2a5ac9, wireframe: true, transparent: true, opacity: c.op });
      const m = new THREE.Mesh(c.geo, mat);
      m.position.set(c.px, c.py, c.pz);
      m.userData.sp = c.sp;
      group.add(m);
      return m;
    });

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ── Mouse parallax + drag-to-orbit ──────────────────────────────────────────
    // Parallax: the camera drifts toward the cursor (subtle, always on).
    // Drag-to-orbit: press anywhere that ISN'T a form control / link and drag to
    // spin the constellation; releasing leaves it coasting (inertia) before the
    // gentle auto-rotation takes back over.
    let mx = 0;
    let my = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let velX = 0; // inertia carried after release
    let velY = 0;

    // Don't hijack drags that begin on something the user means to click/type.
    const isInteractive = (t: EventTarget | null) =>
      t instanceof Element &&
      !!t.closest('input, textarea, select, button, a, label, [role="button"], [data-no-orbit]');

    const onMouse = (e: MouseEvent) => {
      mx = (e.clientX / window.innerWidth) * 2 - 1;
      my = -(e.clientY / window.innerHeight) * 2 + 1;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || isInteractive(e.target)) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      velX = 0;
      velY = 0;
      document.body.style.cursor = 'grabbing';
      // Stop the drag from selecting headline/paragraph text mid-orbit.
      document.body.style.userSelect = 'none';
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      // Apply the drag immediately and remember it as velocity for the coast.
      velY = dx * 0.005;
      velX = dy * 0.005;
      group.rotation.y += velY;
      group.rotation.x += velX;
    };
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', onMouse);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    // ── Resize ────────────────────────────────────────────────────────────────
    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    // ── Render loop ───────────────────────────────────────────────────────────
    let raf: number;
    const tick = () => {
      raf = requestAnimationFrame(tick);

      // Gentle ambient spin + per-mesh tumble (skipped for reduced-motion users).
      if (!prefersReduced) {
        group.rotation.y += 0.0007;
        group.rotation.x += 0.0002;
        meshes.forEach((m) => {
          const [sx, sy, sz] = m.userData.sp as [number, number, number];
          m.rotation.x += sx;
          m.rotation.y += sy;
          m.rotation.z += sz;
        });
      }

      // Inertia: after the user lets go, keep coasting and decay to rest.
      if (!dragging) {
        group.rotation.y += velY;
        group.rotation.x += velX;
        velY *= 0.94;
        velX *= 0.94;
      }
      // Keep the vertical tilt sane so a hard flick can't flip it upside down.
      group.rotation.x = Math.max(-1.1, Math.min(1.1, group.rotation.x));

      // Parallax drift toward the cursor (also paused for reduced-motion).
      if (!prefersReduced) {
        camera.position.x += (mx * 9 - camera.position.x) * 0.022;
        camera.position.y += (my * 6 - camera.position.y) * 0.022;
      }
      camera.lookAt(scene.position);

      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMouse);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      window.removeEventListener('resize', onResize);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0" />;
}
