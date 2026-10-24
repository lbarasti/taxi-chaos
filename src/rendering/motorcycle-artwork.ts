import source from '../assets/motorcycle/wheelie-spritesheet.png?inline';
import frames from '../assets/motorcycle/wheelie-frames.json';
import { clamp } from '../physics/physics';

/** The drawings already contain pitch. Rotate south-facing artwork into
 * vehicle-local +X; never apply the procedural pitch transform again. */
export class MotorcycleArtwork {
  private image?: HTMLImageElement;
  private loading?: Promise<void>;
  load(): Promise<void> {
    return this.loading ??= new Promise(resolve => {
      const image = new Image();
      image.onload = () => { this.image = image; resolve(); };
      image.onerror = () => resolve(); // Keep the procedural bike if decoding fails.
      image.src = source;
    });
  }
  draw(c: CanvasRenderingContext2D, lift: number, roll: number, parcel: boolean, rear: number): boolean {
    if (!this.image) return false;
    const [width, height] = frames.frameSize, [x, y] = frames.anchor;
    const pose = Math.round((1 - clamp(lift, 0, 1)) * (frames.poses.length - 1));
    c.save();
    c.translate(rear, Math.sin(roll) * 0.65);
    c.scale(1, Math.cos(roll));
    c.rotate(-Math.PI / 2);
    c.scale(frames.metresPerPixel, frames.metresPerPixel);
    c.drawImage(this.image, pose * width, 0, width, height, -x, -y, width, height);
    if (parcel) {
      // The authored rack is empty; only an active delivery gets a parcel.
      c.fillStyle = '#dca668'; c.fillRect(-30, -53, 60, 44);
      c.strokeStyle = '#ffe3af'; c.lineWidth = 2; c.strokeRect(-30, -53, 60, 44);
      c.fillStyle = '#fff0c4'; c.fillRect(-5, -53, 10, 44);
    }
    c.restore();
    return true;
  }
}

export const motorcycleArtwork = new MotorcycleArtwork();
