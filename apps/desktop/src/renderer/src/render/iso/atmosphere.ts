import { Filter, GlProgram, UniformGroup } from "pixi.js";

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void)
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void)
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uVignette;
uniform float uGrain;

float hash(vec2 p)
{
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main(void)
{
    vec4 source = texture(uTexture, vTextureCoord);
    vec3 color = source.rgb;

    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luma), color, 1.06);
    color = (color - 0.5) * 1.025 + 0.5;

    vec2 centered = vTextureCoord - 0.5;
    float radius = length(centered) * 1.41421356;
    float vignette = smoothstep(1.0, 0.35, radius);
    color *= mix(1.0, 0.70, uVignette * (1.0 - vignette));

    float grain = (hash(vTextureCoord * 913.7 + uTime) - 0.5) * uGrain;
    color += grain;

    finalColor = vec4(max(color, vec3(0.0)), source.a);
}
`;

/** Camera-level colour grade, vignette, and subtle film grain. */
export class AtmosphereFilter extends Filter {
  constructor() {
    super({
      glProgram: GlProgram.from({
        vertex,
        fragment,
        name: "iwakura-atmosphere",
      }),
      resources: {
        atmosphereUniforms: new UniformGroup({
          uTime: { value: 0, type: "f32" },
          uVignette: { value: 0.2, type: "f32" },
          uGrain: { value: 0.012, type: "f32" },
        }),
      },
    });
  }

  setMood(timeSeconds: number, vignette: number, grain: number): void {
    const uniforms = this.resources.atmosphereUniforms.uniforms;
    uniforms.uTime = timeSeconds;
    uniforms.uVignette = vignette;
    uniforms.uGrain = grain;
  }
}
