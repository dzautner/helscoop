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

// Toon (cel) shading - lit 3D pass with optional texture support
inline const char* kToonVS = R"glsl(
#version 330
in vec3 vertexPosition;
in vec3 vertexNormal;
in vec2 vertexTexCoord;
uniform mat4 mvp;
uniform mat4 matModel;
uniform mat4 matView;
out vec3 vNvs;
out vec3 vVdir;
out vec2 vTexCoord;
void main() {
    vec4 wpos = matModel * vec4(vertexPosition, 1.0);
    vec3 nvs  = mat3(matView) * mat3(matModel) * vertexNormal;
    vNvs      = normalize(nvs);
    vec3 vpos = (matView * wpos).xyz;
    vVdir     = normalize(-vpos);
    vTexCoord = vertexTexCoord;
    gl_Position = mvp * vec4(vertexPosition, 1.0);
}
)glsl";

inline const char* kToonFS = R"glsl(
#version 330
in vec3 vNvs;
in vec3 vVdir;
in vec2 vTexCoord;
out vec4 finalColor;

uniform vec3 lightDirVS;
uniform vec4 baseColor;
uniform int  toonSteps;
uniform float ambient;
uniform float diffuseWeight;
uniform float rimWeight;
uniform float specWeight;
uniform float specShininess;
uniform sampler2D albedoTex;
uniform int useTexture;  // 0 = solid color, 1 = sample texture

float quantize(float x, int steps){
    float s = max(1, steps-1);
    return floor(clamp(x,0.0,1.0)*s + 1e-4)/s;
}

void main() {
    vec3 n   = normalize(vNvs);
    vec3 l   = normalize(lightDirVS);
    vec3 v   = normalize(vVdir);

    // Get albedo color - either from texture or solid baseColor
    vec3 albedo = baseColor.rgb;
    if (useTexture > 0) {
        albedo = texture(albedoTex, vTexCoord).rgb * baseColor.rgb;
    }

    float ndl = max(0.0, dot(n,l));
    float cel = quantize(ndl, toonSteps);

    float rim = pow(1.0 - max(0.0, dot(n, v)), 1.5);

    float spec = pow(max(0.0, dot(reflect(-l, n), v)), specShininess);
    spec = step(0.5, spec) * specWeight;

    float shade = clamp(ambient + diffuseWeight*cel + rimWeight*rim + spec, 0.0, 1.0);
    finalColor  = vec4(albedo * shade, 1.0);
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
uniform sampler2D ssaoTex;
uniform vec2 texel;

uniform float normalThreshold;
uniform float depthThreshold;
uniform float edgeIntensity;
uniform vec4 inkColor;
uniform float ssaoStrength;  // 0=no SSAO, 1=full SSAO

vec3 decodeN(vec3 c){ return normalize(c*2.0 - 1.0); }

void main(){
    vec4 col = texture(texture0, uv);
    vec4 nd  = texture(normDepthTex, uv);
    vec3 n   = decodeN(nd.rgb);
    float d  = nd.a;

    // Sample SSAO (white=1=no occlusion, black=0=full occlusion)
    float ssao = texture(ssaoTex, uv).r;
    // Blend between no SSAO (1.0) and full SSAO based on strength
    float ssaoFactor = mix(1.0, ssao, ssaoStrength);

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

    // Apply SSAO to color before edge overlay
    vec3 aoColor = col.rgb * ssaoFactor;
    vec3 inked = mix(aoColor, inkColor.rgb, edge);
    finalColor = vec4(inked, col.a);
}
)glsl";

// ============================================================================
// PBR (Physically Based Rendering) Shader
// Cook-Torrance BRDF with GGX distribution, Schlick-GGX geometry, Fresnel-Schlick
// ============================================================================

inline const char* kPBR_VS = R"glsl(
#version 330

in vec3 vertexPosition;
in vec3 vertexNormal;
in vec2 vertexTexCoord;

uniform mat4 mvp;
uniform mat4 matModel;
uniform mat4 matView;
uniform mat4 matNormal;

out vec3 fragPos;       // World position
out vec3 fragNormal;    // World normal
out vec2 fragTexCoord;
out vec3 viewPos;       // Camera position in world space

void main() {
    vec4 worldPos = matModel * vec4(vertexPosition, 1.0);
    fragPos = worldPos.xyz;

    // Transform normal to world space (using normal matrix for non-uniform scaling)
    fragNormal = normalize(mat3(matModel) * vertexNormal);

    fragTexCoord = vertexTexCoord;

    // Get camera position (inverse of view translation)
    viewPos = -vec3(matView[3]) * mat3(matView);

    gl_Position = mvp * vec4(vertexPosition, 1.0);
}
)glsl";

inline const char* kPBR_FS = R"glsl(
#version 330

in vec3 fragPos;
in vec3 fragNormal;
in vec2 fragTexCoord;
in vec3 viewPos;

out vec4 finalColor;

// Material properties
uniform vec4 albedoColor;
uniform float metallic;
uniform float roughness;
uniform float ao;  // ambient occlusion

// Textures
uniform sampler2D albedoTex;
uniform int useAlbedoTex;

