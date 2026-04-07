export const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`

export interface ShaderDef {
  name: string
  code: string
}

export const SHADERS: Record<string, ShaderDef> = {
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
}
