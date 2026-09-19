// Sample the original SVG, rather than approximating its rings and rays with a different grid.
let artwork;
function loadArtwork() {
  return artwork ??= (async () => {
    const image = new Image();
    image.src = new URL('../media/sunburst-grid.svg', import.meta.url).href;
    await image.decode();
    return image;
  })();
}

const vertexSource = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const fragmentSource = `
precision highp float;
uniform sampler2D grid;
uniform vec2 size;
uniform vec2 resolution;
uniform vec2 pointer;
uniform float strength;
uniform float dark;

float engraving(vec2 point) {
  return texture2D(grid, (point + 12.0) / (size + 24.0)).a;
}

void main() {
  vec2 point = gl_FragCoord.xy / resolution * size;
  point.y = size.y - point.y;
  vec2 offset = point - pointer;

  // 1. The pinch: a small, tight lens under the pointer that pulls the engraving toward it by a few pixels.
  //    There is no clock: the material comes to rest with the pointer.
  vec2 pinch = offset / 150.0;
  vec2 slope = pinch * exp(-dot(pinch, pinch) * 1.5) * strength;
  vec2 refracted = point + slope * 16.0;
  float line = engraving(refracted);
  float bevel = engraving(refracted - vec2(0.7, 0.5))
    - engraving(refracted + vec2(0.7, 0.5));

  // 2. The glow: wider than the pinch, and applied ONLY through the grid's own lines.  The blue between the
  //    lines is never lightened, so the light reads as the drawing catching it rather than a spotlight on the page.
  vec2 reach = offset / vec2(300.0, 240.0);
  float glow = exp(-dot(reach, reach) * 1.5) * strength;

  vec3 top = mix(vec3(31.0, 105.0, 196.0),
    vec3(26.0, 87.0, 165.0), dark) / 255.0;
  vec3 bottom = mix(vec3(23.0, 87.0, 170.0),
    vec3(17.0, 59.0, 115.0), dark) / 255.0;
  vec3 color = mix(top, bottom, point.y / size.y);
  color = mix(color, vec3(0.86, 0.97, 1.0), min(line * (1.0 + glow * 3.4), 1.0));
  color += vec3(0.35, 0.70, 1.0) * max(bevel, 0.0) * glow * 0.9;
  color -= vec3(0.16, 0.24, 0.32) * max(-bevel, 0.0) * glow * 0.3;
  gl_FragColor = vec4(color, 1.0);
}`;

/**
 * Render one blue band as engraved glass: under the pointer the grid's lines brighten and pinch inward.  The canvas is decorative and replaces only the
 * background.  CSS lighting is the fallback if WebGL is unavailable or its context is lost. */