// Lighting
uniform vec3 lightDir;      // Directional light direction (normalized, pointing TO light)
uniform vec3 lightColor;    // Light color/intensity
uniform vec3 ambientColor;  // Ambient light color

// Secondary light (fill/rim)
uniform vec3 lightDir2;     // Secondary light direction
uniform vec3 lightColor2;   // Secondary light color (usually dimmer, cooler)

// Environment approximation (simple gradient sky)
uniform vec3 skyColorTop;
uniform vec3 skyColorBottom;
uniform vec3 groundColor;

const float PI = 3.14159265359;

// Normal Distribution Function (GGX/Trowbridge-Reitz)
float DistributionGGX(vec3 N, vec3 H, float rough) {
    float a = rough * rough;
    float a2 = a * a;
    float NdotH = max(dot(N, H), 0.0);
    float NdotH2 = NdotH * NdotH;

    float nom = a2;
    float denom = (NdotH2 * (a2 - 1.0) + 1.0);
    denom = PI * denom * denom;

    return nom / max(denom, 0.0001);
}

// Geometry function (Schlick-GGX)
float GeometrySchlickGGX(float NdotV, float rough) {
    float r = rough + 1.0;
    float k = (r * r) / 8.0;

    float nom = NdotV;
    float denom = NdotV * (1.0 - k) + k;

    return nom / max(denom, 0.0001);
}

// Smith's method for geometry
float GeometrySmith(vec3 N, vec3 V, vec3 L, float rough) {
    float NdotV = max(dot(N, V), 0.0);
    float NdotL = max(dot(N, L), 0.0);
    float ggx2 = GeometrySchlickGGX(NdotV, rough);
    float ggx1 = GeometrySchlickGGX(NdotL, rough);

    return ggx1 * ggx2;
}

