import { useState, useEffect, useRef, useCallback } from "react";

// ─── GLSL Shaders ───────────────────────────────────────────
const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const SHADERS = {
  wave: {
    name: "Wave Distortion",
    code: `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_texture;
      uniform float u_time;
      void main() {
        vec2 uv = v_texCoord;
        uv.x += sin(uv.y * 12.0 + u_time * 2.0) * 0.015;
        uv.y += cos(uv.x * 10.0 + u_time * 1.5) * 0.012;
        gl_FragColor = texture2D(u_texture, uv);
      }
    `,
  },
  chromatic: {
    name: "Chromatic Aberration",
    code: `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_texture;
      uniform float u_time;
      void main() {
        vec2 uv = v_texCoord;
        vec2 center = vec2(0.5);
        vec2 dir = uv - center;
        float dist = length(dir);
        float offset = dist * 0.008 * (1.0 + sin(u_time) * 0.5);
        float r = texture2D(u_texture, uv + dir * offset).r;
        float g = texture2D(u_texture, uv).g;
        float b = texture2D(u_texture, uv - dir * offset).b;
        float a = texture2D(u_texture, uv).a;
        gl_FragColor = vec4(r, g, b, a);
      }
    `,
  },
  glitch: {
    name: "Glitch",
    code: `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_texture;
      uniform float u_time;
      
      float rand(vec2 co) {
        return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
      }
      
      void main() {
        vec2 uv = v_texCoord;
        float t = floor(u_time * 4.0);
        float glitchLine = step(0.97, rand(vec2(t, floor(uv.y * 20.0))));
        uv.x += glitchLine * (rand(vec2(t * 2.0, floor(uv.y * 20.0))) - 0.5) * 0.08;
        
        float r = texture2D(u_texture, uv + vec2(glitchLine * 0.01, 0.0)).r;
        float g = texture2D(u_texture, uv).g;
        float b = texture2D(u_texture, uv - vec2(glitchLine * 0.01, 0.0)).b;
        float a = texture2D(u_texture, uv).a;
        gl_FragColor = vec4(r, g, b, a);
      }
    `,
  },
  pixelate: {
    name: "Pixelate + Glow",
    code: `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_texture;
      uniform float u_time;
      uniform vec2 u_resolution;
      void main() {
        float pixelSize = 4.0 + sin(u_time * 0.5) * 2.0;
        vec2 uv = v_texCoord;
        vec2 pixels = u_resolution / pixelSize;
        uv = floor(uv * pixels) / pixels;
        vec4 color = texture2D(u_texture, uv);
        float glow = 0.0;
        for (float i = -2.0; i <= 2.0; i++) {
          for (float j = -2.0; j <= 2.0; j++) {
            vec2 offset = vec2(i, j) / u_resolution * 3.0;
            glow += texture2D(u_texture, uv + offset).r;
          }
        }
        glow /= 25.0;
        color.rgb += vec3(glow * 0.15, glow * 0.05, glow * 0.2);
        gl_FragColor = color;
      }
    `,
  },
  hologram: {
    name: "Hologram",
    code: `
      precision mediump float;
      varying vec2 v_texCoord;
      uniform sampler2D u_texture;
      uniform float u_time;
      void main() {
        vec2 uv = v_texCoord;
        vec4 color = texture2D(u_texture, uv);
        float scanline = sin(uv.y * 400.0 + u_time * 5.0) * 0.04;
        float flicker = 0.97 + 0.03 * sin(u_time * 12.0);
        color.rgb -= scanline;
        color.rgb *= flicker;
        color.r *= 0.7;
        color.g *= 1.2;
        color.b *= 1.4;
        float edge = smoothstep(0.0, 0.05, uv.y) * smoothstep(1.0, 0.95, uv.y);
        color.a *= edge;
        gl_FragColor = color;
      }
    `,
  },
};

// ─── DOM Snapshot Engine ────────────────────────────────────
// foreignObject SVG → data URI (not blob URL!) → Image → Canvas → WebGL
// Data URIs are same-origin in all browsers, avoiding the tainted canvas error.

function inlineStyles(source, clone) {
  const computed = window.getComputedStyle(source);
  for (const key of computed) {
    clone.style.setProperty(key, computed.getPropertyValue(key));
  }
  for (let i = 0; i < source.children.length; i++) {
    if (clone.children[i]) {
      inlineStyles(source.children[i], clone.children[i]);
    }
  }
}