export function blueprintGlass(band, reducedMotion, coarsePointer) {
  const canvas = document.createElement('canvas');
  canvas.className = 'blueprint-glass';
  canvas.setAttribute('aria-hidden', 'true');
  const fallback = document.createElement('div');
  fallback.className = 'blueprint-light';
  fallback.setAttribute('aria-hidden', 'true');
  band.prepend(canvas, fallback);

  let gl, program, texture, buffer, image, uniforms;
  let ready = false, failed = false, loading = false, visible = false;
  let frame = 0, lastTime = 0, needsResize = true, limit = 4096;
  let x = 0, y = 0, targetX = 0, targetY = 0, strength = 0, targetStrength = 0;
  let width = 0, height = 0;
  const allowed = () => !reducedMotion.matches && !coarsePointer.matches;
  const active = () => allowed() && visible && !document.hidden;

  // 1. Compile a single fullscreen pass.  Both geometry and texture stay on the GPU between pointer events.
  const shader = (type, source) => {
    const result = gl.createShader(type);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    return result;
  };
  const release = () => {
    if (!gl)
      return;
    gl.deleteProgram(program);
    gl.deleteTexture(texture);
    gl.deleteBuffer(buffer);
    program = texture = buffer = null;
  };
  const initialize = async () => {
    if (ready || failed || loading || !active())
      return;
    loading = true;
    try {
      image = await loadArtwork();
      if (!active())
        return;
      gl ??= canvas.getContext('webgl', {alpha: true, depth: false,
        stencil: false, antialias: false, powerPreference: 'low-power'});
      if (!gl)
        throw new Error('WebGL unavailable');
      if (gl.isContextLost())
        return;
      const vertex = shader(gl.VERTEX_SHADER, vertexSource);
      const fragment = shader(gl.FRAGMENT_SHADER, fragmentSource);
      program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.bindAttribLocation(program, 0, 'position');
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      uniforms = Object.fromEntries(['grid', 'size', 'resolution', 'pointer', 'strength', 'dark']
        .map(name => [name, gl.getUniformLocation(program, name)]));
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.uniform1i(uniforms.grid, 0);
      limit = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),
        gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
      ready = needsResize = true;
      schedule();
    } catch (error) {
      failed = true;
      ready = false;
      release();
      band.classList.remove('glass-ready');
    } finally {
      loading = false;
    }
  };

  // 2. Rasterize only the visible part of the SVG, with a small margin for refraction near the edges.
  const resize = () => {
    width = band.clientWidth;
    height = band.clientHeight;
    if (!width || !height)
      return;
    const ratio = Math.min(devicePixelRatio || 1, 1.5,
      Math.sqrt(2000000 / ((width + 24) * (height + 24))),
      limit / (width + 24), limit / (height + 24));
    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    const crop = document.createElement('canvas');
    crop.width = Math.ceil((width + 24) * ratio);
    crop.height = Math.ceil((height + 24) * ratio);
    const context = crop.getContext('2d');
    context.scale(ratio, ratio);
    const shifted = band.matches('.closing, .docs-band') || innerWidth <= 1100;
    context.drawImage(image, width - 3000 + 12 + (shifted ? 150 : 0),
      12 - (shifted ? 150 : 0), 3000, 2000);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, crop);
    crop.width = crop.height = 1;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uniforms.size, width, height);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    needsResize = false;
  };
  const render = () => {
    if (needsResize)
      resize();
    if (!width || !height)
      return;
    gl.uniform2f(uniforms.pointer, x, y);
    gl.uniform1f(uniforms.strength, strength);
    gl.uniform1f(uniforms.dark, document.documentElement.hasAttribute('dark') ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    band.classList.add('glass-ready');
  };

  // 3. Render only while input is settling or the size/theme changes.  There is no permanent animation loop.
  const tick = time => {
    frame = 0;
    if (!active())
      return;
    const dt = Math.min(time - (lastTime || time - 16), 64);
    lastTime = time;
    const movement = 1 - Math.exp(-dt / 125);
    x += (targetX - x) * movement;
    y += (targetY - y) * movement;
    strength += (targetStrength - strength) * (1 - Math.exp(-dt / 160));
    const settled = Math.abs(targetX - x) + Math.abs(targetY - y) < .15
      && Math.abs(targetStrength - strength) < .002;
    if (settled) {
      x = targetX;
      y = targetY;
      strength = targetStrength;
    }
    if (ready)
      render();
    else {
      fallback.style.setProperty('--light-x', x.toFixed(1) + 'px');
      fallback.style.setProperty('--light-y', y.toFixed(1) + 'px');
      fallback.classList.toggle('lit', targetStrength > 0);
    }
    if (!settled)
      schedule();
    else
      lastTime = 0;
  };
  const schedule = () => {
    if (!frame && active())
      frame = requestAnimationFrame(tick);
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = lastTime = strength = targetStrength = 0;
    fallback.classList.remove('lit');
    band.classList.remove('glass-ready');
  };
  band.addEventListener('pointermove', event => {
    if (!active() || !['mouse', 'pen'].includes(event.pointerType))
      return;
    const rect = band.getBoundingClientRect();
    targetX = event.clientX - rect.left;
    targetY = event.clientY - rect.top;
    if (!targetStrength) {
      x = targetX;
      y = targetY;
    }
    targetStrength = 1;
    schedule();
  }, {passive: true});
  band.addEventListener('pointerleave', () => {
    targetStrength = 0;
    fallback.classList.remove('lit');
    schedule();
  });

  // 4. A static blueprint remains available throughout policy changes, offscreen pauses, and context loss.
  const refresh = () => {
    if (!active()) {
      stop();
      return;
    }
    needsResize = true;
    initialize();
    schedule();
  };
  new ResizeObserver(refresh).observe(band);
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    refresh();
  }).observe(band);
  new MutationObserver(() => schedule()).observe(document.documentElement,
    {attributes: true, attributeFilter: ['dark']});
  reducedMotion.addEventListener('change', refresh);
  coarsePointer.addEventListener('change', refresh);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('resize', refresh);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    ready = false;
    stop();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    program = texture = buffer = null;
    failed = false;
    refresh();
  });
  return stop;
}
