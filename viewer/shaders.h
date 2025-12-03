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

    // Direct lighting
    float NdotL = max(dot(N, L), 0.0);
    vec3 Lo = (kD * albedo / PI + specular) * lightColor * NdotL;

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

    // Fake ambient occlusion based on normal direction
    // Surfaces facing down get more occlusion (ground bounce is darker)
    float fakeAO = 0.5 + 0.5 * clamp(N.y * 0.7 + 0.3, 0.0, 1.0);
    fakeAO = mix(fakeAO, 1.0, metallic * 0.5);  // Metals less affected

    vec3 ambient = (kD_env * diffuseEnv + specularEnv) * ao * fakeAO;

    // Final color
    vec3 color = ambient + Lo;

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

    // Shadow calculation (disabled for now - needs coordinate system debugging)
    // float shadow = calculateShadow(fragPosLightSpace, N, L);
    float shadow = 0.0;

    // Direct lighting with shadows
    vec3 Lo = (kD * albedo / PI + specular) * lightColor * NdotL * (1.0 - shadow);

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

out vec3 fragWorldPos;
out vec2 fragTexCoord;

void main() {
    vec4 worldPos = matModel * vec4(vertexPosition, 1.0);
    fragWorldPos = worldPos.xyz;
    fragTexCoord = vertexTexCoord;
    gl_Position = mvp * vec4(vertexPosition, 1.0);
}
)glsl";

inline const char* kGroundPlane_FS = R"glsl(
#version 330

in vec3 fragWorldPos;
in vec2 fragTexCoord;

out vec4 finalColor;

uniform vec3 groundColor;
uniform vec3 horizonColor;
uniform float fadeRadius;
uniform vec3 sceneCenter;

void main() {
    // Distance from scene center for fade
    float dist = length(fragWorldPos.xz - sceneCenter.xz);
    float fade = 1.0 - smoothstep(fadeRadius * 0.5, fadeRadius, dist);

    // Grid pattern (subtle)
    vec2 grid = abs(fract(fragWorldPos.xz * 0.5) - 0.5);
    float gridLine = smoothstep(0.48, 0.5, max(grid.x, grid.y));
    float gridAlpha = gridLine * 0.08;

    // Base color with slight gradient toward horizon
    vec3 color = mix(groundColor, horizonColor, smoothstep(0.0, fadeRadius, dist) * 0.3);
    color = mix(color, color * 0.92, gridAlpha);

    // Output with fade to transparent at edges
    finalColor = vec4(color, fade * 0.85);
}
)glsl";

}  // namespace shaders
