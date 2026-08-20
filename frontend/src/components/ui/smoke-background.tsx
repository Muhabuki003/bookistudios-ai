"use client";

import { useEffect, useRef } from "react";

// ── The "memory loop" smoke plume from bookistudios.com (#os-smoke) ─────────
// The smoky teal particle animation: a plume spawned at an emitter that
// travels across the screen, advected by a value-noise field. On bookistudios
// the emitter position is scrubbed by scroll; here it's an autonomous
// ping-pong: plume sweeps forward (like scrolling down), holds, then RETRACTS
// backwards (like scrolling up), holds, and loops. Slow, subtle, medium
// opacity — pure 2D canvas, no WebGL.

const FORWARD_MS = 14000; // plume sweeps across
const HOLD_MS = 2500; // complete — hold
const REVERSE_MS = 14000; // retracts backwards

const COL = { r: 25, g: 100, b: 75 }; // teal smoke (exact original tint)
const EXPOSURE = 0.05;
const DAMPING = 0.75;
const MAX_AGE = 300;
const SPAWN = 5;
const VX0 = 10;
const VY0 = 10;

type Particle = { x: number; y: number; vx: number; vy: number; age: number };

export function SmokeBackground({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;
    let nd: Uint8ClampedArray = new Uint8ClampedArray(0);
    let em: HTMLCanvasElement | null = null;
    let ectx: CanvasRenderingContext2D | null = null;
    let img: ImageData | null = null;
    let data: Uint8ClampedArray = new Uint8ClampedArray(0);
    let hdr = new Float32Array(0);
    let parts: Particle[] = [];
    let lastProg = 0;

    const tone = (n: number) =>
      (1 - Math.pow(2, -n * 0.005 * EXPOSURE)) * 255;
    const nz = (x: number, y: number, c: number) =>
      nd[(((x | 0) + (y | 0) * W) * 4 + c) % Math.max(1, nd.length)] / 127 -
      1.0;
    const fz = (r: number, b = 0) => b + (Math.random() - 0.5) * r * 2;

    const build = () => {
      const noise = (w: number, h: number) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const x = c.getContext("2d");
        if (!x) return c;
        const d = x.createImageData(w, h);
        const p = d.data;
        for (let i = 0; i < p.length; i += 4) {
          p[i] = Math.random() * 255;
          p[i + 1] = Math.random() * 255;
          p[i + 2] = Math.random() * 255;
          p[i + 3] = 255;
        }
        x.putImageData(d, 0, 0);
        return c;
      };
      const octave = (w: number, h: number, n: number) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const x = c.getContext("2d");
        if (!x) return c;
        x.fillStyle = "#000";
        x.fillRect(0, 0, w, h);
        x.globalAlpha = 1 / n;
        x.globalCompositeOperation = "lighter";
        for (let i = 0; i < n; i++)
          x.drawImage(noise(Math.max(1, w >> i), Math.max(1, h >> i)), 0, 0, w, h);
        return c;
      };
      const oct = octave(W, H, 8).getContext("2d");
      nd = oct ? oct.getImageData(0, 0, W, H).data : new Uint8ClampedArray(0);
      em = document.createElement("canvas");
      em.width = W;
      em.height = H;
      ectx = em.getContext("2d");
      if (ectx) {
        img = ectx.createImageData(W, H);
        data = img.data;
        hdr = new Float32Array(data.length);
        for (let i = 3; i < data.length; i += 4) data[i] = 255;
      }
      parts = [];
      lastProg = 0;
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(2, Math.floor(rect.width || window.innerWidth || 2));
      const h = Math.max(2, Math.floor(rect.height || window.innerHeight || 2));
      if (w !== W || h !== H) {
        W = w;
        H = h;
        canvas.width = W;
        canvas.height = H;
        build();
      }
    };
    resize();

    let raf = 0;
    const t0 = performance.now();
    const CYCLE = FORWARD_MS + HOLD_MS + REVERSE_MS + HOLD_MS;

    const step = () => {
      raf = requestAnimationFrame(step);
      const t = (performance.now() - t0) % CYCLE;
      let prog: number;
      if (t < FORWARD_MS) prog = t / FORWARD_MS; // sweeping forward
      else if (t < FORWARD_MS + HOLD_MS) prog = 1; // hold
      else if (t < FORWARD_MS + HOLD_MS + REVERSE_MS)
        prog = 1 - (t - FORWARD_MS - HOLD_MS) / REVERSE_MS; // retracting
      else prog = 0; // hold empty

      const ex = prog * W;
      const ey = H * 0.5;

      // scrolling back up retracts the plume ahead of the emitter
      const back = prog < lastProg - 0.0004;
      if (back && ectx && img) {
        const edge = Math.max(0, (ex | 0) - 40);
        for (let y = 0; y < H; y++) {
          const row = y * W;
          for (let x = edge; x < W; x++) {
            const k = (row + x) * 4;
            if (hdr[k] < 0.02 && hdr[k + 1] < 0.02 && hdr[k + 2] < 0.02) continue;
            hdr[k] *= 0.8;
            hdr[k + 1] *= 0.8;
            hdr[k + 2] *= 0.8;
            data[k] = tone(hdr[k]);
            data[k + 1] = tone(hdr[k + 1]);
            data[k + 2] = tone(hdr[k + 2]);
          }
        }
        for (let i = parts.length - 1; i >= 0; i--)
          if (parts[i].x > ex) parts.splice(i, 1);
        ectx.putImageData(img, 0, 0);
      }

      if (ex >= 0 && ex <= W && ey >= 0 && ey <= H && ectx && img) {
        for (let n = 0; n < SPAWN; n++)
          parts.push({ x: ex, y: ey, vx: fz(VX0), vy: fz(VY0), age: 0 });

        const alive: Particle[] = [];
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          p.vx =
            p.vx * DAMPING +
            nz(Math.min(Math.max(p.x, 0), W - 1), Math.min(Math.max(p.y, 0), H - 1), 0) *
              4 +
            fz(0.1);
          p.vy =
            p.vy * DAMPING +
            nz(Math.min(Math.max(p.x, 0), W - 1), Math.min(Math.max(p.y, 0), H - 1), 1) *
              4 +
            fz(0.1);
          p.age++;
          for (let s = 0; s < 10; s++) {
            p.x += p.vx * 0.1;
            p.y += p.vy * 0.1;
            if (p.x < 1 || p.x > W - 2 || p.y < 1 || p.y > H - 2) break;
            const k = ((p.x | 0) + (p.y | 0) * W) * 4;
            data[k] = tone((hdr[k] += COL.r));
            data[k + 1] = tone((hdr[k + 1] += COL.g));
            data[k + 2] = tone((hdr[k + 2] += COL.b));
          }
          if (p.age < MAX_AGE) alive.push(p);
        }
        parts = alive;
        ectx.putImageData(img, 0, 0);
      }

      // composite over a transparent canvas — the page bg shows through
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      if (em) ctx.drawImage(em, 0, 0);
      lastProg = prog;
    };
    raf = requestAnimationFrame(step);

    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className={className}
      aria-hidden="true"
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}