// Fresnel equation (Schlick approximation)
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// Fresnel with roughness (for IBL)
vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float rough) {
    return F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// Improved environment lighting with horizon band and proper hemisphere sampling
vec3 getEnvironmentLight(vec3 N, float rough) {
    // Smoother hemisphere interpolation
    float upFactor = N.y * 0.5 + 0.5;  // 0 at bottom, 1 at top
    upFactor = clamp(upFactor, 0.0, 1.0);

    // Three-way blend: ground -> horizon -> sky
    vec3 skyColor;
    if (N.y > 0.0) {
        // Above horizon: blend horizon to sky top
        float t = pow(upFactor, 0.6);  // Non-linear for softer gradient
        skyColor = mix(skyColorBottom, skyColorTop, t);
    } else {
        // Below horizon: blend ground to horizon
        float t = pow(1.0 - upFactor, 0.8);
        skyColor = mix(skyColorBottom, groundColor, t);
    }

    // Add subtle horizon glow (brighter at horizon)
    float horizonDist = abs(N.y);
    float horizonGlow = exp(-horizonDist * 3.0) * 0.15;
    skyColor += vec3(1.0, 0.95, 0.9) * horizonGlow;

    // Roughness-based blur simulation (rough surfaces see averaged environment)
    vec3 avgEnv = (skyColorTop + skyColorBottom * 2.0 + groundColor) * 0.25;
    skyColor = mix(skyColor, avgEnv, rough * rough * 0.6);

    return skyColor;
}

// Approximate the split-sum BRDF LUT for specular IBL
vec2 approximateBRDF(float NdotV, float roughness) {
    // Approximation from "Real Shading in Unreal Engine 4" by Brian Karis
    vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
    vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
    vec4 r = roughness * c0 + c1;
    float a004 = min(r.x * r.x, exp2(-9.28 * NdotV)) * r.x + r.y;
    return vec2(-1.04, 1.04) * a004 + r.zw;
}

void main() {
    // Get albedo
    vec3 albedo = albedoColor.rgb;
    if (useAlbedoTex > 0) {
        albedo *= texture(albedoTex, fragTexCoord).rgb;
    }

    // Calculate vectors
    vec3 N = normalize(fragNormal);
    vec3 V = normalize(viewPos - fragPos);
    vec3 L = normalize(lightDir);
    vec3 H = normalize(V + L);

    // Calculate reflectance at normal incidence (F0)
    // Dielectrics: 0.04, Metals: albedo color
    vec3 F0 = vec3(0.04);
    F0 = mix(F0, albedo, metallic);

    // Cook-Torrance BRDF
    float NDF = DistributionGGX(N, H, roughness);
    float G = GeometrySmith(N, V, L, roughness);
    vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

    // Specular contribution
    vec3 numerator = NDF * G * F;
    float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
    vec3 specular = numerator / denominator;

    // Energy conservation: diffuse + specular = 1
    vec3 kS = F;  // Specular contribution
    vec3 kD = vec3(1.0) - kS;  // Diffuse contribution
    kD *= 1.0 - metallic;  // Metals have no diffuse

    // Direct lighting from primary light
    float NdotL = max(dot(N, L), 0.0);
    vec3 Lo = (kD * albedo / PI + specular) * lightColor * NdotL;

    // === SECONDARY LIGHT (fill/rim light) ===
    vec3 L2 = normalize(lightDir2);
    vec3 H2 = normalize(V + L2);
    float NDF2 = DistributionGGX(N, H2, roughness);
    float G2 = GeometrySmith(N, V, L2, roughness);
    vec3 F2 = fresnelSchlick(max(dot(H2, V), 0.0), F0);
    vec3 spec2 = (NDF2 * G2 * F2) / (4.0 * max(dot(N, V), 0.0) * max(dot(N, L2), 0.0) + 0.0001);
    vec3 kD2 = (vec3(1.0) - F2) * (1.0 - metallic);
    float NdotL2 = max(dot(N, L2), 0.0);
    vec3 Lo2 = (kD2 * albedo / PI + spec2) * lightColor2 * NdotL2;
    Lo += Lo2;

    // Ambient/Environment lighting (improved IBL approximation)
    float NdotV = max(dot(N, V), 0.0);
    vec3 F_env = fresnelSchlickRoughness(NdotV, F0, roughness);
    vec3 kS_env = F_env;
    vec3 kD_env = (1.0 - kS_env) * (1.0 - metallic);

    // Diffuse irradiance (sample environment at normal direction, fully rough)
    vec3 irradiance = getEnvironmentLight(N, 1.0);
    vec3 diffuseEnv = irradiance * albedo;

    // Specular reflection (sample environment at reflection direction)
    vec3 R = reflect(-V, N);
    vec3 prefilteredColor = getEnvironmentLight(R, roughness);

    // Use proper BRDF LUT approximation instead of guessed values
    vec2 envBRDF = approximateBRDF(NdotV, roughness);
    vec3 specularEnv = prefilteredColor * (F_env * envBRDF.x + envBRDF.y);

    // === SOFT DIRECTIONAL SHADOW WITH FILL LIGHT ===
    float NdotL_shadow = dot(N, L);

    // Soft shadow terminator - gradual transition for natural look
    float shadowTerminator = smoothstep(-0.2, 0.5, NdotL_shadow);

    // Wrap lighting for softer shadows (simulates subsurface/fill)
    float wrapLight = (NdotL_shadow + 0.5) / 1.5;
    wrapLight = clamp(wrapLight, 0.0, 1.0);

    // Combine for soft shadow factor (never fully black)
    float shadowFactor = mix(0.35, 1.0, shadowTerminator * wrapLight);

    // Subtle height-based darkening (very gentle)
    float heightAO = clamp(fragPos.y * 0.15 + 0.9, 0.7, 1.0);

    // Normal-based AO (bottom-facing slightly darker)
    float normalAO = 0.7 + 0.3 * clamp(N.y * 0.5 + 0.5, 0.0, 1.0);

    // Final AO - keep it subtle
    float finalAO = ao * normalAO * heightAO;

    // === IMPROVED ENVIRONMENT REFLECTIONS ===
    // Increase specular environment contribution for shinier look
    vec3 ambientDiffuse = kD_env * diffuseEnv * shadowFactor;
    vec3 ambientSpecular = specularEnv * (1.0 + metallic * 0.5);  // Boost metallic reflections

    vec3 ambient = (ambientDiffuse + ambientSpecular) * finalAO;

    // Direct lighting with shadow (both primary and secondary lights)
    vec3 directLighting = Lo * shadowFactor;

    // Rim/fresnel lighting for depth (catches light at edges)
    float rim = pow(1.0 - NdotV, 3.0) * 0.15;
    vec3 rimColor = mix(skyColorTop, vec3(1.0), 0.5) * rim;

    // === FINAL COMPOSITION ===
    vec3 color = ambient + directLighting + rimColor;

    // ACES Filmic tone mapping (better contrast and color preservation than Reinhard)
    // From: https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    color = clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);

    // Gamma correction
    color = pow(color, vec3(1.0 / 2.2));

    finalColor = vec4(color, 1.0);
}
)glsl";

// ============================================================================
// Gradient Sky Shader
// Renders a gradient sky background
// ============================================================================

inline const char* kSky_VS = R"glsl(
#version 330

in vec3 vertexPosition;

out vec2 uv;

void main() {
    uv = vertexPosition.xy * 0.5 + 0.5;
    gl_Position = vec4(vertexPosition.xy, 0.9999, 1.0);  // Far plane
}
)glsl";

inline const char* kSky_FS = R"glsl(
#version 330

in vec2 uv;
out vec4 finalColor;

uniform vec3 skyTop;
uniform vec3 skyHorizon;
uniform vec3 groundColor;
uniform float sunSize;
uniform vec3 sunDir;

void main() {
    // Gradient based on vertical position
    float t = uv.y;

    vec3 color;
    if (t > 0.5) {
        // Sky (above horizon)
        float skyT = (t - 0.5) * 2.0;
        color = mix(skyHorizon, skyTop, pow(skyT, 0.7));
    } else {
        // Ground (below horizon)
        float groundT = (0.5 - t) * 2.0;
        color = mix(skyHorizon, groundColor, pow(groundT, 0.5));
    }

    // Horizon glow
    float horizonDist = abs(t - 0.5);
    float horizonGlow = exp(-horizonDist * 15.0) * 0.3;
    color += vec3(1.0, 0.95, 0.9) * horizonGlow;

    // Gamma correction
    color = pow(color, vec3(1.0 / 2.2));

    finalColor = vec4(color, 1.0);
}
)glsl";

