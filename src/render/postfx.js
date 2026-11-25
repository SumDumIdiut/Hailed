// Cinematic post-processing for the Hailed WebGL2 renderer: off-screen scene render,
// bright-pass bloom (half res) blurred at quarter res, then composite with tonemap,
// chromatic aberration, vignette, film grain and fade-to-black.
const VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outc;
uniform sampler2D uTex;
uniform float uThreshold;
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float knee = 0.18;
  float soft = clamp((l - uThreshold + knee) / (2.0 * knee), 0.0, 1.0);
  float w = max(l - uThreshold, 0.0) / max(l, 1e-5);
  w = max(w, soft * soft);
  outc = vec4(c * w, 1.0);
}`;

const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outc;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  // 9-tap Gaussian with linear sampling (weights sum to 1)
  vec3 s = texture(uTex, vUv).rgb * 0.2270270270;
  s += texture(uTex, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture(uTex, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture(uTex, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  s += texture(uTex, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  outc = vec4(s, 1.0);
}`;

const COMP_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outc;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uTime, uBloomAmt, uVignette, uGrain, uAberration, uExposure, uFade;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 dir = vUv - 0.5;
  float d2 = dot(dir, dir);
  // Radial chromatic aberration (tiny)
  vec2 off = dir * d2 * uAberration;
  vec3 scene;
  scene.r = texture(uScene, vUv + off).r;
  scene.g = texture(uScene, vUv).g;
  scene.b = texture(uScene, vUv - off).b;

  vec3 bloom = texture(uBloom, vUv).rgb;

  // Scene is already display-encoded by the renderer; linearize, add bloom, tonemap, re-encode.
  vec3 lin = pow(max(scene, 0.0), vec3(2.2));
  lin += bloom * uBloomAmt;
  lin *= uExposure;
  vec3 col = pow(aces(lin), vec3(1.0 / 2.2));

  // Vignette
  float vig = 1.0 - smoothstep(0.25, 0.95, length(dir * vec2(1.0, 0.85)) * 1.35);
  col *= mix(1.0, vig, clamp(uVignette, 0.0, 1.0));

  // Animated film grain
  float g = fract(sin(dot(vUv + fract(uTime * 0.07), vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * uGrain;

  // Fade to black
  col = mix(col, vec3(0.0), clamp(uFade, 0.0, 1.0));

  outc = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function makeTarget(gl, w, h, filter) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { fb, tex, w, h };
}

function deleteTarget(gl, t) {
  if (!t) return;
  if (t.tex) gl.deleteTexture(t.tex);
  if (t.fb) gl.deleteFramebuffer(t.fb);
}

export function createPostFx(gl, program) {
  const bright = program(gl, VS, BRIGHT_FS, 'fx-bright');
  const blur = program(gl, VS, BLUR_FS, 'fx-blur');
  const comp = program(gl, VS, COMP_FS, 'fx-comp');
  const progs = [bright, blur, comp];

  const vao = gl.createVertexArray();
  let scene = null, brightT = null, ping = null, pong = null;
  let W = 0, H = 0, qW = 0, qH = 0, hW = 0, hH = 0;
  let disabled = false;
  let active = false;

  function alloc(w, h) {
    deleteTarget(gl, scene); deleteTarget(gl, brightT); deleteTarget(gl, ping); deleteTarget(gl, pong);
    W = w; H = h;
    hW = Math.max(1, (w / 2) | 0); hH = Math.max(1, (h / 2) | 0);
    qW = Math.max(1, (w / 4) | 0); qH = Math.max(1, (h / 4) | 0);
    scene = makeTarget(gl, W, H, gl.LINEAR);
    brightT = makeTarget(gl, hW, hH, gl.LINEAR);
    ping = makeTarget(gl, qW, qH, gl.LINEAR);
    pong = makeTarget(gl, qW, qH, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function incomplete() {
    const s = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    return s !== gl.FRAMEBUFFER_COMPLETE;
  }

  function resize(w, h) {
    if (disabled) return;
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    if (w === W && h === H && scene) return;
    alloc(w, h);
    // Check the main scene framebuffer; if incomplete, disable postfx permanently.
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fb);
    if (incomplete()) {
      console.warn('PostFX framebuffer incomplete, disabling post-processing.');
      disabled = true;
      active = false;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      deleteTarget(gl, scene); deleteTarget(gl, brightT); deleteTarget(gl, ping); deleteTarget(gl, pong);
      scene = brightT = ping = pong = null;
      return;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function begin() {
    if (disabled || !scene) { active = false; return; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fb);
    gl.viewport(0, 0, W, H);
    // The scene renderer clears via its own background draw, but clear anyway for safety.
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    active = true;
  }

  function drawQuad() {
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  function end(opts = {}) {
    if (disabled || !active || !scene) { active = false; return; }
    active = false;
    const {
      time = 0, bloom: bloomAmt = 0.8, vignette = 0.35, grain = 0.04,
      aberration = 0.0015, exposure = 1, fade = 0,
    } = opts;

    // Save blend state; postfx passes run with blending disabled.
    const blend = gl.isEnabled(gl.BLEND);
    gl.disable(gl.BLEND);

    // Bright pass at half res
    gl.bindFramebuffer(gl.FRAMEBUFFER, brightT.fb);
    gl.viewport(0, 0, hW, hH);
    gl.useProgram(bright.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.tex);
    gl.uniform1i(bright.loc('uTex'), 0);
    gl.uniform1f(bright.loc('uThreshold'), 0.7);
    drawQuad();

    // Seed quarter-res blur with downsampled bright pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, ping.fb);
    gl.viewport(0, 0, qW, qH);
    gl.useProgram(blur.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, brightT.tex);
    gl.uniform1i(blur.loc('uTex'), 0);
    gl.uniform2f(blur.loc('uDir'), 0, 0);
    drawQuad();

    // Two ping-pong iterations of separable Gaussian blur (H then V) at quarter res
    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, pong.fb);
      gl.viewport(0, 0, qW, qH);
      gl.bindTexture(gl.TEXTURE_2D, ping.tex);
      gl.uniform2f(blur.loc('uDir'), 1 / qW, 0);
      drawQuad();

      gl.bindFramebuffer(gl.FRAMEBUFFER, ping.fb);
      gl.viewport(0, 0, qW, qH);
      gl.bindTexture(gl.TEXTURE_2D, pong.tex);
      gl.uniform2f(blur.loc('uDir'), 0, 1 / qH);
      drawQuad();
    }

    // Composite to default framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(comp.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.tex);
    gl.uniform1i(comp.loc('uScene'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ping.tex);
    gl.uniform1i(comp.loc('uBloom'), 1);
    gl.uniform1f(comp.loc('uTime'), time);
    gl.uniform1f(comp.loc('uBloomAmt'), bloomAmt);
    gl.uniform1f(comp.loc('uVignette'), vignette);
    gl.uniform1f(comp.loc('uGrain'), grain);
    gl.uniform1f(comp.loc('uAberration'), aberration);
    gl.uniform1f(comp.loc('uExposure'), exposure);
    gl.uniform1f(comp.loc('uFade'), fade);
    drawQuad();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (blend) gl.enable(gl.BLEND);
  }

  function dispose() {
    deleteTarget(gl, scene); deleteTarget(gl, brightT); deleteTarget(gl, ping); deleteTarget(gl, pong);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(bright.p); gl.deleteProgram(blur.p); gl.deleteProgram(comp.p);
  }

  return { progs, resize, begin, end, dispose, get disabled() { return disabled; } };
}