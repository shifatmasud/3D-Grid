
import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { projects } from '../data';
import { vertexShader, fragmentShader } from '../gl/shaders';

const Gallery: React.FC = () => {
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
      document.body.appendChild(videoElement);
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
        uMousePos: { value: new THREE.Vector2(-1, -1) },
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

      // Case 1: No video to play. Pause the current one.
      if (!newSrc) {
        if (currentNonce === videoRequestNonce) {
          plane.material.uniforms.uIsVideoActive.value = false;
          if (!video.paused) {
            video.pause();
          }
        }
        return;
      }
      
      // Case 2: There is a video to play.
      try {
        if (currentNonce !== videoRequestNonce) return; // Stale request

        // If the source is new, or if the video element is in an error state from a previous attempt,
        // we must (re)load the media.
        if (video.src !== newSrc || video.error) {
          video.src = newSrc;
          video.load(); // Explicitly call load() to clear any error state and begin loading.
        }

        plane.material.uniforms.uHoveredCellId.value.copy(cellId!);

        await video.play();
        
        // After awaiting play, check if this is still the active request.
        if (currentNonce === videoRequestNonce) {
          plane.material.uniforms.uIsVideoActive.value = true;
        } else {
          // A newer request has started, so stop this one.
          if (!video.paused) video.pause();
        }

      } catch (error: any) {
        if (error.name === 'AbortError') {
          // This error is expected when the user moves the mouse quickly,
          // interrupting the video load/play process. We can safely ignore it.
        } else if (currentNonce === videoRequestNonce) {
          // An unexpected error occurred for the _current_ request.
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
        document.body.classList.add('dragging');
        const evt = 'touches' in event ? event.touches[0] : event;
        previousMousePosition = { x: evt.clientX, y: evt.clientY };
        clickStartPosition = { x: evt.clientX, y: evt.clientY };
    };

    const handlePointerMove = (x: number, y: number) => {
        if(plane) {
            plane.material.uniforms.uMousePos.value.set(x, y);
        }

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
        document.body.classList.remove('dragging');
    };

    const onPointerLeave = () => {
        isDragging = false;
        document.body.classList.remove('dragging');
        if (plane) {
            plane.material.uniforms.uMousePos.value.set(-1, -1);
        }
        setVideoState(null);
        hoveredCellIdRef.current = null;
    };
    
    const onTouchStart = (event: TouchEvent) => {
        event.preventDefault();
        onPointerDown(event);
    };

    const onWindowResize = () => {
      if (!renderer || !camera || !plane) return;
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
    };

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const lerpFactor = 0.1;
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
        if (renderer) {
            currentMount.removeChild(renderer.domElement);
        }
      }
      if (videoElement && document.body.contains(videoElement)) {
          document.body.removeChild(videoElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="w-screen h-screen cursor-grab" />;
};

export default Gallery;