// ============================================================================
// Shadow Map Depth Shader
// Renders depth from light's perspective for shadow mapping
// ============================================================================

inline const char* kShadowDepth_VS = R"glsl(
#version 330

in vec3 vertexPosition;

uniform mat4 mvp;

out float fragDepth;

void main() {
    vec4 clipPos = mvp * vec4(vertexPosition, 1.0);
    gl_Position = clipPos;
    // Pass normalized device coordinate depth (will be in -1 to 1 range)
    fragDepth = clipPos.z / clipPos.w;
}
)glsl";

inline const char* kShadowDepth_FS = R"glsl(
#version 330

in float fragDepth;

out vec4 fragColor;

void main() {
    // Convert from NDC (-1 to 1) to 0-1 range
    float depth = fragDepth * 0.5 + 0.5;
    fragColor = vec4(depth, depth, depth, 1.0);
}
)glsl";

// ============================================================================
// PBR with Shadows Shader
// Cook-Torrance BRDF with shadow mapping
// ============================================================================

inline const char* kPBRShadow_VS = R"glsl(
#version 330

in vec3 vertexPosition;
in vec3 vertexNormal;
in vec2 vertexTexCoord;

uniform mat4 mvp;
uniform mat4 matModel;
uniform mat4 matView;
uniform mat4 lightSpaceMatrix;

out vec3 fragPos;
out vec3 fragNormal;
out vec2 fragTexCoord;
out vec3 viewPos;
out vec4 fragPosLightSpace;

void main() {
    vec4 worldPos = matModel * vec4(vertexPosition, 1.0);
    fragPos = worldPos.xyz;
    fragNormal = normalize(mat3(matModel) * vertexNormal);
    fragTexCoord = vertexTexCoord;
    viewPos = -vec3(matView[3]) * mat3(matView);
    fragPosLightSpace = lightSpaceMatrix * worldPos;
    gl_Position = mvp * vec4(vertexPosition, 1.0);
}
)glsl";

inline const char* kPBRShadow_FS = R"glsl(
#version 330

in vec3 fragPos;
in vec3 fragNormal;
in vec2 fragTexCoord;
in vec3 viewPos;
in vec4 fragPosLightSpace;

out vec4 finalColor;

// Material properties
uniform vec4 albedoColor;
uniform float metallic;
uniform float roughness;
uniform float ao;

// Textures
uniform sampler2D albedoTex;
uniform int useAlbedoTex;
uniform sampler2D shadowMap;

// Lighting
uniform vec3 lightDir;
uniform vec3 lightColor;

// Environment
uniform vec3 skyColorTop;
uniform vec3 skyColorBottom;
uniform vec3 groundColor;

// Spotlights (up to 8)
#define MAX_SPOTLIGHTS 8
uniform int numSpotlights;
uniform vec3 spotlightPos[MAX_SPOTLIGHTS];
uniform vec3 spotlightDir[MAX_SPOTLIGHTS];
uniform vec3 spotlightColor[MAX_SPOTLIGHTS];
uniform float spotlightIntensity[MAX_SPOTLIGHTS];
uniform float spotlightInnerCone[MAX_SPOTLIGHTS];  // cos of inner angle
uniform float spotlightOuterCone[MAX_SPOTLIGHTS];  // cos of outer angle

const float PI = 3.14159265359;

float DistributionGGX(vec3 N, vec3 H, float rough) {
    float a = rough * rough;
    float a2 = a * a;
    float NdotH = max(dot(N, H), 0.0);
    float NdotH2 = NdotH * NdotH;
    float nom = a2;
    float denom = (NdotH2 * (a2 - 1.0) + 1.0);
    denom = PI * denom * denom;
    return nom / max(denom, 0.0001);
}

float GeometrySchlickGGX(float NdotV, float rough) {
    float r = rough + 1.0;
    float k = (r * r) / 8.0;
    float nom = NdotV;
    float denom = NdotV * (1.0 - k) + k;
    return nom / max(denom, 0.0001);
}

float GeometrySmith(vec3 N, vec3 V, vec3 L, float rough) {
    float NdotV = max(dot(N, V), 0.0);
    float NdotL = max(dot(N, L), 0.0);
    return GeometrySchlickGGX(NdotV, rough) * GeometrySchlickGGX(NdotL, rough);
}

