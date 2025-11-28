#pragma once

namespace shaders {

// Outline pass - expands geometry along normals for silhouette edges
inline const char* kOutlineVS = R"glsl(
#version 330

in vec3 vertexPosition;
in vec3 vertexNormal;

uniform mat4 mvp;
uniform float outline;   // world-units thickness

void main()
{
    vec3 pos = vertexPosition + normalize(vertexNormal) * outline;
    gl_Position = mvp * vec4(pos, 1.0);
}
)glsl";

inline const char* kOutlineFS = R"glsl(
#version 330

out vec4 finalColor;
uniform vec4 outlineColor;

void main()
{
    if (gl_FrontFacing) discard;
    finalColor = outlineColor;
}
)glsl";

// Toon (cel) shading - lit 3D pass
inline const char* kToonVS = R"glsl(
#version 330
in vec3 vertexPosition;
in vec3 vertexNormal;
uniform mat4 mvp;
uniform mat4 matModel;
uniform mat4 matView;
out vec3 vNvs;
out vec3 vVdir;
void main() {
    vec4 wpos = matModel * vec4(vertexPosition, 1.0);
    vec3 nvs  = mat3(matView) * mat3(matModel) * vertexNormal;
    vNvs      = normalize(nvs);
    vec3 vpos = (matView * wpos).xyz;
    vVdir     = normalize(-vpos);
    gl_Position = mvp * vec4(vertexPosition, 1.0);
}
)glsl";

inline const char* kToonFS = R"glsl(
#version 330
in vec3 vNvs;
in vec3 vVdir;
out vec4 finalColor;

uniform vec3 lightDirVS;
uniform vec4 baseColor;
uniform int  toonSteps;
uniform float ambient;
uniform float diffuseWeight;
uniform float rimWeight;
uniform float specWeight;
uniform float specShininess;

float quantize(float x, int steps){
    float s = max(1, steps-1);
    return floor(clamp(x,0.0,1.0)*s + 1e-4)/s;
}

void main() {
    vec3 n   = normalize(vNvs);
    vec3 l   = normalize(lightDirVS);
    vec3 v   = normalize(vVdir);

    float ndl = max(0.0, dot(n,l));
    float cel = quantize(ndl, toonSteps);

    float rim = pow(1.0 - max(0.0, dot(n, v)), 1.5);

    float spec = pow(max(0.0, dot(reflect(-l, n), v)), specShininess);
    spec = step(0.5, spec) * specWeight;

    float shade = clamp(ambient + diffuseWeight*cel + rimWeight*rim + spec, 0.0, 1.0);
    finalColor  = vec4(baseColor.rgb * shade, 1.0);
}
)glsl";

// Normal+Depth G-buffer for screen-space edges
inline const char* kNormalDepthVS = R"glsl(
#version 330
in vec3 vertexPosition;
in vec3 vertexNormal;
uniform mat4 mvp;
uniform mat4 matModel;
uniform mat4 matView;
out vec3 nVS;
out float depthLin;
void main() {
    vec4 wpos = matModel * vec4(vertexPosition, 1.0);
    vec3 vpos = (matView * wpos).xyz;
    nVS = normalize(mat3(matView) * mat3(matModel) * vertexNormal);
    depthLin = -vpos.z;
    gl_Position = mvp * vec4(vertexPosition, 1.0);
}
)glsl";

inline const char* kNormalDepthFS = R"glsl(
#version 330
in vec3 nVS;
in float depthLin;
out vec4 outColor;
uniform float zNear;
uniform float zFar;
void main() {
    float d = clamp((depthLin - zNear) / (zFar - zNear), 0.0, 1.0);
    outColor = vec4(nVS*0.5 + 0.5, d);
}
)glsl";

// Fullscreen edge composite
inline const char* kEdgeQuadVS = R"glsl(
#version 330
in vec3 vertexPosition;
in vec2 vertexTexCoord;
uniform mat4 mvp;
out vec2 uv;
void main() {
    uv = vertexTexCoord;
    gl_Position = mvp * vec4(vertexPosition, 1.0);
}
)glsl";

inline const char* kEdgeFS = R"glsl(
#version 330
in vec2 uv;
out vec4 finalColor;

uniform sampler2D texture0;
uniform sampler2D normDepthTex;
uniform vec2 texel;

uniform float normalThreshold;
uniform float depthThreshold;
uniform float edgeIntensity;
uniform vec4 inkColor;

vec3 decodeN(vec3 c){ return normalize(c*2.0 - 1.0); }

void main(){
    vec4 col = texture(texture0, uv);
    vec4 nd  = texture(normDepthTex, uv);
    vec3 n   = decodeN(nd.rgb);
    float d  = nd.a;

    const vec2 offs[8] = vec2[](vec2(-1,-1), vec2(0,-1), vec2(1,-1),
                                vec2(-1, 0),              vec2(1, 0),
                                vec2(-1, 1), vec2(0, 1), vec2(1, 1));
    float maxNDiff = 0.0;
    float maxDDiff = 0.0;
    for (int i=0;i<8;i++){
        vec4 ndn = texture(normDepthTex, uv + offs[i]*texel);
        maxNDiff = max(maxNDiff, length(n - decodeN(ndn.rgb)));
        maxDDiff = max(maxDDiff, abs(d - ndn.a));
    }

    float eN = smoothstep(normalThreshold, normalThreshold*2.5, maxNDiff);
    float eD = smoothstep(depthThreshold,  depthThreshold*6.0,  maxDDiff);
    float edge = clamp(max(eN, eD)*edgeIntensity, 0.0, 1.0);

    vec3 inked = mix(col.rgb, inkColor.rgb, edge);
    finalColor = vec4(inked, col.a);
}
)glsl";

}  // namespace shaders
