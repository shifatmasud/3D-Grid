
import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

// Note for Framer users: Ensure the 'three' package is added as a dependency in your project's package.json file.

// --- INLINED DEPENDENCIES ---

// From: types.ts
interface Project {
  title: string;
  image: string;
  year: number;
  href: string;
  video?: string;
}

// From: data/index.ts
const projects: Project[] = [
  {
    title: "Motion Study",
    image: "https://picsum.photos/seed/img1/512/512",
    year: 2024,
    href: "#",
    video: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  },
  {
    title: "Idle Form",
    image: "https://picsum.photos/seed/img2/512/512",
    year: 2023,
    href: "#",
    video: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  },
  {
    title: "Blur Signal",
    image: "https://picsum.photos/seed/img3/512/512",
    year: 2024,
    href: "#",
    video: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
  },
  {
    title: "Still Drift",
    image: "https://picsum.photos/seed/img4/512/512",
    year: 2023,
    href: "#",
    video: "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  },
  {
    title: "Core Motion",
    image: "https://picsum.photos/seed/img5/512/512",
    year: 2022,
    href: "#",
    video: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  },
  {
    title: "Flux Pattern",
    image: "https://picsum.photos/seed/img6/512/512",
    year: 2024,
    href: "#",
    video: "https://storage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
  },
  {
    title: "Static Echo",
    image: "https://picsum.photos/seed/img7/512/512",
    year: 2021,
    href: "#",
    video: "https://storage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4",
  },
  {
    title: "Vector Wave",
    image: "https://picsum.photos/seed/img8/512/512",
    year: 2023,
    href: "#",
    video: "https://storage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
  },
];

// From: gl/shaders.ts
const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
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

// --- FRAMER CODE COMPONENT ---

const GalleryComponent: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoTextureRef = useRef<THREE.VideoTexture | null>(null);
  const hoveredCellIdRef = useRef<THREE.Vector2 | null>(null);


  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    let scene: THREE.Scene;
    let camera: THREE.OrthographicCamera;
    let renderer: THREE.WebGLRenderer;
    let plane: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    let videoElement: HTMLVideoElement | null = null;
    
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    const offset = new THREE.Vector2(0, 0);
    const targetOffset = new THREE.Vector2(0, 0);
    const mousePos = new THREE.Vector2(-1, -1);
    const targetMousePos = new THREE.Vector2(-1, -1);
    let zoomLevel = 1.0;
    let targetZoom = 1.0;
    let distortionStrength = 1.0;
    let targetDistortionStrength = 1.0;
    let animationFrameId: number;

    let isZoomed = false;
    let isPotentialClick = false;
    let clickStartPosition = { x: 0, y: 0 };
    const lastOffset = new THREE.Vector2(0, 0);
    let lastZoom = 1.0;
    let videoRequestNonce = 0;
    
    const positiveModulo = (n: number, m: number) => ((n % m) + m) % m;

    const init = async () => {
      scene = new THREE.Scene();
      camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.z = 1;
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      currentMount.appendChild(renderer.domElement);

      videoElement = document.createElement('video');
      videoElement.loop = true;
      videoElement.muted = true;
      videoElement.playsInline = true;
      videoElement.crossOrigin = 'anonymous';
      videoElement.style.display = 'none';
      currentMount.appendChild(videoElement); // Append to component, not body
      videoRef.current = videoElement;
      videoTextureRef.current = new THREE.VideoTexture(videoRef.current);
      videoTextureRef.current.minFilter = THREE.LinearFilter;
      videoTextureRef.current.magFilter = THREE.LinearFilter;

      const imageTextures = await loadTextures();
      const textTextures = projects.map(project => createTextTexture(project.title, project.year));
      const imageAtlas = createTextureAtlas(imageTextures, false);
      const textAtlas = createTextureAtlas(textTextures, true);

      const uniforms = {
        uOffset: { value: new THREE.Vector2(0, 0) },
        uResolution: { value: new THREE.Vector2(currentMount.clientWidth, currentMount.clientHeight) },
        uBorderColor: { value: new THREE.Vector4(0.075, 0.075, 0.075, 0.15) },
        uHoverColor: { value: new THREE.Vector4(1, 1, 1, 0.08) },
        uBackgroundColor: { value: new THREE.Vector4(0, 0, 0, 1) },
        uMousePos: { value: mousePos },
        uZoom: { value: 1.0 },
        uDistortionStrength: { value: 1.0 },
        uCellSize: { value: 0.75 },
        uTextureCount: { value: projects.length },
        uImageAtlas: { value: imageAtlas },
        uTextAtlas: { value: textAtlas },
        uActiveVideo: { value: videoTextureRef.current },
        uHoveredCellId: { value: new THREE.Vector2(-999, -999) },
        uIsVideoActive: { value: false },
      };

      const geometry = new THREE.PlaneGeometry(2, 2);
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
      });
      plane = new THREE.Mesh(geometry, material);
      scene.add(plane);

      setupEventListeners();
      animate();
    };
    
    const screenToWorld = (screenPos: THREE.Vector2): THREE.Vector2 => {
        const resolution = plane.material.uniforms.uResolution.value;
        const ndcPos = new THREE.Vector2(
            (screenPos.x / resolution.x) * 2 - 1,
            (screenPos.y / resolution.y) * 2 - 1
        );
        ndcPos.y *= -1;

        const radius = ndcPos.length();
        const distortion = 1.0 - distortionStrength * 0.08 * radius * radius;
        const distortedPos = ndcPos.clone().multiplyScalar(distortion);

        const aspectRatio = new THREE.Vector2(resolution.x / resolution.y, 1.0);
        return distortedPos.multiply(aspectRatio).multiplyScalar(zoomLevel).add(offset);
    };

    const setVideoState = async (cellId: THREE.Vector2 | null) => {
      const currentNonce = ++videoRequestNonce;

      if (!videoRef.current || !plane) return;
      const video = videoRef.current;

      const getProject = (id: THREE.Vector2 | null) => {
        if (!id) return null;
        const index = positiveModulo(Math.floor(id.x) + Math.floor(id.y) * 3, projects.length);
        return projects[index];
      };

      const project = getProject(cellId);
      const newSrc = project?.video;

      if (!newSrc) {
        if (currentNonce === videoRequestNonce) {
          plane.material.uniforms.uIsVideoActive.value = false;
          if (!video.paused) {
            video.pause();
          }
        }
        return;
      }
      
      try {
        if (currentNonce !== videoRequestNonce) return;

        if (video.src !== newSrc || video.error) {
          video.src = newSrc;
          video.load(); 
        }

        plane.material.uniforms.uHoveredCellId.value.copy(cellId!);
        
        if (video.paused) {
           await video.play();
        }
        
        if (currentNonce === videoRequestNonce) {
          plane.material.uniforms.uIsVideoActive.value = true;
        } else {
          if (!video.paused) video.pause();
        }

      } catch (error: any) {
        if (error.name === 'AbortError') {
          // Expected error
        } else if (currentNonce === videoRequestNonce) {
          console.error("Video play failed:", error);
          plane.material.uniforms.uIsVideoActive.value = false;
        }
      }
    };


    const handleClick = (clickPos: THREE.Vector2) => {
        if (isZoomed) {
            targetOffset.copy(lastOffset);
            targetZoom = lastZoom;
            targetDistortionStrength = 1.0;
            isZoomed = false;
        } else {
            const worldCoord = screenToWorld(clickPos);
            const cellSize = plane.material.uniforms.uCellSize.value;
            const clickedCellId = new THREE.Vector2(
                Math.floor(worldCoord.x / cellSize),
                Math.floor(worldCoord.y / cellSize)
            );
            
            const targetCellCenter = clickedCellId.clone().addScalar(0.5).multiplyScalar(cellSize);
            
            lastOffset.copy(targetOffset);
            lastZoom = targetZoom;
            
            targetOffset.copy(targetCellCenter);
            targetZoom = 0.3;
            targetDistortionStrength = 0.0;
            isZoomed = true;
        }
    };

    const loadTextures = (): Promise<THREE.Texture[]> => {
        const textureLoader = new THREE.TextureLoader();
        textureLoader.setCrossOrigin('');
        const promises = projects.map(project => {
            return new Promise<THREE.Texture>(resolve => {
                textureLoader.load(project.image, resolve);
            });
        });
        return Promise.all(promises);
    };
    
    const createTextTexture = (title: string, year: number): THREE.CanvasTexture => {
        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (!ctx) return new THREE.CanvasTexture(canvas);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = 'bold 80px "IBM Plex Mono"';
        ctx.fillStyle = 'rgb(128, 128, 128)';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(title.toUpperCase(), 30, 128);
        ctx.textAlign = 'right';
        ctx.fillText(year.toString(), 2048 - 30, 128);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    };
    
    const createTextureAtlas = (textures: THREE.Texture[], isText: boolean): THREE.CanvasTexture => {
        const atlasGridSize = Math.ceil(Math.sqrt(textures.length));
        const textureSize = isText ? 256 : 512;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = atlasGridSize * textureSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) return new THREE.CanvasTexture(canvas);

        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        textures.forEach((texture, index) => {
            const x = (index % atlasGridSize) * textureSize;
            const y = Math.floor(index / atlasGridSize) * textureSize;
            if (texture.image) {
                ctx.drawImage(texture.image, x, y, textureSize, textureSize);
            }
        });
        const atlasTexture = new THREE.CanvasTexture(canvas);
        atlasTexture.minFilter = THREE.LinearFilter;
        atlasTexture.magFilter = THREE.LinearFilter;
        atlasTexture.needsUpdate = true;
        return atlasTexture;
    };
    
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
        isPotentialClick = true;
        isDragging = true;
        const evt = 'touches' in event ? event.touches[0] : event;
        previousMousePosition = { x: evt.clientX, y: evt.clientY };
        clickStartPosition = { x: evt.clientX, y: evt.clientY };
    };

    const handlePointerMove = (x: number, y: number) => {
        targetMousePos.set(x, y);

        const moveThreshold = 5;
        if (isPotentialClick && (Math.abs(x - clickStartPosition.x) > moveThreshold || Math.abs(y - clickStartPosition.y) > moveThreshold)) {
            isPotentialClick = false;
        }

        if (!isZoomed) {
            const worldCoord = screenToWorld(new THREE.Vector2(x, y));
            const cellSize = plane.material.uniforms.uCellSize.value;
            const currentCellId = new THREE.Vector2(
                Math.floor(worldCoord.x / cellSize),
                Math.floor(worldCoord.y / cellSize)
            );

            if (!hoveredCellIdRef.current || !currentCellId.equals(hoveredCellIdRef.current)) {
                hoveredCellIdRef.current = currentCellId.clone();
                setVideoState(currentCellId);
            }
        }

        if (!isDragging || isZoomed) return;

        const deltaX = x - previousMousePosition.x;
        const deltaY = y - previousMousePosition.y;

        const moveSpeed = 2.0 / currentMount.clientHeight;
        const aspectRatio = currentMount.clientWidth / currentMount.clientHeight;
        
        targetOffset.x -= deltaX * moveSpeed * zoomLevel * aspectRatio;
        targetOffset.y += deltaY * moveSpeed * zoomLevel;

        previousMousePosition = { x, y };
    }

    const onMouseMove = (event: MouseEvent) => {
        handlePointerMove(event.clientX, event.clientY);
    }

    const onTouchMove = (event: TouchEvent) => {
        event.preventDefault();
        if (!isDragging) return;
        const touch = event.touches[0];
        handlePointerMove(touch.clientX, touch.clientY);
    }
    
    const onPointerUp = (event: MouseEvent | TouchEvent) => {
        if (isPotentialClick) {
            const evt = 'changedTouches' in event ? event.changedTouches[0] : event;
            handleClick(new THREE.Vector2(evt.clientX, evt.clientY));
        }
        isDragging = false;
        isPotentialClick = false;
    };

    const onPointerLeave = () => {
        isDragging = false;
        targetMousePos.set(-1, -1);
        setVideoState(null);
        hoveredCellIdRef.current = null;
    };
    
    const onTouchStart = (event: TouchEvent) => {
        event.preventDefault();
        onPointerDown(event);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();

      if (isZoomed) return;

      const scrollSpeed = 0.001;
      const aspectRatio = plane.material.uniforms.uResolution.value.x / plane.material.uniforms.uResolution.value.y;

      let { deltaX, deltaY } = event;

      if (event.deltaMode === 1) { // DOM_DELTA_LINE
        deltaX *= 18;
        deltaY *= 18;
      } else if (event.deltaMode === 2) { // DOM_DELTA_PAGE
        deltaX *= currentMount.clientWidth;
        deltaY *= currentMount.clientHeight;
      }
      
      targetOffset.x -= deltaX * scrollSpeed * zoomLevel * aspectRatio;
      targetOffset.y += deltaY * scrollSpeed * zoomLevel;
    };

    const onWindowResize = () => {
      if (!renderer || !camera || !plane || !currentMount) return;
      renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
      plane.material.uniforms.uResolution.value.set(currentMount.clientWidth, currentMount.clientHeight);
    };

    const setupEventListeners = () => {
      window.addEventListener('resize', onWindowResize);
      currentMount.addEventListener('mousedown', onPointerDown as EventListener);
      currentMount.addEventListener('mousemove', onMouseMove);
      currentMount.addEventListener('mouseup', onPointerUp as EventListener);
      currentMount.addEventListener('mouseleave', onPointerLeave);
      currentMount.addEventListener('touchstart', onTouchStart, { passive: false });
      currentMount.addEventListener('touchmove', onTouchMove, { passive: false });
      currentMount.addEventListener('touchend', onPointerUp as EventListener);
      currentMount.addEventListener('wheel', onWheel, { passive: false });
    };

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const lerpFactor = 0.1;
      mousePos.lerp(targetMousePos, lerpFactor);
      offset.lerp(targetOffset, lerpFactor);
      zoomLevel += (targetZoom - zoomLevel) * lerpFactor;
      distortionStrength += (targetDistortionStrength - distortionStrength) * lerpFactor;
      
      if(mountRef.current){
        if(isZoomed){
            mountRef.current.style.cursor = 'zoom-out';
        } else if (isDragging) {
            mountRef.current.style.cursor = 'grabbing';
        } else {
            mountRef.current.style.cursor = 'grab';
        }
      }

      if (plane) {
        plane.material.uniforms.uOffset.value.copy(offset);
        plane.material.uniforms.uZoom.value = zoomLevel;
        plane.material.uniforms.uDistortionStrength.value = distortionStrength;
        if(videoTextureRef.current) videoTextureRef.current.needsUpdate = true;
      }
      
      if(renderer && scene && camera) {
        renderer.render(scene, camera);
      }
    };

    init();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', onWindowResize);
      if(currentMount) {
        currentMount.removeEventListener('mousedown', onPointerDown as EventListener);
        currentMount.removeEventListener('mousemove', onMouseMove);
        currentMount.removeEventListener('mouseup', onPointerUp as EventListener);
        currentMount.removeEventListener('mouseleave', onPointerLeave);
        currentMount.removeEventListener('touchstart', onTouchStart);
        currentMount.removeEventListener('touchmove', onTouchMove);
        currentMount.removeEventListener('touchend', onPointerUp as EventListener);
        currentMount.removeEventListener('wheel', onWheel);
        if (renderer) {
            currentMount.removeChild(renderer.domElement);
        }
        if (videoElement && currentMount.contains(videoElement)) {
            currentMount.removeChild(videoElement);
        }
      }
    };
  }, []);

  return <div ref={mountRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />;
};

export default GalleryComponent;