vec3 fresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float rough) {
    return F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

vec3 getEnvironmentLight(vec3 N, float rough) {
    float skyFactor = N.y * 0.5 + 0.5;
    vec3 skyColor = mix(groundColor, mix(skyColorBottom, skyColorTop, skyFactor), max(0.0, N.y));
    return mix(skyColor, (skyColorTop + skyColorBottom + groundColor) / 3.0, rough * 0.5);
}

float calculateShadow(vec4 fragPosLS, vec3 normal, vec3 lightDir) {
    // Perspective divide
    vec3 projCoords = fragPosLS.xyz / fragPosLS.w;
    projCoords = projCoords * 0.5 + 0.5;

    // Flip Y for render texture coordinate system
    projCoords.y = 1.0 - projCoords.y;

    // Outside shadow map - no shadow
    if (projCoords.z > 1.0) return 0.0;
    if (projCoords.x < 0.0 || projCoords.x > 1.0 || projCoords.y < 0.0 || projCoords.y > 1.0) return 0.0;

    float currentDepth = projCoords.z;

    // Slope-scaled bias to reduce shadow acne on angled surfaces
    float cosTheta = max(dot(normal, lightDir), 0.0);
    float bias = max(0.01 * (1.0 - cosTheta), 0.003);

    // PCF soft shadows (3x3 kernel)
    float shadow = 0.0;
    vec2 texelSize = 1.0 / textureSize(shadowMap, 0);
    for (int x = -1; x <= 1; ++x) {
        for (int y = -1; y <= 1; ++y) {
            float pcfDepth = texture(shadowMap, projCoords.xy + vec2(x, y) * texelSize).r;
            shadow += currentDepth - bias > pcfDepth ? 1.0 : 0.0;
        }
    }
    shadow /= 9.0;

    return shadow;
}

// Calculate spotlight contribution using Cook-Torrance BRDF
vec3 calculateSpotlight(int i, vec3 N, vec3 V, vec3 fragPosition, vec3 albedo, vec3 F0, float rough, float metal) {
    vec3 lightVec = spotlightPos[i] - fragPosition;
    float distance = length(lightVec);
    vec3 L = normalize(lightVec);

    // Spotlight cone attenuation
    float theta = dot(L, normalize(-spotlightDir[i]));
    float epsilon = spotlightInnerCone[i] - spotlightOuterCone[i];
    float spotAttenuation = clamp((theta - spotlightOuterCone[i]) / max(epsilon, 0.0001), 0.0, 1.0);

    // Skip if outside cone
    if (spotAttenuation <= 0.0) return vec3(0.0);

    // Distance attenuation (quadratic falloff)
    float attenuation = spotlightIntensity[i] / (1.0 + 0.09 * distance + 0.032 * distance * distance);
    attenuation *= spotAttenuation;

    // Cook-Torrance BRDF
    vec3 H = normalize(V + L);
    float NDF = DistributionGGX(N, H, rough);
    float G = GeometrySmith(N, V, L, rough);
    vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

    vec3 numerator = NDF * G * F;
    float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
    vec3 specular = numerator / denominator;

    vec3 kS = F;
    vec3 kD = (vec3(1.0) - kS) * (1.0 - metal);

    float NdotL = max(dot(N, L), 0.0);

    return (kD * albedo / PI + specular) * spotlightColor[i] * NdotL * attenuation;
}

void main() {
    vec3 albedo = albedoColor.rgb;
    if (useAlbedoTex > 0) {
        albedo *= texture(albedoTex, fragTexCoord).rgb;
    }

    vec3 N = normalize(fragNormal);
    vec3 V = normalize(viewPos - fragPos);
    vec3 L = normalize(lightDir);
    vec3 H = normalize(V + L);

    vec3 F0 = mix(vec3(0.04), albedo, metallic);

    // Cook-Torrance BRDF
    float NDF = DistributionGGX(N, H, roughness);
    float G = GeometrySmith(N, V, L, roughness);
    vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

    vec3 numerator = NDF * G * F;
    float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
    vec3 specular = numerator / denominator;

    vec3 kS = F;
    vec3 kD = (vec3(1.0) - kS) * (1.0 - metallic);

    float NdotL = max(dot(N, L), 0.0);

    // Shadow calculation
    float shadow = calculateShadow(fragPosLightSpace, N, L);

    // Direct lighting with shadows
    vec3 Lo = (kD * albedo / PI + specular) * lightColor * NdotL * (1.0 - shadow);

    // Add spotlight contributions
    for (int i = 0; i < numSpotlights && i < MAX_SPOTLIGHTS; i++) {
        Lo += calculateSpotlight(i, N, V, fragPos, albedo, F0, roughness, metallic);
    }

    // Ambient/Environment lighting (not shadowed)
    vec3 F_env = fresnelSchlickRoughness(max(dot(N, V), 0.0), F0, roughness);
    vec3 kD_env = (1.0 - F_env) * (1.0 - metallic);
    vec3 irradiance = getEnvironmentLight(N, 1.0);
    vec3 diffuseEnv = irradiance * albedo;
    vec3 R = reflect(-V, N);
    vec3 prefilteredColor = getEnvironmentLight(R, roughness);
    vec2 envBRDF = vec2(1.0 - roughness * 0.5, roughness * 0.1);
    vec3 specularEnv = prefilteredColor * (F_env * envBRDF.x + envBRDF.y);
    vec3 ambient = (kD_env * diffuseEnv + specularEnv) * ao;

    vec3 color = ambient + Lo;

    // ACES Filmic tone mapping
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    color = clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);

    // Gamma correction
    color = pow(color, vec3(1.0 / 2.2));

    finalColor = vec4(color, 1.0);
}
)glsl";

// ============================================================================
// Ground Plane Shader
// Simple ground plane with gradient and soft edge fade
// ============================================================================

inline const char* kGroundPlane_VS = R"glsl(
#version 330

in vec3 vertexPosition;
in vec2 vertexTexCoord;

uniform mat4 mvp;
uniform mat4 matModel;
uniform mat4 lightSpaceMatrix;

out vec3 fragWorldPos;
out vec2 fragTexCoord;
out vec4 fragPosLightSpace;

