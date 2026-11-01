import * as THREE from 'three/webgpu';

function canvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  paint(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function createMaterialLibrary() {
  let seed = 0x5eED1234;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const stoneTexture = canvasTexture(512, 512, (ctx, width, height) => {
    ctx.fillStyle = '#777b72';
    ctx.fillRect(0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < image.data.length; i += 4) {
      const noise = (random() - 0.5) * 23;
      image.data[i] = Math.max(0, Math.min(255, image.data[i] + noise));
      image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1] + noise));
      image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2] + noise * 0.75));
    }
    ctx.putImageData(image, 0, 0);
    ctx.strokeStyle = 'rgba(28,32,30,.16)';
    ctx.lineWidth = 2;
    for (let y = 0; y < height; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(y * .2) * 2);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  });
  stoneTexture.repeat.set(4, 4);

  const pavingTexture = canvasTexture(512, 512, (ctx, width, height) => {
    ctx.fillStyle = '#4e5754';
    ctx.fillRect(0, 0, width, height);
    const cell = 32;
    for (let y = 0; y < height; y += cell) {
      for (let x = 0; x < width; x += cell) {
        const value = 63 + ((x * 17 + y * 11) % 18);
        ctx.fillStyle = `rgb(${value},${value + 5},${value + 3})`;
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      }
    }
  });
  pavingTexture.repeat.set(12, 12);

  const mosaicTexture = canvasTexture(1024, 128, (ctx, width, height) => {
    ctx.fillStyle = '#1d3233';
    ctx.fillRect(0, 0, width, height);
    const colors = ['#1d5c65', '#366f70', '#a69255', '#d4b874', '#4e2d2c', '#78908a'];
    const tile = 8;
    for (let y = 0; y < height; y += tile) {
      for (let x = 0; x < width; x += tile) {
        const wave = Math.sin(x * .032) + Math.cos((x + y) * .021);
        const index = Math.abs(Math.floor((wave + 2) * 1.7 + x / 80 + y / 32)) % colors.length;
        ctx.fillStyle = colors[index];
        ctx.fillRect(x + .5, y + .5, tile - 1, tile - 1);
      }
    }
  });
  mosaicTexture.wrapS = THREE.RepeatWrapping;
  mosaicTexture.repeat.x = 3;

  const stone = new THREE.MeshStandardMaterial({
    name: 'Baked limestone proxy',
    color: 0x868b80,
    map: stoneTexture,
    roughness: 0.91,
    metalness: 0,
    vertexColors: true,
  });
  const stoneDark = stone.clone();
  stoneDark.name = 'Recessed limestone proxy';
  stoneDark.color.set(0x4c5551);
  const paving = new THREE.MeshStandardMaterial({ color: 0x53605c, map: pavingTexture, roughness: 1, metalness: 0 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0x4a3727, roughness: .58, metalness: .64 });
  const mosaic = new THREE.MeshStandardMaterial({ color: 0xffffff, map: mosaicTexture, roughness: .7, metalness: .08 });
  const planter = new THREE.MeshStandardMaterial({ color: 0x4a514b, roughness: .93, metalness: 0 });
  const soil = new THREE.MeshStandardMaterial({ color: 0x1d201b, roughness: 1, metalness: 0 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x99c2b6, emissive: 0x18392f, emissiveIntensity: .25, roughness: .22, metalness: .05, transparent: true, opacity: .78 });

  return {
    stone,
    stoneDark,
    paving,
    bronze,
    mosaic,
    planter,
    soil,
    glass,
    dispose() {
      const materials = [stone, stoneDark, paving, bronze, mosaic, planter, soil, glass];
      for (const material of materials) material.dispose();
      for (const texture of [stoneTexture, pavingTexture, mosaicTexture]) texture.dispose();
    },
  };
}
