
import * as THREE from 'three';

export const createTextTexture = (title: string, year: number): THREE.CanvasTexture => {
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

export const createTextureAtlas = (textures: THREE.Texture[], isText: boolean): THREE.CanvasTexture => {
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