void main() {
    vec4 worldPos = matModel * vec4(vertexPosition, 1.0);
    fragWorldPos = worldPos.xyz;
    fragTexCoord = vertexTexCoord;
    fragPosLightSpace = lightSpaceMatrix * worldPos;
    gl_Position = mvp * vec4(vertexPosition, 1.0);
}
)glsl";

inline const char* kGroundPlane_FS = R"glsl(
#version 330

in vec3 fragWorldPos;
in vec2 fragTexCoord;
in vec4 fragPosLightSpace;

out vec4 finalColor;

uniform vec3 groundColor;
uniform vec3 horizonColor;
uniform float fadeRadius;
uniform vec3 sceneCenter;
uniform vec3 lightDir;       // Sun direction for lighting
uniform float ambientLevel;  // Ambient light level
uniform sampler2D shadowMap;
uniform float shadowBias;

// Spotlight uniforms (same as PBR shader)
#define MAX_SPOTLIGHTS 8
uniform int numSpotlights;
uniform vec3 spotlightPos[MAX_SPOTLIGHTS];
uniform vec3 spotlightDir[MAX_SPOTLIGHTS];
uniform vec3 spotlightColor[MAX_SPOTLIGHTS];
uniform float spotlightIntensity[MAX_SPOTLIGHTS];
uniform float spotlightInnerCone[MAX_SPOTLIGHTS];  // cos of inner angle
uniform float spotlightOuterCone[MAX_SPOTLIGHTS];  // cos of outer angle

// Shadow calculation with PCF soft shadows
float calculateShadow(vec4 fragPosLS) {
    vec3 projCoords = fragPosLS.xyz / fragPosLS.w;
    projCoords = projCoords * 0.5 + 0.5;

    // Flip Y for render texture coordinate system (raylib uses flipped textures)
    projCoords.y = 1.0 - projCoords.y;

    if (projCoords.z > 1.0 || projCoords.x < 0.0 || projCoords.x > 1.0 ||
        projCoords.y < 0.0 || projCoords.y > 1.0) {
        return 0.0;
    }

    float currentDepth = projCoords.z;
    float shadow = 0.0;
    vec2 texelSize = 1.0 / textureSize(shadowMap, 0);

    // PCF with 5x5 kernel for soft shadows
    for (int x = -2; x <= 2; x++) {
        for (int y = -2; y <= 2; y++) {
            float pcfDepth = texture(shadowMap, projCoords.xy + vec2(x, y) * texelSize).r;
            shadow += currentDepth - shadowBias > pcfDepth ? 1.0 : 0.0;
        }
    }
    return shadow / 25.0;
}

// Noise functions for procedural texturing
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
    );
}

float fbm(vec2 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < octaves; i++) {
        value += amplitude * noise(p * frequency);
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    return value;
}

// Voronoi for leaf/stone patterns
float voronoi(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float minDist = 1.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 point = hash(i + neighbor) * vec2(0.8) + vec2(0.1);
            float d = length(neighbor + point - f);
            minDist = min(minDist, d);
        }
    }
    return minDist;
}

