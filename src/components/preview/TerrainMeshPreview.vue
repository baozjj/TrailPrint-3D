<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import type { TerrainMeshPayload } from "@shared/types/terrain";

const props = defineProps<{
  mesh: TerrainMeshPayload | null;
  generating?: boolean;
  error?: string | null;
  demLabel?: string;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let gl: WebGLRenderingContext | null = null;
let program: WebGLProgram | null = null;
let positionBuffer: WebGLBuffer | null = null;
let indexBuffer: WebGLBuffer | null = null;
let indexCount = 0;
let useUint32 = false;
let raf = 0;
let angle = 0.6;

function initGl(canvas: HTMLCanvasElement): boolean {
  gl = (canvas.getContext("webgl", { antialias: true }) ||
    canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
  if (!gl) return false;

  const vs = `
    attribute vec3 aPosition;
    uniform mat4 uMatrix;
    varying float vHeight;
    void main() {
      vHeight = aPosition.z;
      gl_Position = uMatrix * vec4(aPosition, 1.0);
    }
  `;
  const fs = `
    precision mediump float;
    varying float vHeight;
    void main() {
      float t = clamp((vHeight + 8.0) / 40.0, 0.0, 1.0);
      vec3 low = vec3(0.25, 0.45, 0.28);
      vec3 high = vec3(0.85, 0.78, 0.55);
      vec3 col = mix(low, high, t);
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function compile(type: number, src: string): WebGLShader {
    const sh = gl!.createShader(type)!;
    gl!.shaderSource(sh, src);
    gl!.compileShader(sh);
    return sh;
  }

  const vsh = compile(gl.VERTEX_SHADER, vs);
  const fsh = compile(gl.FRAGMENT_SHADER, fs);
  program = gl.createProgram()!;
  gl.attachShader(program, vsh);
  gl.attachShader(program, fsh);
  gl.linkProgram(program);
  gl.useProgram(program);

  positionBuffer = gl.createBuffer();
  indexBuffer = gl.createBuffer();
  return true;
}

function perspective(
  fovy: number,
  aspect: number,
  near: number,
  far: number,
): Float32Array {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[i * 4 + j] =
        a[i * 4] * b[j] +
        a[i * 4 + 1] * b[4 + j] +
        a[i * 4 + 2] * b[8 + j] +
        a[i * 4 + 3] * b[12 + j];
    }
  }
  return out;
}

function rotateY(a: number): Float32Array {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const out = new Float32Array(16);
  out[0] = c;
  out[2] = s;
  out[5] = 1;
  out[8] = -s;
  out[10] = c;
  out[15] = 1;
  return out;
}

function rotateX(a: number): Float32Array {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const out = new Float32Array(16);
  out[0] = 1;
  out[5] = c;
  out[6] = -s;
  out[9] = s;
  out[10] = c;
  out[15] = 1;
  return out;
}

function uploadMesh(mesh: TerrainMeshPayload): void {
  if (!gl || !program || !positionBuffer || !indexBuffer) return;

  const pos = new Float32Array(mesh.positions);
  const maxIndex = mesh.indices.reduce((m, v) => Math.max(m, v), 0);
  useUint32 = maxIndex > 65535;
  const idx = useUint32
    ? new Uint32Array(mesh.indices)
    : new Uint16Array(mesh.indices);

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);

  const loc = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  indexCount = idx.length;
}

function draw(): void {
  const canvas = canvasRef.value;
  if (!gl || !program || !canvas || indexCount === 0) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  gl.clearColor(0.1, 0.11, 0.18, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);

  angle += 0.004;
  const aspect = w / Math.max(h, 1);
  const proj = perspective(0.9, aspect, 1, 800);
  const view = multiply(
    rotateX(0.55),
    multiply(rotateY(angle), new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, -15, -120, 1,
    ])),
  );
  const mvp = multiply(proj, view);
  const uMatrix = gl.getUniformLocation(program, "uMatrix");
  gl.uniformMatrix4fv(uMatrix, false, mvp);

  if (useUint32) {
    const ext = gl.getExtension("OES_element_index_uint");
    if (ext) {
      gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0);
    }
  } else {
    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
  }

  raf = requestAnimationFrame(draw);
}

function resize(): void {
  const canvas = canvasRef.value;
  if (!canvas || !gl) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  gl.viewport(0, 0, canvas.width, canvas.height);
}

watch(
  () => props.mesh,
  (m) => {
    if (m) {
      uploadMesh(m);
      if (!raf) raf = requestAnimationFrame(draw);
    } else {
      indexCount = 0;
    }
  },
  { immediate: true },
);

let ro: ResizeObserver | null = null;

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas || !initGl(canvas)) return;
  resize();
  if (props.mesh) uploadMesh(props.mesh);
  raf = requestAnimationFrame(draw);
  ro = new ResizeObserver(resize);
  ro.observe(canvas);
});

onUnmounted(() => {
  cancelAnimationFrame(raf);
  ro?.disconnect();
  gl = null;
});
</script>

<template>
  <div class="terrain-preview">
    <canvas ref="canvasRef" class="terrain-preview__canvas" />
    <div v-if="generating" class="terrain-preview__badge">正在生成地形…</div>
    <div v-else-if="error" class="terrain-preview__badge terrain-preview__badge--err">
      {{ error }}
    </div>
    <div v-else-if="demLabel" class="terrain-preview__badge terrain-preview__badge--dim">
      DEM: {{ demLabel }}
    </div>
  </div>
</template>

<style scoped>
.terrain-preview {
  position: absolute;
  inset: 0;
  z-index: 2;
}

.terrain-preview__canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.terrain-preview__badge {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--tp-text-secondary);
  pointer-events: none;
  z-index: 3;
}

.terrain-preview__badge--err {
  color: #c62828;
  max-width: 80%;
  text-align: center;
}

.terrain-preview__badge--dim {
  opacity: 0.85;
}
</style>
