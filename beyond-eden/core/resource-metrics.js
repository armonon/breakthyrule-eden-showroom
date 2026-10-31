const textureByteSize = texture => {
  const image = texture?.image || texture?.source?.data;
  const width = image?.width || image?.videoWidth || texture?.mipmaps?.[0]?.width || 0;
  const height = image?.height || image?.videoHeight || texture?.mipmaps?.[0]?.height || 0;
  if (!width || !height) return 0;

  const mipFactor = texture.generateMipmaps === false ? 1 : 4 / 3;
  const source = String(texture.source?.data?.constructor?.name || '');
  const compressed = texture.isCompressedTexture || source.includes('Compressed');
  const bytesPerPixel = compressed ? 1 : 4;
  return width * height * bytesPerPixel * mipFactor;
};

export function estimateTextureMemory(scene) {
  const textures = new Set();
  scene.traverse(object => {
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  let bytes = 0;
  for (const texture of textures) bytes += textureByteSize(texture);
  return { textures: textures.size, bytes, mebibytes: bytes / 1048576 };
}

export function measureTransferSize() {
  const rows = performance.getEntriesByType('resource').map(entry => ({
    name: entry.name,
    transferSize: entry.transferSize || 0,
    encodedBodySize: entry.encodedBodySize || 0,
    decodedBodySize: entry.decodedBodySize || 0,
    durationMs: entry.duration || 0,
  }));
  const relevant = rows.filter(row => /beyond-eden|three-r187/.test(row.name));
  const sum = key => relevant.reduce((total, row) => total + (row[key] || 0), 0);
  return {
    resourceCount: relevant.length,
    transferBytes: sum('transferSize'),
    encodedBytes: sum('encodedBodySize'),
    decodedBytes: sum('decodedBodySize'),
    transferMiB: sum('transferSize') / 1048576,
    encodedMiB: sum('encodedBodySize') / 1048576,
    resources: relevant,
  };
}

export function rendererCounters(renderer) {
  const render = renderer.info?.render || {};
  const memory = renderer.info?.memory || {};
  return {
    drawCalls: render.calls ?? null,
    triangles: render.triangles ?? null,
    points: render.points ?? null,
    lines: render.lines ?? null,
    geometries: memory.geometries ?? null,
    rendererTextures: memory.textures ?? null,
  };
}
