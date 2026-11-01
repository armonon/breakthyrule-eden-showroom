import * as THREE from 'three/webgpu';

export class FirstPersonController extends EventTarget {
  constructor({ camera, element, collisionWorld, spawn }) {
    super();
    this.camera = camera;
    this.element = element;
    this.collisionWorld = collisionWorld;
    this.position = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
    this.velocity = new THREE.Vector3();
    this.yaw = spawn.yaw || 0;
    this.pitch = -0.03;
    this.keys = new Set();
    this.locked = false;
    this.enabled = true;
    this.distanceTravelled = 0;
    this.lastPosition = this.position.clone();
    this._bind();
    this._syncCamera(0);
  }

  _bind() {
    this.onClick = () => {
      if (!this.enabled || document.pointerLockElement === this.element) return;
      try {
        const request = this.element.requestPointerLock({ unadjustedMovement: true });
        request?.catch?.(() => this.element.requestPointerLock());
      } catch {
        this.element.requestPointerLock();
      }
    };
    this.onPointerLock = () => {
      this.locked = document.pointerLockElement === this.element;
      this.dispatchEvent(new CustomEvent('lockchange', { detail: this.locked }));
    };
    this.onMouseMove = event => {
      if (!this.locked || !this.enabled) return;
      const sensitivity = 0.00175;
      this.yaw -= event.movementX * sensitivity;
      this.pitch -= event.movementY * sensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.42, 1.42);
    };
    this.onKeyDown = event => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      this.keys.add(event.code);
    };
    this.onKeyUp = event => this.keys.delete(event.code);
    this.onBlur = () => this.keys.clear();

    this.element.addEventListener('click', this.onClick);
    document.addEventListener('pointerlockchange', this.onPointerLock);
    document.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  _syncCamera(time) {
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const bob = this.locked ? Math.sin(time * 10.2) * Math.min(0.026, horizontalSpeed * 0.0026) : 0;
    const sway = this.locked ? Math.sin(time * 5.1 + 1.4) * Math.min(0.012, horizontalSpeed * 0.0012) : 0;
    this.camera.position.set(this.position.x + sway, this.position.y + bob, this.position.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  update(dt, time) {
    if (!this.enabled) return;
    const forward = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
    const strafe = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = sprint ? 7.2 : 4.45;
    const input = new THREE.Vector2(strafe, forward);
    if (input.lengthSq() > 1) input.normalize();

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const targetX = (input.x * cos - input.y * sin) * speed;
    const targetZ = (-input.x * sin - input.y * cos) * speed;
    const responsiveness = 1 - Math.exp(-13 * dt);
    this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetX, responsiveness);
    this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetZ, responsiveness);

    const before = this.position.clone();
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.collisionWorld.resolve(this.position);
    const moved = before.distanceTo(this.position);
    this.distanceTravelled += moved;
    this._syncCamera(time);
  }

  forward(target = new THREE.Vector3()) {
    return this.camera.getWorldDirection(target);
  }

  pose() {
    return { x: this.position.x, y: this.position.y, z: this.position.z, yaw: this.yaw, pitch: this.pitch };
  }

  dispose() {
    this.element.removeEventListener('click', this.onClick);
    document.removeEventListener('pointerlockchange', this.onPointerLock);
    document.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