void main() {
    vec2 pos = fragWorldPos.xz;

    // Distance from scene center for fade
    float dist = length(pos - sceneCenter.xz);
    float fade = 1.0 - smoothstep(fadeRadius * 0.6, fadeRadius, dist);

    // === Finnish Forest Floor Colors (brighter for visibility) ===
    // Base soil/dirt
    vec3 soilColor = vec3(0.35, 0.28, 0.18);
    // Green moss (typical Sipoonkorpi)
    vec3 mossColor = vec3(0.32, 0.50, 0.22);
    // Dry moss/lichen
    vec3 lichenColor = vec3(0.55, 0.60, 0.42);
    // Pine needles/dead leaves
    vec3 needleColor = vec3(0.45, 0.35, 0.22);
    // Blueberry plant dark green
    vec3 blueberryColor = vec3(0.22, 0.38, 0.18);
    // Lingonberry lighter
    vec3 lingonColor = vec3(0.35, 0.45, 0.25);

    // === Multi-layer Procedural Texture ===

    // Large-scale terrain variation
    float largeNoise = fbm(pos * 0.15, 4);

    // Medium moss patches
    float mossPatch = fbm(pos * 0.4 + vec2(50.0), 5);
    mossPatch = smoothstep(0.35, 0.65, mossPatch);

    // Small grass/plant tufts
    float grassNoise = fbm(pos * 2.0, 3);
    float grassTuft = smoothstep(0.55, 0.7, grassNoise);

    // Pine needle clusters (elongated noise)
    float needleNoise = fbm(pos * vec2(1.5, 0.8) * 1.2, 4);
    float needlePatch = smoothstep(0.4, 0.55, needleNoise) * (1.0 - mossPatch * 0.7);

    // Fallen leaves using voronoi
    float leafPattern = voronoi(pos * 3.0);
    float leaves = smoothstep(0.1, 0.25, leafPattern) * smoothstep(0.5, 0.3, leafPattern);
    leaves *= fbm(pos * 0.8, 2);  // Cluster leaves

    // Blueberry/lingonberry patches
    float berryNoise = fbm(pos * 0.6 + vec2(100.0), 4);
    float berryPatch = smoothstep(0.5, 0.7, berryNoise) * mossPatch;

    // Small stones/pebbles
    float stoneVoronoi = voronoi(pos * 8.0);
    float stones = 1.0 - smoothstep(0.0, 0.12, stoneVoronoi);
    stones *= step(0.7, hash(floor(pos * 8.0)));  // Sparse stones
    vec3 stoneColor = vec3(0.4, 0.38, 0.35) * (0.8 + 0.4 * hash(floor(pos * 8.0) + vec2(5.0)));

    // === Combine Layers ===

    // Start with soil
    vec3 groundCol = soilColor;

    // Add moss (dominant in Finnish forest)
    groundCol = mix(groundCol, mossColor, mossPatch * 0.85);

    // Dry lichen patches on top of moss
    float lichenPatch = fbm(pos * 0.7 + vec2(200.0), 3);
    lichenPatch = smoothstep(0.55, 0.75, lichenPatch) * mossPatch * 0.5;
    groundCol = mix(groundCol, lichenColor, lichenPatch);

    // Berry plants in moss areas
    groundCol = mix(groundCol, mix(blueberryColor, lingonColor, hash(floor(pos * 2.0))), berryPatch * 0.6);

    // Pine needles
    groundCol = mix(groundCol, needleColor, needlePatch * 0.5);

    // Fallen leaves (autumn touch)
    vec3 leafCol = mix(vec3(0.5, 0.3, 0.1), vec3(0.6, 0.4, 0.15), hash(floor(pos * 3.0)));
    groundCol = mix(groundCol, leafCol, leaves * 0.3);

    // Grass tufts
    vec3 grassCol = mix(mossColor, vec3(0.3, 0.45, 0.2), 0.3);
    groundCol = mix(groundCol, grassCol, grassTuft * 0.4);

    // Stones
    groundCol = mix(groundCol, stoneColor, stones);

    // === Micro Detail ===
    float microDetail = fbm(pos * 15.0, 2);
    groundCol *= 0.9 + microDetail * 0.2;

    // === Lighting ===
    // Fake normal from height variation
    float h = fbm(pos * 0.5, 3);
    float hx = fbm((pos + vec2(0.01, 0.0)) * 0.5, 3);
    float hz = fbm((pos + vec2(0.0, 0.01)) * 0.5, 3);
    vec3 normal = normalize(vec3(h - hx, 0.15, h - hz));

    // Calculate shadow from objects (sun only)
    float shadow = calculateShadow(fragPosLightSpace);

    // Diffuse lighting from sun (reduced in shadow)
    float NdotL = max(dot(normal, lightDir), 0.0);
    float shadowFactor = 1.0 - shadow * 0.7;  // Softer shadows
    float sunDiffuse = NdotL * 0.6 * shadowFactor;

    // Calculate spotlight contributions
    vec3 spotlightContrib = vec3(0.0);
    for (int i = 0; i < numSpotlights && i < MAX_SPOTLIGHTS; i++) {
        vec3 lightVec = spotlightPos[i] - fragWorldPos;
        float dist = length(lightVec);
        vec3 L = normalize(lightVec);

        // Spotlight cone attenuation
        float theta = dot(L, normalize(-spotlightDir[i]));
        float epsilon = spotlightInnerCone[i] - spotlightOuterCone[i];
        float spotAtten = clamp((theta - spotlightOuterCone[i]) / max(epsilon, 0.001), 0.0, 1.0);

        // Distance attenuation
        float distAtten = 1.0 / (1.0 + 0.09 * dist + 0.032 * dist * dist);

        // Diffuse lighting
        float NdotL_spot = max(dot(vec3(0.0, 1.0, 0.0), L), 0.0);  // Ground normal is up

        spotlightContrib += spotlightColor[i] * spotlightIntensity[i] * NdotL_spot * spotAtten * distAtten;
    }

    // Combine sun and spotlight lighting
    float totalDiffuse = sunDiffuse + ambientLevel * 0.5;
    totalDiffuse = max(totalDiffuse, 0.1);  // Minimum ambient

    // Soft shadows in crevices (fake AO)
    float ao = 0.7 + 0.3 * largeNoise;
    ao *= 0.85 + 0.15 * mossPatch;  // Moss areas slightly darker

    // Apply lighting
    groundCol = groundCol * totalDiffuse * ao + groundCol * spotlightContrib;

    // Minimum floor brightness
    groundCol = max(groundCol, vec3(0.02));

    // Slight color variation with distance (atmospheric)
    groundCol = mix(groundCol, groundCol * vec3(0.95, 0.97, 1.0), smoothstep(0.0, fadeRadius, dist) * 0.15);

    // Output with fade at edges
    finalColor = vec4(groundCol, fade * 0.95);
}
)glsl";

// ============================================================================
// SSAO (Screen Space Ambient Occlusion) shader
// ============================================================================

// SSAO shader - samples depth around each pixel to compute occlusion
inline const char* kSSAOFS = R"glsl(
#version 330
in vec2 uv;
out vec4 finalColor;

uniform sampler2D texture0;  // RGB=normal, A=linear depth (auto-bound by raylib)
uniform vec2 texelSize;
uniform float ssaoRadius;
uniform float ssaoIntensity;
uniform float zNear;
uniform float zFar;

