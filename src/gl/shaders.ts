
export const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = `
  uniform vec2 uOffset;
  uniform vec2 uResolution;
  uniform vec4 uBorderColor;
  uniform vec4 uHoverColor;
  uniform vec4 uBackgroundColor;
  uniform vec2 uMousePos;
  uniform float uZoom;
  uniform float uCellSize;
  uniform float uTextureCount;
  uniform sampler2D uImageAtlas;
  uniform sampler2D uTextAtlas;
  uniform float uDistortionStrength;
  uniform sampler2D uActiveVideo;
  uniform vec2 uHoveredCellId;
  uniform bool uIsVideoActive;
  varying vec2 vUv;

  void main() {
    vec2 screenUV = (vUv - 0.5) * 2.0;
    float radius = length(screenUV);
    float distortion = 1.0 - uDistortionStrength * 0.08 * radius * radius;
    vec2 distortedUV = screenUV * distortion;
    vec2 aspectRatio = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 worldCoord = distortedUV * aspectRatio;
    worldCoord *= uZoom;
    worldCoord += uOffset;
    
    vec2 cellPos = worldCoord / uCellSize;
    vec2 cellId = floor(cellPos);
    vec2 cellUV = fract(cellPos);

    vec2 mouseScreenUV = (uMousePos / uResolution) * 2.0 - 1.0;
    mouseScreenUV.y = -mouseScreenUV.y;
    float mouseRadius = length(mouseScreenUV);
    float mouseDistortion = 1.0 - uDistortionStrength * 0.08 * mouseRadius * mouseRadius;
    vec2 mouseDistortedUV = mouseScreenUV * mouseDistortion;
    vec2 mouseWorldCoord = mouseDistortedUV * aspectRatio;
    mouseWorldCoord *= uZoom;
    mouseWorldCoord += uOffset;

    // Organic hover effect based on exact mouse distance
    vec2 cellCenterWorld = (cellId + 0.5) * uCellSize;
    float distToMouse = length(mouseWorldCoord - cellCenterWorld);
    float hoverRadius = uCellSize * 1.5;
    float hoverIntensity = pow(smoothstep(hoverRadius, 0.0, distToMouse), 2.0);
    
    bool isHovered = hoverIntensity > 0.0 && uMousePos.x > 0.0;

    vec3 backgroundColor = uBackgroundColor.rgb;
    if (isHovered) {
      backgroundColor = mix(uBackgroundColor.rgb, uHoverColor.rgb, hoverIntensity * uHoverColor.a);
    }

    float lineWidth = 0.005;
    float gridX = smoothstep(0.0, lineWidth, cellUV.x) * smoothstep(1.0, 1.0 - lineWidth, cellUV.x);
    float gridY = smoothstep(0.0, lineWidth, cellUV.y) * smoothstep(1.0, 1.0 - lineWidth, cellUV.y);
    float gridMask = gridX * gridY;

    float hoverScale = 1.0 + hoverIntensity * 0.05;
    float imageSize = 0.6;
    float imageBorder = (1.0 - imageSize * hoverScale) * 0.5;
    vec2 imageUV = (cellUV - imageBorder) / (imageSize * hoverScale);
    float edgeSmooth = 0.01;
    vec2 imageMask = smoothstep(-edgeSmooth, edgeSmooth, imageUV) * smoothstep(1.0 + edgeSmooth, 1.0 - edgeSmooth, imageUV);
    float imageAlpha = imageMask.x * imageMask.y;
    
    bool inImageArea = imageUV.x > 0.0 && imageUV.x < 1.0 && imageUV.y > 0.0 && imageUV.y < 1.0;
    
    float textHeight = 0.08;
    float textY = 0.05;
    bool inTextArea = cellUV.x > 0.05 && cellUV.x < 0.95 && cellUV.y > textY && cellUV.y < textY + textHeight;

    float texIndex = mod(floor(cellId.x) + floor(cellId.y) * 3.0, uTextureCount);
    vec3 color = backgroundColor;

    if (inImageArea && imageAlpha > 0.0) {
      vec3 imageColor;
      bool isHoveredCell = uIsVideoActive && cellId.x == uHoveredCellId.x && cellId.y == uHoveredCellId.y;

      if (isHoveredCell) {
          imageColor = texture2D(uActiveVideo, imageUV).rgb;
      } else {
          float atlasSize = ceil(sqrt(uTextureCount));
          vec2 atlasPos = vec2(mod(texIndex, atlasSize), floor(texIndex / atlasSize));
          vec2 atlasUV = (atlasPos + imageUV) / atlasSize;
          atlasUV.y = 1.0 - atlasUV.y;
          imageColor = texture2D(uImageAtlas, atlasUV).rgb;
      }
      color = mix(color, imageColor, imageAlpha);
    }

    if (inTextArea) {
      vec2 textCoord = vec2((cellUV.x - 0.05) / 0.9, (cellUV.y - textY) / textHeight);
      textCoord.y = 1.0 - textCoord.y;
      float atlasSize = ceil(sqrt(uTextureCount));
      vec2 atlasPos = vec2(mod(texIndex, atlasSize), floor(texIndex / atlasSize));
      vec2 atlasUV = (atlasPos + textCoord) / atlasSize;
      vec4 textColor = texture2D(uTextAtlas, atlasUV);
      textColor.rgb = mix(textColor.rgb, vec3(1.0), hoverIntensity * 0.5);
      color = mix(color, textColor.rgb, textColor.a);
    }

    vec3 borderColorRGB = uBorderColor.rgb;
    float borderAlpha = uBorderColor.a;
    color = mix(color, borderColorRGB, (1.0 - gridMask) * borderAlpha);

    float fade = 1.0 - smoothstep(1.2, 1.8, radius);
    gl_FragColor = vec4(color * fade, 1.0);
  }
`;