function useDomSnapshot(domRef, deps = []) {
  const [texture, setTexture] = useState(null);
  const snapshotting = useRef(false);

  const snapshot = useCallback(() => {
    const el = domRef.current;
    if (!el || snapshotting.current) return;
    snapshotting.current = true;

    const width = el.offsetWidth;
    const height = el.offsetHeight;

    const clone = el.cloneNode(true);
    inlineStyles(el, clone);

    const xml = new XMLSerializer().serializeToString(clone);
    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<foreignObject width="100%" height="100%">${xml}</foreignObject>` +
      `</svg>`;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext("2d");
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, width, height);
      setTexture(canvas);
      snapshotting.current = false;
    };
    img.onerror = () => {
      snapshotting.current = false;
    };
    // Data URI instead of blob URL — this is the key to avoiding tainted canvas
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
  }, [domRef, ...deps]);

  return { texture, snapshot };
}

// ─── WebGL Renderer ─────────────────────────────────────────
function useWebGLShader(canvasRef, texture, shaderCode) {
  const glRef = useRef(null);
  const programRef = useRef(null);
  const timeLocRef = useRef(null);
  const resLocRef = useRef(null);
  const startTime = useRef(Date.now());
  const rafRef = useRef(null);
  const textureRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !texture) return;

    // Init WebGL
    const gl = canvas.getContext("webgl", { premultipliedAlpha: false, alpha: true });
    if (!gl) return;
    glRef.current = gl;

    canvas.width = texture.width;
    canvas.height = texture.height;

    // Compile shaders
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, VERTEX_SHADER);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, shaderCode);
    gl.compileShader(fs);

    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error("Fragment shader error:", gl.getShaderInfoLog(fs));
      return;
    }

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);
    programRef.current = program;

    // Quad geometry
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texBuf);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    const texLoc = gl.getAttribLocation(program, "a_texCoord");
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

    // Upload texture
    const glTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture);
    textureRef.current = glTex;

    timeLocRef.current = gl.getUniformLocation(program, "u_time");
    resLocRef.current = gl.getUniformLocation(program, "u_resolution");

    gl.viewport(0, 0, canvas.width, canvas.height);

    if (resLocRef.current) {
      gl.uniform2f(resLocRef.current, canvas.width, canvas.height);
    }

    // Render loop
    const render = () => {
      const elapsed = (Date.now() - startTime.current) / 1000;
      gl.uniform1f(timeLocRef.current, elapsed);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      rafRef.current = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(rafRef.current);
      gl.deleteTexture(glTex);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [texture, shaderCode]);

  // Update texture when it changes (for live snapshots)
  const updateTexture = useCallback(() => {
    const gl = glRef.current;
    if (!gl || !textureRef.current || !texture) return;
    gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture);
  }, [texture]);

  return { updateTexture };
}

// ─── Demo Content Component ─────────────────────────────────
function DemoContent({ counter }) {
  return (
    <div
      style={{
        width: 420,
        padding: 32,
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        background: "linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0f0f23 100%)",
        color: "#e0e0ff",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "linear-gradient(135deg, #7c3aed, #ec4899)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            fontWeight: 700,
            color: "#fff",
          }}
        >
          S
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Shader DOM</div>
          <div style={{ fontSize: 12, color: "#8888bb" }}>React + WebGL</div>
        </div>
      </div>

      <h2
        style={{
          fontSize: 26,
          fontWeight: 800,
          lineHeight: 1.2,
          margin: "0 0 12px 0",
          background: "linear-gradient(90deg, #a78bfa, #ec4899, #f59e0b)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        Shaders in React via foreignObject
      </h2>

      <p style={{ fontSize: 14, lineHeight: 1.6, color: "#aaaacc", margin: "0 0 20px 0" }}>
        DOM snapshot → SVG foreignObject → Canvas → WebGL texture → GPU fragment shader. All running at 60fps.
      </p>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 20,
        }}
      >
        {["React", "WebGL", "GLSL", "SVG"].map((tag) => (
          <span
            key={tag}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              background: "rgba(124, 58, 237, 0.2)",
              border: "1px solid rgba(124, 58, 237, 0.3)",
              fontSize: 11,
              fontWeight: 600,
              color: "#a78bfa",
            }}
          >
            {tag}
          </span>
        ))}
      </div>

      <div
        style={{
          padding: 16,
          background: "rgba(255,255,255,0.04)",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <span style={{ fontSize: 12, color: "#8888bb" }}>Frame Count</span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "'Courier New', monospace",
              color: "#7c3aed",
            }}
          >
            {counter}
          </span>
        </div>
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background: "rgba(255,255,255,0.06)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${(counter % 100)}%`,
              height: "100%",
              borderRadius: 3,
              background: "linear-gradient(90deg, #7c3aed, #ec4899)",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────
export default function App() {
  const [shader, setShader] = useState("wave");
  const [counter, setCounter] = useState(0);
  const [isLive, setIsLive] = useState(true);
  const [snapshotMs, setSnapshotMs] = useState(0);
  const domRef = useRef(null);
  const canvasRef = useRef(null);

  const { texture, snapshot } = useDomSnapshot(domRef, [counter, shader]);
  const { updateTexture } = useWebGLShader(canvasRef, texture, SHADERS[shader].code);

  // Live counter update
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => setCounter((c) => c + 1), 200);
    return () => clearInterval(id);
  }, [isLive]);

  // Continuous snapshots
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      const t0 = performance.now();
      snapshot();
      setSnapshotMs(performance.now() - t0);
      requestAnimationFrame(loop);
    };
    loop();
    return () => { running = false; };
  }, [snapshot]);

  // Update GL texture when snapshot changes
  useEffect(() => {
    if (texture) updateTexture();
  }, [texture, updateTexture]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#08080f",
        color: "#e0e0ff",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        padding: "32px 20px",
      }}
    >
      {/* Header */}
      <div style={{ maxWidth: 900, margin: "0 auto 32px" }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            margin: "0 0 6px 0",
            background: "linear-gradient(90deg, #a78bfa, #ec4899)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          DOM → Shader Pipeline
        </h1>
        <p style={{ fontSize: 13, color: "#6666aa", margin: 0, lineHeight: 1.5 }}>
          Technique by @shuding: foreignObject snapshot → WebGL texture → GPU shader
        </p>
      </div>

      {/* Shader Selector */}
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto 24px",
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        {Object.entries(SHADERS).map(([key, { name }]) => (
          <button
            key={key}
            onClick={() => setShader(key)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: shader === key ? "1px solid #7c3aed" : "1px solid rgba(255,255,255,0.08)",
              background: shader === key ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.03)",
              color: shader === key ? "#c4b5fd" : "#8888aa",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto 24px",
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setIsLive(!isLive)}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.1)",
            background: isLive ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.03)",
            color: isLive ? "#4ade80" : "#888",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {isLive ? "● Live" : "○ Paused"}
        </button>
        <span
          style={{
            fontSize: 11,
            fontFamily: "monospace",
            color: snapshotMs < 16 ? "#4ade80" : "#f59e0b",
            background: "rgba(255,255,255,0.03)",
            padding: "6px 12px",
            borderRadius: 6,
          }}
        >
          snapshot: {snapshotMs.toFixed(1)}ms {snapshotMs < 16 ? "✓" : "⚠"}
        </span>
      </div>

      {/* Main Display */}
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {/* Original DOM */}
        <div>
          <div
            style={{
              fontSize: 11,
              color: "#6666aa",
              marginBottom: 8,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            DOM Source
          </div>
          <div ref={domRef}>
            <DemoContent counter={counter} />
          </div>
        </div>

        {/* Shader Output */}
        <div>
          <div
            style={{
              fontSize: 11,
              color: "#6666aa",
              marginBottom: 8,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            GPU Shader Output — {SHADERS[shader].name}
          </div>
          <canvas
            ref={canvasRef}
            style={{
              width: 420,
              borderRadius: 16,
              background: "#0f0f23",
            }}
          />
        </div>
      </div>

      {/* Pipeline Diagram */}
      <div
        style={{
          maxWidth: 900,
          margin: "40px auto 0",
          padding: 20,
          background: "rgba(255,255,255,0.02)",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "#6666aa",
            marginBottom: 12,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Pipeline
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            fontSize: 12,
          }}
        >
          {[
            ["React DOM", "#7c3aed"],
            ["Inline Styles", "#6366f1"],
            ["XMLSerializer", "#8b5cf6"],
            ["SVG foreignObject", "#a78bfa"],
            ["Data URI", "#c084fc"],
            ["Canvas 2D", "#ec4899"],
            ["WebGL texImage2D", "#f43f5e"],
            ["Fragment Shader", "#f59e0b"],
          ].map(([step, color], i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: `${color}20`,
                  border: `1px solid ${color}40`,
                  color: color,
                  fontWeight: 600,
                  fontFamily: "monospace",
                  fontSize: 11,
                  whiteSpace: "nowrap",
                }}
              >
                {step}
              </span>
              {i < 7 && <span style={{ color: "#444" }}>→</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
