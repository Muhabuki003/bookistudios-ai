"use client";

import { useEffect, useRef } from "react";

// ── The "Booki OS — the brain behind it" arc from bookistudios.com ─────────
// The red SVG arc that draws itself through the 5-step process (Task assigned
// → Context memory → Skill lookup → Execute & verify → Skill written).
// Ported as an autonomous background: the arc FORMS (draws right→left),
// holds, UNRAVELS (erases), holds, then forms again — slow/moderate speed.
// Pure SVG — no WebGL, no canvas, no fallback needed.

const ARC_PATH =
  "M 900 4 C 900 96 760 104 500 104 C 300 104 220 96 220 4";

// Ping-pong timing (ms).
const FORM_MS = 8000; // draws itself
const HOLD_MS = 2400; // completed, sits there
const UNRAVEL_MS = 8000; // goes backwards

export function BrainArcBackground({ className }: { className?: string }) {
  const pathRef = useRef<SVGPathElement | null>(null);

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const len = path.getTotalLength ? path.getTotalLength() : 1400;
    path.style.strokeDasharray = `${len}`;

    const CYCLE = FORM_MS + HOLD_MS + UNRAVEL_MS + HOLD_MS;
    let raf = 0;
    const t0 = performance.now();
    const render = (now: number) => {
      const t = (now - t0) % CYCLE;
      let offset: number;
      if (t < FORM_MS) {
        offset = len * (1 - t / FORM_MS); // forming
      } else if (t < FORM_MS + HOLD_MS) {
        offset = 0; // complete — hold
      } else if (t < FORM_MS + HOLD_MS + UNRAVEL_MS) {
        offset = len * ((t - FORM_MS - HOLD_MS) / UNRAVEL_MS); // unraveling
      } else {
        offset = len; // erased — hold
      }
      path.style.strokeDashoffset = `${offset}`;
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <svg
      viewBox="0 0 1000 120"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <path
        ref={pathRef}
        d={ARC_PATH}
        fill="none"
        stroke="#D63929"
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
        opacity="0.85"
      />
    </svg>
  );
}
