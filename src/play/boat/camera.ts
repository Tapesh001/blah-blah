import {
  Matrix4,
  Quaternion,
  Vector3,
  type Object3D,
  type PerspectiveCamera,
} from 'three';
import type { Input } from '../api';
import { clamp, type BoatPhysics } from './physics';

export class BoatCamera {
  firstPerson = false;
  private blend = 0;
  private yaw = 0;
  private pitch = -0.1;
  private readonly thirdPosition = new Vector3();
  private readonly firstPosition = new Vector3();
  private readonly target = new Vector3();
  private readonly look = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly matrix = new Matrix4();
  private readonly thirdRotation = new Quaternion();
  private readonly firstRotation = new Quaternion();
  private readonly targetRotation = new Quaternion();
  private originalFov: number;

  constructor(camera: PerspectiveCamera) {
    this.originalFov = camera.fov;
  }

  update(
    dt: number,
    input: Input,
    state: BoatPhysics,
    boat: Object3D,
    camera: PerspectiveCamera,
  ) {
    if (this.firstPerson) {
      this.yaw = clamp(this.yaw + input.lookX, -2.6, 2.6);
      this.pitch = clamp(this.pitch - input.lookY, -1.1, 1.25);
    }
    const smooth = 1 - Math.exp(-dt * 6);
    this.blend += ((this.firstPerson ? 1 : 0) - this.blend) * smooth;
    const sin = Math.sin(state.heading),
      cos = Math.cos(state.heading);
    this.thirdPosition.set(
      state.x - sin * 10,
      state.y + 4.4,
      state.z + cos * 10,
    );
    this.look.set(state.x + sin * 2, state.y + 1.65, state.z - cos * 2);
    this.matrix.lookAt(this.thirdPosition, this.look, this.up);
    this.thirdRotation.setFromRotationMatrix(this.matrix);
    boat.updateMatrixWorld(true);
    this.firstPosition.set(0.18, 1.65, 2.2).applyMatrix4(boat.matrixWorld);
    this.look.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    this.look.applyQuaternion(boat.quaternion).add(this.firstPosition);
    this.matrix.lookAt(this.firstPosition, this.look, this.up);
    this.firstRotation.setFromRotationMatrix(this.matrix);
    this.target.lerpVectors(this.thirdPosition, this.firstPosition, this.blend);
    this.targetRotation.slerpQuaternions(
      this.thirdRotation,
      this.firstRotation,
      this.blend,
    );
    camera.position.lerp(this.target, 1 - Math.exp(-dt * 10));
    camera.quaternion.slerp(this.targetRotation, 1 - Math.exp(-dt * 10));
    const thirdFov = 60 + clamp(Math.abs(state.speed) * 1.5, 0, 10);
    const targetFov = thirdFov + (78 - thirdFov) * this.blend;
    camera.fov += (targetFov - camera.fov) * smooth;
    camera.updateProjectionMatrix();
  }

  restore(camera: PerspectiveCamera) {
    camera.fov = this.originalFov;
    camera.updateProjectionMatrix();
  }
}
