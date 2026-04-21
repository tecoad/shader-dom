export interface ShaderDef {
	name: string
	code: string
}

export const SHADERS: Record<string, ShaderDef> = {
	wave: {
		name: "Wave Distortion",
		code: `
			varying vec2 vUv;
			uniform sampler2D uTexture;
			uniform float uTime;
			void main() {
				vec2 uv = vUv;
				uv.x += sin(uv.y * 12.0 + uTime * 2.0) * 0.015;
				uv.y += cos(uv.x * 10.0 + uTime * 1.5) * 0.012;
				gl_FragColor = texture2D(uTexture, uv);
			}
		`,
	},
	chromatic: {
		name: "Chromatic Aberration",
		code: `
			varying vec2 vUv;
			uniform sampler2D uTexture;
			uniform float uTime;
			void main() {
				vec2 uv = vUv;
				vec2 center = vec2(0.5);
				vec2 dir = uv - center;
				float dist = length(dir);
				float offset = dist * 0.008 * (1.0 + sin(uTime) * 0.5);
				float r = texture2D(uTexture, uv + dir * offset).r;
				float g = texture2D(uTexture, uv).g;
				float b = texture2D(uTexture, uv - dir * offset).b;
				float a = texture2D(uTexture, uv).a;
				gl_FragColor = vec4(r, g, b, a);
			}
		`,
	},
	glitch: {
		name: "Glitch",
		code: `
			varying vec2 vUv;
			uniform sampler2D uTexture;
			uniform float uTime;

			float rand(vec2 co) {
				return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
			}

			void main() {
				vec2 uv = vUv;
				float t = floor(uTime * 4.0);
				float glitchLine = step(0.97, rand(vec2(t, floor(uv.y * 20.0))));
				uv.x += glitchLine * (rand(vec2(t * 2.0, floor(uv.y * 20.0))) - 0.5) * 0.08;

				float r = texture2D(uTexture, uv + vec2(glitchLine * 0.01, 0.0)).r;
				float g = texture2D(uTexture, uv).g;
				float b = texture2D(uTexture, uv - vec2(glitchLine * 0.01, 0.0)).b;
				float a = texture2D(uTexture, uv).a;
				gl_FragColor = vec4(r, g, b, a);
			}
		`,
	},
	pixelate: {
		name: "Pixelate + Glow",
		code: `
			varying vec2 vUv;
			uniform sampler2D uTexture;
			uniform float uTime;
			uniform vec2 uResolution;
			void main() {
				float pixelSize = 4.0 + sin(uTime * 0.5) * 2.0;
				vec2 uv = vUv;
				vec2 pixels = uResolution / pixelSize;
				uv = floor(uv * pixels) / pixels;
				vec4 color = texture2D(uTexture, uv);
				float glow = 0.0;
				for (float i = -2.0; i <= 2.0; i++) {
					for (float j = -2.0; j <= 2.0; j++) {
						vec2 offset = vec2(i, j) / uResolution * 3.0;
						glow += texture2D(uTexture, uv + offset).r;
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
			varying vec2 vUv;
			uniform sampler2D uTexture;
			uniform float uTime;
			void main() {
				vec2 uv = vUv;
				vec4 color = texture2D(uTexture, uv);
				float scanline = sin(uv.y * 400.0 + uTime * 5.0) * 0.04;
				float flicker = 0.97 + 0.03 * sin(uTime * 12.0);
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
