"use client";

import { useEffect, useRef } from "react";

// ── The "Life Process" background from bookistudios.com (exact GLSL) ──────
// Simplex-noise flowing veins rendered on a full-screen WebGL canvas.
// uTime is driven in a PING-PONG loop: the pattern forms, unravels backwards,
// forms again, unravels again — slow/moderate speed.

const FRAG = `
precision highp float;
uniform float uTime; uniform vec2 uRes;
uniform vec3 uColor1; uniform vec3 uColor2; uniform vec3 uColor3;
uniform float uSpeed; uniform float uWarp; uniform float uVig; uniform float uAccent; uniform float uZoom;
vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0*floor(p*ns.z*ns.z);
  vec4 x_ = floor(j*ns.z);
  vec4 y_ = floor(j - 7.0*x_);
  vec4 x = x_*ns.x + ns.yyyy;
  vec4 y = y_*ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m*m;
  return 42.0*dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
void main(){
  vec2 uv = (gl_FragCoord.xy*2.0 - uRes) / min(uRes.x, uRes.y);
  float d = length(uv);
  uv.x += uv.y*0.12;
  uv *= uZoom;
  vec2 p = uv;
  float t = uTime*uSpeed;
  vec2 q = vec2(snoise(vec3(p, t*0.55)), snoise(vec3(p + vec2(5.2,1.3), t*0.55)));
  vec2 r = vec2(snoise(vec3(p + uWarp*q + vec2(1.7,9.2), t*0.85)), snoise(vec3(p + uWarp*q + vec2(8.3,2.8), t*0.85)));
  float f = snoise(vec3(p + uWarp*r, t*0.4));
  vec3 col = mix(uColor2, uColor1, smoothstep(-0.85, 0.95, f));
  float hl = smoothstep(0.12, 0.95, f + r.x*0.55);
  col = mix(col, uColor3, hl*hl*uAccent);
  col *= 1.0 - uVig*smoothstep(0.35, 1.6, d);
  gl_FragColor = vec4(col, 1.0);
}`;

const VERT = `void main(){ gl_Position = vec4(position, 1.0); }`;

// Ping-pong timing (seconds per direction; then it reverses and unravels).
const HALF_CYCLE = 45; // ~45s to form, ~45s to unravel
const MAX_TIME = 40; // uTime peak per direction (× uSpeed 0.18 ≈ slow flow)

export function VeinsBackground({
  className,
  light = false,
}: {
  className?: string;
  light?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl =
      canvas.getContext("webgl", {
        antialias: false,
        alpha: false,
        powerPreference: "low-power",
      }) ||
      (canvas.getContext(
        "experimental-webgl",
      ) as WebGLRenderingContext | null);
    if (!gl) return;

    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;

    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const posLoc = gl.getAttribLocation(prog, "position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(prog, name);
    const uTime = u("uTime");
    const uRes = u("uRes");
    if (light) {
      gl.uniform3f(u("uColor1"), 0.86, 0.82, 0.78);
      gl.uniform3f(u("uColor2"), 0.96, 0.96, 0.96);
      gl.uniform3f(u("uColor3"), 0.839, 0.224, 0.161); // #D63929 accent
    } else {
      gl.uniform3f(u("uColor1"), 0.16, 0.11, 0.1);
      gl.uniform3f(u("uColor2"), 0.03, 0.03, 0.03);
      gl.uniform3f(u("uColor3"), 0.839, 0.224, 0.161); // #D63929 accent
    }
    gl.uniform1f(u("uSpeed"), 0.18);
    gl.uniform1f(u("uWarp"), 1.25);
    gl.uniform1f(u("uVig"), 0.4);
    gl.uniform1f(u("uAccent"), 0.85);
    gl.uniform1f(u("uZoom"), 0.85);

    const resize = () => {
      const w = canvas.clientWidth || 2;
      const h = canvas.clientHeight || 2;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(2, Math.floor(w * dpr));
      canvas.height = Math.max(2, Math.floor(h * dpr));
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    resize();

    const t0 = performance.now();
    let raf = 0;
    const render = () => {
      const elapsed = (performance.now() - t0) / 1000;
      // Triangle wave: 0→1 (form) over HALF_CYCLE, 1→0 (unravel), repeat.
      const phase = (elapsed % (HALF_CYCLE * 2)) / HALF_CYCLE;
      const tri = phase <= 1 ? phase : 2 - phase;
      gl.uniform1f(uTime, tri * MAX_TIME);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(render);
    };
    render();

    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, [light]);

  return (
    <canvas
      ref={ref}
      className={className}
      aria-hidden="true"
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}