float random(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec4 nd = texture(texture0, uv);
    float depth = nd.a;

    // Skip background
    if (depth > 0.99) {
        finalColor = vec4(1.0);
        return;
    }

    vec3 normal = normalize(nd.rgb * 2.0 - 1.0);
    float linearDepth = depth * (zFar - zNear) + zNear;

    // Sample radius scales with depth - larger radius when zoomed out
    float sampleRadius = ssaoRadius * 50.0 * (linearDepth / 10.0);
    sampleRadius = clamp(sampleRadius, 10.0, 100.0);

    const int SAMPLES = 12;
    float occlusion = 0.0;
    float validSamples = 0.0;

    float rotAngle = random(uv * 1000.0) * 6.283185;

    for (int i = 0; i < SAMPLES; i++) {
        float angle = float(i) * 2.399963 + rotAngle;
        float r = (float(i) + 1.0) / float(SAMPLES);
        r = sqrt(r) * sampleRadius;

        vec2 offset = vec2(cos(angle), sin(angle)) * r * texelSize;
        vec4 neighborND = texture(texture0, uv + offset);
        float neighborDepth = neighborND.a;

        // Skip background
        if (neighborDepth > 0.99) continue;

        // Normal-based: only trigger at real corners (normals must differ significantly)
        vec3 neighborNormal = normalize(neighborND.rgb * 2.0 - 1.0);
        float normalDot = max(0.0, dot(normal, neighborNormal));
        float normalDiff = 1.0 - normalDot;

        // Only count as occlusion at real corners (threshold 0.3 = ~70 degree difference)
        float occlusionContrib = 0.0;
        if (normalDiff > 0.3) {
            // Strong corners get full occlusion, weaker get less
            occlusionContrib = smoothstep(0.3, 0.7, normalDiff);
        }

        occlusion += occlusionContrib;
        validSamples += 1.0;
    }

    // Normalize
    if (validSamples > 0.0) {
        occlusion = occlusion / validSamples;
    }

    // Apply intensity - output: 1=bright/no occlusion, 0=dark/full occlusion
    float ao = 1.0 - occlusion * ssaoIntensity * 0.5;
    ao = clamp(ao, 0.0, 1.0);

    finalColor = vec4(ao, ao, ao, 1.0);
}
)glsl";

// SSAO blur shader - simple box blur to smooth the noisy SSAO
inline const char* kSSAOBlurFS = R"glsl(
#version 330
in vec2 uv;
out vec4 finalColor;

uniform sampler2D texture0;  // SSAO raw texture (auto-bound by raylib)
uniform vec2 texelSize;

void main() {
    float result = 0.0;
    const int BLUR_SIZE = 2;
    float count = 0.0;

    for (int x = -BLUR_SIZE; x <= BLUR_SIZE; x++) {
        for (int y = -BLUR_SIZE; y <= BLUR_SIZE; y++) {
            vec2 offset = vec2(float(x), float(y)) * texelSize;
            result += texture(texture0, uv + offset).r;
            count += 1.0;
        }
    }

    result /= count;
    finalColor = vec4(result, result, result, 1.0);
}
)glsl";

// ============================================================================
// Debug visualization shaders
// ============================================================================

// Debug shader to visualize depth buffer (uses same VS as edge shader)
// Note: texture0 is automatically bound by DrawTextureRec
inline const char* kDebugDepthFS = R"glsl(
#version 330
in vec2 uv;
out vec4 finalColor;

uniform sampler2D texture0;  // Bound automatically by DrawTextureRec
uniform int debugMode;  // 0=depth, 1=normals, 2=normal+depth

void main() {
    vec4 nd = texture(texture0, uv);

    // Background has depth=1.0 (far), geometry has depth < 1.0
    bool isBackground = nd.a > 0.99;

    if (debugMode == 0) {
        // Depth visualization with logarithmic mapping
        // With zFar=1000, linear depth compresses to tiny range
        // Log scale spreads values more evenly across visual range
        float logScale = 50.0;  // Controls compression (higher = more spread for near)
        float logDepth = log(1.0 + nd.a * logScale) / log(1.0 + logScale);
        // Invert: near objects = bright, far = dark (more intuitive)
        float d = 1.0 - logDepth;
        finalColor = vec4(d, d, d, 1.0);
    } else if (debugMode == 1) {
        // Normals visualization - RGB encodes XYZ direction
        if (isBackground) {
            finalColor = vec4(0.3, 0.3, 0.4, 1.0);  // Gray for sky
        } else {
            finalColor = vec4(nd.rgb, 1.0);
        }
    } else {
        // Combined: normals with depth shading
        float logScale = 50.0;
        float logDepth = log(1.0 + nd.a * logScale) / log(1.0 + logScale);
        float d = 1.0 - logDepth;  // near=bright, far=dark
        if (isBackground) {
            finalColor = vec4(0.3, 0.3, 0.4, 1.0);
        } else {
            // Brighten normals based on proximity (near = full color, far = darker)
            finalColor = vec4(nd.rgb * (0.3 + d * 0.7), 1.0);
        }
    }
}
)glsl";

}  // namespace shaders
