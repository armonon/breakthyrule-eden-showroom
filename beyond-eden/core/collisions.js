import * as THREE from 'three/webgpu';

export class CollisionWorld {
  constructor(bounds) {
    this.bounds = bounds;
    this.boxes = [];
  }

  addBox(minX, maxX, minZ, maxZ, { id = '', minY = -Infinity, maxY = Infinity } = {}) {
    const box = { minX, maxX, minZ, maxZ, minY, maxY, id };
    this.boxes.push(box);
    return box;
  }

  removeByPrefix(prefix) {
    this.boxes = this.boxes.filter(box => !box.id.startsWith(prefix));
  }

  groundHeight(x, z) {
    if (Math.abs(x) < 9.5 && z < -28 && z > -39.5) {
      const t = THREE.MathUtils.clamp((-z - 28) / 11.5, 0, 1);
      return t * 3.25;
    }
    if (Math.abs(x) < 12.5 && z <= -39.5 && z >= -45) return 3.25;
    return 0;
  }

  resolve(position, radius = 0.43, height = 1.72) {
    position.x = THREE.MathUtils.clamp(position.x, this.bounds.minX + radius, this.bounds.maxX - radius);
    position.z = THREE.MathUtils.clamp(position.z, this.bounds.minZ + radius, this.bounds.maxZ - radius);

    const feet = this.groundHeight(position.x, position.z);
    for (let pass = 0; pass < 3; pass += 1) {
      let changed = false;
      for (const box of this.boxes) {
        if (feet + height < box.minY || feet > box.maxY) continue;
        const closestX = THREE.MathUtils.clamp(position.x, box.minX, box.maxX);
        const closestZ = THREE.MathUtils.clamp(position.z, box.minZ, box.maxZ);
        const dx = position.x - closestX;
        const dz = position.z - closestZ;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;

        if (d2 > 1e-8) {
          const distance = Math.sqrt(d2);
          const push = radius - distance + 1e-4;
          position.x += (dx / distance) * push;
          position.z += (dz / distance) * push;
        } else {
          const left = Math.abs(position.x - box.minX);
          const right = Math.abs(box.maxX - position.x);
          const top = Math.abs(position.z - box.minZ);
          const bottom = Math.abs(box.maxZ - position.z);
          const min = Math.min(left, right, top, bottom);
          if (min === left) position.x = box.minX - radius;
          else if (min === right) position.x = box.maxX + radius;
          else if (min === top) position.z = box.minZ - radius;
          else position.z = box.maxZ + radius;
        }
        changed = true;
      }
      if (!changed) break;
    }
    position.y = this.groundHeight(position.x, position.z) + height;
    return position;
  }
}
