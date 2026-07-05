/* Cave frame — page-local decorative layer for the Sterkfontein page.
   Renders a procedural rock border around the viewport (WebGL): FBM
   noise as a heightfield, normals synthesised from its gradient, lit
   by a torch that follows the mouse (with a subtle flicker). The inner
   edge of the band is noise-modulated so it reads as a craggy cave
   opening onto the page.

   Progressive enhancement: no WebGL, or any failure -> no frame.
   The canvas is fixed, pointer-events:none, aria-hidden, and sits
   BELOW the BVC bar (z-index 90 < 100). Theme-reactive: dark = near-
   black rock + amber torchlight; light = pale limestone + warm sun.
   prefers-reduced-motion: the flicker freezes (light still follows
   the pointer, which is user-initiated). Tab hidden -> loop pauses. */
(function () {
  'use strict';

  var BAND = 110;              // border band width in px (device-independent)

  var canvas = document.createElement('canvas');
  canvas.id = 'cave-frame';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:90;';
  var gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true });
  if (!gl) return;
  document.body.appendChild(canvas);

  var VS = [
    'attribute vec2 a;',
    'void main(){ gl_Position = vec4(a, 0.0, 1.0); }'
  ].join('\n');

  var FS = [
    'precision mediump float;',
    'uniform vec2 u_res;',
    'uniform vec2 u_mouse;',      // in pixels, origin bottom-left
    'uniform float u_time;',
    'uniform vec3 u_rock;',       // rock tone A (base)
    'uniform vec3 u_rockB;',      // rock tone B (mineral patches)
    'uniform vec3 u_rockC;',      // rock tone C (banding)
    'uniform vec3 u_lightcol;',   // torch colour
    'uniform float u_ambient;',   // theme ambient level
    'uniform float u_band;',

    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float noise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),',
    '             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);',
    '}',
    'float fbm(vec2 p){',
    '  float v = 0.0, a = 0.5;',
    '  for (int k = 0; k < 5; k++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }',
    '  return v;',
    '}',
    // 1D value noise for the torch flicker (hash-based: never repeats).
    'float hash1(float t){ return fract(sin(t * 127.1) * 43758.5453); }',
    'float noise1(float t){',
    '  float i = floor(t), f = fract(t);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  return mix(hash1(i), hash1(i + 1.0), f);',
    '}',

    // Smooth min: rounds the frame corners so the recession gradient is
    // continuous (plain min() creases along the 45-degree diagonals).
    'float smin(float a, float b, float k){',
    '  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);',
    '  return mix(b, a, h) - k * h * (1.0 - h);',
    '}',
    'float edgeDist(vec2 p){',
    '  float dx = min(p.x, u_res.x - p.x);',
    '  float dy = min(p.y, u_res.y - p.y);',
    '  return smin(dx, dy, 60.0);',
    '}',

    // Craggy inner boundary as a function of ANGLE around the viewport
    // centre only (periodic 1D noise on a circle). Along any ray from
    // the centre the rock/page boundary is crossed exactly once, so the
    // mask can never produce holes in the rock or detached islands.
    'float craggy(vec2 p){',
    '  vec2 rel = p - u_res * 0.5;',
    '  float ang = atan(rel.y, rel.x);',
    '  float c = fbm(vec2(cos(ang), sin(ang)) * 3.5 + 9.0);',
    '  return u_band * (0.45 + 0.75 * c);',
    '}',

    // Rock relief: broad forms + fine grain.
    'float height(vec2 p){ return fbm(p * 0.02) * 0.5 + fbm(p * 0.07) * 0.35 + fbm(p * 0.18) * 0.15; }',
    // Tunnel wall: nearest the viewer at the viewport edge, plunging
    // into the page as it approaches the craggy lip — the page is the
    // mouth of a dark passage. q: 0 at edge (near) -> 1 at lip (deep).
    'float wallZ(float d, float inner){',
    '  float q = clamp(d / max(inner, 1.0), 0.0, 1.0);',
    '  return -(u_band * 6.0) * pow(q, 1.8);',
    '}',

    'void main(){',
    '  vec2 px = gl_FragCoord.xy;',
    '  float d = edgeDist(px);',
    '  float inner = craggy(px);',
    // Hard rock edge: binary cut with ~1.5px of anti-aliasing only.
    '  float m = 1.0 - smoothstep(inner - 1.5, inner + 1.5, d);',
    '  if (m <= 0.003) discard;',
    '  float q = clamp(d / inner, 0.0, 1.0);',   // 0 near edge -> 1 deep at lip

    // Normals, done properly: the recessed wall provides the BASE
    // normal; the rock relief perturbs it in the wall's TANGENT FRAME,
    // so bump strength is constant however steep the wall is (adding
    // gradients in screen space lets the recession slope swamp the
    // relief after normalize()).
    '  float e = 2.0;',
    '  float hC = height(px);',
    '  float hX = height(px + vec2(e, 0.0)) - hC;',
    '  float hY = height(px + vec2(0.0, e)) - hC;',
    '  float wC = wallZ(d, inner);',
    '  float wX = wallZ(edgeDist(px + vec2(e, 0.0)), inner) - wC;',
    '  float wY = wallZ(edgeDist(px + vec2(0.0, e)), inner) - wC;',
    '  vec3 Nw = normalize(vec3(-wX, -wY, e));',          // base wall normal
    '  vec3 axis = abs(Nw.x) < 0.7 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);',
    '  vec3 T = normalize(axis - Nw * dot(axis, Nw));',   // tangent frame
    '  vec3 B = cross(Nw, T);',
    '  float K = 26.0;',                                  // angular bump strength
    '  vec3 N = normalize(Nw - T * (hX * K) - B * (hY * K));',

    // Torch at the pointer; brownian flicker (multi-octave 1D noise).
    '  float flick = 0.72 + 0.56 * (0.6 * noise1(u_time * 2.1)',
    '                             + 0.3 * noise1(u_time * 6.3)',
    '                             + 0.1 * noise1(u_time * 13.7));',
    '  vec3 Lp = vec3(u_mouse, 200.0);',
    '  vec3 P  = vec3(px, hC * 40.0 + wC);',
    '  vec3 Lv = Lp - P;',
    '  float dist = length(Lv);',
    '  vec3 L = Lv / dist;',
    '  float atten = flick / (1.0 + dist * dist * 0.9e-5);',
    '  float diff = max(dot(N, L), 0.0);',
    '  vec3 V = vec3(0.0, 0.0, 1.0);',
    '  vec3 H = normalize(L + V);',
    '  float spec = pow(max(dot(N, H), 0.0), 24.0) * 0.35;',

    // Albedo: multi-scale noise mixes three mineral tones.
    '  float n1 = fbm(px * 0.006 + 53.0);',   // broad mineral patches
    '  float n2 = fbm(px * 0.05 + 97.0);',    // fine banding
    '  float n3 = noise(px * 0.45);',         // per-pixel speckle
    '  vec3 albedo = mix(u_rock, u_rockB, smoothstep(0.38, 0.62, n1));',
    '  albedo = mix(albedo, u_rockC, smoothstep(0.3, 0.8, n2) * 0.8);',
    '  albedo *= 0.65 + 0.6 * n3;',

    // Depth kills reflectance and ambient: the wall falls into true
    // darkness as it plunges toward the lip.
    '  float refl = mix(1.0, 0.3, q);',
    '  float amb  = u_ambient * (1.0 - 0.75 * q);',
    '  float cavity = 0.55 + 0.45 * hC;',
    '  vec3 col = albedo * cavity * (amb + diff * atten * refl) + u_lightcol * spec * atten * refl;',
    '  col += u_lightcol * diff * atten * refl * 0.55;',

    // Opaque rock (premultiplied alpha; m only anti-aliases the edge).
    '  gl_FragColor = vec4(col * m, m);',
    '}'
  ].join('\n');

  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s);
    return s;
  }
  var prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw gl.getProgramInfoLog(prog);
  } catch (e) { canvas.remove(); return; }
  gl.useProgram(prog);

  var U = {};
  ['u_res', 'u_mouse', 'u_time', 'u_rock', 'u_rockB', 'u_rockC', 'u_lightcol', 'u_ambient', 'u_band'].forEach(function (n) {
    U[n] = gl.getUniformLocation(prog, n);
  });

  // Geometry: four edge strips (not a fullscreen quad) so the GPU only
  // shades the border band, never the page centre.
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  var aLoc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(aLoc);
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
  var nVerts = 0;

  function strips() {
    // band in clip units, padded for the craggy wobble
    var pad = BAND * 1.6 * dpr;
    var bx = Math.min(1, 2 * pad / canvas.width), by = Math.min(1, 2 * pad / canvas.height);
    function rect(x0, y0, x1, y1) { return [x0,y0, x1,y0, x0,y1, x0,y1, x1,y0, x1,y1]; }
    var v = []
      .concat(rect(-1, 1 - by, 1, 1))       // top
      .concat(rect(-1, -1, 1, -1 + by))     // bottom
      .concat(rect(-1, -1, -1 + bx, 1))     // left
      .concat(rect(1 - bx, -1, 1, 1));      // right
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    nVerts = v.length / 2;
  }

  var dpr = 1, mouse = [0, 0], hasPointer = false;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    strips();
    if (!hasPointer) mouse = [canvas.width * 0.5, canvas.height * 0.8]; // resting torch: upper centre
  }

  // Theme tints, re-read when the toggle flips the attribute.
  var theme = { rock: [0, 0, 0], rockB: [0, 0, 0], rockC: [0, 0, 0], light: [0, 0, 0], ambient: 0 };
  function readTheme() {
    var dark = document.documentElement.getAttribute('data-bs-theme') !== 'light' &&
               (document.documentElement.getAttribute('data-bs-theme') === 'dark' ||
                matchMedia('(prefers-color-scheme: dark)').matches);
    theme = dark
      ? { rock: [0.52, 0.42, 0.28], rockB: [0.26, 0.27, 0.30], rockC: [0.76, 0.54, 0.20],
          light: [1.0, 0.72, 0.35], ambient: 0.30 }                              // torchlit cave: umber/slate/ochre
      : { rock: [0.90, 0.83, 0.70], rockB: [0.62, 0.60, 0.58], rockC: [0.86, 0.68, 0.42],
          light: [1.0, 0.9, 0.7], ambient: 0.65 };                               // daylight limestone/grey/sand
  }
  readTheme();
  new MutationObserver(readTheme).observe(document.documentElement,
    { attributes: true, attributeFilter: ['data-bs-theme', 'data-theme'] });

  addEventListener('pointermove', function (ev) {
    hasPointer = true;
    mouse = [ev.clientX * dpr, canvas.height - ev.clientY * dpr];
  }, { passive: true });
  addEventListener('resize', resize, { passive: true });
  resize();

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied

  var t0 = performance.now();
  function frame(now) {
    if (!document.hidden) {
      gl.uniform2f(U.u_res, canvas.width, canvas.height);
      gl.uniform2f(U.u_mouse, mouse[0], mouse[1]);
      gl.uniform1f(U.u_time, reduced ? 0 : (now - t0) / 1000);
      gl.uniform3fv(U.u_rock, theme.rock);
      gl.uniform3fv(U.u_rockB, theme.rockB);
      gl.uniform3fv(U.u_rockC, theme.rockC);
      gl.uniform3fv(U.u_lightcol, theme.light);
      gl.uniform1f(U.u_ambient, theme.ambient);
      gl.uniform1f(U.u_band, BAND * dpr);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, nVerts);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
