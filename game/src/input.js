// input.js — keyboard + mouse state, one object the whole sim reads. Keys are
// tracked by code (KeyW, ArrowUp, Space, ...) so layouts do not matter. Mouse
// drag orbits the camera; E is edge-triggered (pressed once per tap).

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered: consumed by the sim each step
    this.dragDX = 0;
    this.dragDY = 0;
    this.dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onBlur = () => { this.keys.clear(); };
    this._onMouseDown = (e) => {
      this.dragging = true;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    };
    this._onMouseMove = (e) => {
      if (!this.dragging) return;
      this.dragDX += e.clientX - this._lastX;
      this.dragDY += e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    };
    this._onMouseUp = () => { this.dragging = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  down(code) { return this.keys.has(code); }

  /** True once for the step in which the key went down. */
  wasPressed(code) { return this.pressed.has(code); }

  /** WASD / arrows as -1..1 axes: x = strafe/right, y = forward. */
  moveAxes() {
    let x = 0, y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return { x, y };
  }

  get run() { return this.down('ShiftLeft') || this.down('ShiftRight'); }
  get handbrake() { return this.down('Space'); }

  /** Consume the accumulated mouse drag for this step; returns { dx, dy }. */
  takeDrag() {
    const d = { dx: this.dragDX, dy: this.dragDY };
    this.dragDX = 0;
    this.dragDY = 0;
    return d;
  }

  /** Clear edge-triggered presses at the end of a sim step. */
  endStep() { this.pressed.clear(); }

  /** Inject a key press (used by staging / probes, never by the player). */
  inject(code) {
    this.keys.add(code);
    this.pressed.add(code);
  }

  release(code) { this.keys.delete(code); }
}
