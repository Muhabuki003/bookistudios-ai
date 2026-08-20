"use client";

import { useEffect, useRef } from "react";

// ── The "Booki OS — the brain behind it" process graph from bookistudios.com ─
// The scroll-linked animation of the #brain section, ported as an autonomous
// background loop: the horizontal line grows, the five step dots light up one
// by one, then the red arc draws itself — exactly like scrolling through the
// section. Then it REVERSES (as if scrolling backwards): arc erases, dots dim,
// line shrinks. Slow, medium opacity, looping forever.
// Pure SVG — no WebGL, no canvas, nothing that can break.

const LINE_X1 = 60;
const LINE_X2 = 940;
const LINE_Y = 42;
const LINE_LEN = LINE_X2 - LINE_X1;

const DOT_XS = [130, 335, 500, 665, 870];
const DOT_Y = LINE_Y;
const DOT_R = 5;

const ARC_PATH =
  "M 900 4 C 900 96 760 104 500 104 C 300 104 220 96 220 4";

// Timing (ms). Forward = as if scrolling down; reverse = scrolling back up.
const FORWARD_MS = 12000;
const HOLD_MS = 2200;
const REVERSE_MS = 12000;

// Per-element windows within a phase (0..1), mirror-imaged on reverse.
const LINE_WIN: [number, number] = [0.0, 0.28];
const DOT_WINS: Array<[number, number]> = [
  [0.1, 0.18],
  [0.22, 0.3],
  [0.34, 0.42],
  [0.46, 0.54],
  [0.58, 0.66],
];
const ARC_WIN: [number, number] = [0.62, 1.0];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const progress = (p: number, [s, e]: [number, number]) =>
  clamp01((p - s) / (e - s));

export function BrainProcessBackground({ className }: { className?: string }) {
  const lineRef = useRef<SVGLineElement | null>(null);
  const arcRef = useRef<SVGPathElement | null>(null);
  const dotRefs = useRef<Array<{ dot: SVGCircleElement | null; glow: SVGCircleElement | null }>>(
    [],
  );

  useEffect(() => {
    const line = lineRef.current;
    const arc = arcRef.current;
    if (!line || !arc) return;
    const arcLen = arc.getTotalLength ? arc.getTotalLength() : 1400;

    const CYCLE = FORWARD_MS + HOLD_MS + REVERSE_MS + HOLD_MS;
    let raf = 0;
    const t0 = performance.now();

    const render = (now: number) => {
      const t = (now - t0) % CYCLE;
      let p: number;
      if (t < FORWARD_MS) p = t / FORWARD_MS; // scrolling down
      else if (t < FORWARD_MS + HOLD_MS) p = 1; // complete — hold
      else if (t < FORWARD_MS + HOLD_MS + REVERSE_MS)
        p = 1 - (t - FORWARD_MS - HOLD_MS) / REVERSE_MS; // scrolling back up
      else p = 0; // reset — hold

      // line grows / shrinks
      line.style.strokeDashoffset = `${LINE_LEN * (1 - progress(p, LINE_WIN))}`;

      // dots light up / dim in sequence
      dotRefs.current.forEach((refs, i) => {
        const dp = progress(p, DOT_WINS[i] ?? [0, 1]);
        if (refs.dot) refs.dot.style.opacity = `${0.18 + dp * 0.82}`;
        if (refs.glow) refs.glow.style.opacity = `${dp * 0.3}`;
      });

      // arc draws / erases
      arc.style.strokeDashoffset = `${arcLen * (1 - progress(p, ARC_WIN))}`;

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <svg
      viewBox="0 0 1000 150"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      {/* horizontal process line */}
      <line
        ref={lineRef}
        x1={LINE_X1}
        y1={LINE_Y}
        x2={LINE_X2}
        y2={LINE_Y}
        stroke="#D63929"
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
        opacity="0.8"
        style={{ strokeDasharray: `${LINE_LEN}` }}
      />
      {/* five step dots with soft glow */}
      {DOT_XS.map((x, i) => (
        <g key={i}>
          <circle
            ref={(el) => {
              if (!dotRefs.current[i]) dotRefs.current[i] = { dot: null, glow: null };
              dotRefs.current[i]!.glow = el;
            }}
            cx={x}
            cy={DOT_Y}
            r={DOT_R * 2.6}
            fill="#D63929"
            opacity="0"
          />
          <circle
            ref={(el) => {
              if (!dotRefs.current[i]) dotRefs.current[i] = { dot: null, glow: null };
              dotRefs.current[i]!.dot = el;
            }}
            cx={x}
            cy={DOT_Y}
            r={DOT_R}
            fill="#D63929"
            opacity="0.18"
          />
        </g>
      ))}
      {/* the brain arc */}
      <path
        ref={arcRef}
        d={ARC_PATH}
        fill="none"
        stroke="#D63929"
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
        opacity="0.85"
        style={{ strokeDasharray: `${1400}` }}
      />
    </svg>
  );
}
