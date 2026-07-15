import Phaser from 'phaser';
import { WORLD_WIDTH } from './worldConstants';

export const PORTAL_RADIUS = 16;
const PORTAL_FILL_COLOR = 0x000000;
const PORTAL_STROKE_COLOR = 0xd32f2f;
const PORTAL_STROKE_WIDTH = 3;

const CUP_WALL_THICKNESS = 10;

/** Where a won ball should settle: centered and resting on the cup's floor. */
export function cupRestPosition(cup: { x: number; y: number }, ballRadius: number): { x: number; y: number } {
  const floorTopY = cup.y - CUP_WALL_THICKNESS / 2;
  return {
    x: cup.x,
    y: floorTopY - ballRadius,
  };
}

export function buildCup(scene: Phaser.Scene, cup: { x: number; y: number }): void {
  const wallThickness = CUP_WALL_THICKNESS;
  const bottomWidth = 50;
  const topWidth = 90;
  const cupHeight = 60;
  const bottomY = cup.y;
  const topY = cup.y - cupHeight;

  // sides lean outward from the narrow bottom to the wide rim
  const walls: Array<[Phaser.Math.Vector2, Phaser.Math.Vector2]> = [
    [
      new Phaser.Math.Vector2(cup.x - bottomWidth / 2, bottomY),
      new Phaser.Math.Vector2(cup.x - topWidth / 2, topY),
    ],
    [
      new Phaser.Math.Vector2(cup.x + bottomWidth / 2, bottomY),
      new Phaser.Math.Vector2(cup.x + topWidth / 2, topY),
    ],
  ];

  for (const [from, to] of walls) {
    const length = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y);
    const angle = Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y);
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;

    const body = scene.matter.add.rectangle(midX, midY, length, wallThickness, {
      isStatic: true,
      label: 'cupWall',
    });
    scene.matter.body.setAngle(body, angle);

    scene.add.rectangle(midX, midY, length, wallThickness, 0x5d4037).setRotation(angle).setDepth(2);
  }

  // bottom, flat and resting at the lowest point of the cup
  scene.matter.add.rectangle(cup.x, bottomY, bottomWidth + wallThickness, wallThickness, {
    isStatic: true,
    label: 'cupWall',
  });
  scene.add.rectangle(cup.x, bottomY, bottomWidth + wallThickness, wallThickness, 0x5d4037).setDepth(2);

  // win sensor, sits just above the bottom of the cup
  scene.matter.add.rectangle(cup.x, bottomY - 12, bottomWidth - 10, 16, {
    isStatic: true,
    isSensor: true,
    label: 'cupSensor',
  });
}

export function buildKillzone(scene: Phaser.Scene): void {
  scene.matter.add.rectangle(WORLD_WIDTH / 2, 640, WORLD_WIDTH, 20, {
    isStatic: true,
    isSensor: true,
    label: 'killzone',
  });
}

/** A static warp point: touching it instantly sends the ball back to the start, mid-roll. */
export function buildPortal(scene: Phaser.Scene, pos: { x: number; y: number }): void {
  scene.matter.add.circle(pos.x, pos.y, PORTAL_RADIUS, {
    isStatic: true,
    isSensor: true,
    label: 'portal',
  });
  scene.add
    .circle(pos.x, pos.y, PORTAL_RADIUS, PORTAL_FILL_COLOR)
    .setStrokeStyle(PORTAL_STROKE_WIDTH, PORTAL_STROKE_COLOR)
    .setDepth(3);
}
