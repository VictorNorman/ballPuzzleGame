import Phaser from 'phaser';
import { physicsSettings, setGravitySliderEnabled } from '../physicsSettings';
import type { ToolType } from '../toolSettings';
import { setActiveToolButton, setToolPaletteEnabled, setToolSelectHandler } from '../toolSettings';

type GameState = 'placing' | 'rolling' | 'won';

interface PlacedBoard {
  type: 'board';
  p1: Phaser.Math.Vector2;
  p2: Phaser.Math.Vector2;
  body: MatterJS.BodyType;
  view: Phaser.GameObjects.Rectangle;
}

interface PlacedSpring {
  type: 'spring';
  pos: Phaser.Math.Vector2;
  angle: number;
  body: MatterJS.BodyType;
  capBody: MatterJS.BodyType;
  view: Phaser.GameObjects.Graphics;
}

type PlacedElement = PlacedBoard | PlacedSpring;

const BALL_RADIUS = 12;
const PLACEMENT_AREA_TOP = 60;
export const WORLD_WIDTH = 900;
export const WORLD_HEIGHT = 600;

const BOARD_THICKNESS = 14;
const BOARD_MIN_LENGTH = 24;
const BOARD_COLOR = 0x6d4c41;
const BOARD_SELECTED_COLOR = 0x8d6e63;
const BOARD_PREVIEW_COLOR = 0x8d6e63;
const BOARD_HOVER_PREVIEW_LENGTH = 70;
const TOOL_HOVER_ALPHA = 0.5;

const SPRING_WIDTH = 30;
const SPRING_HEIGHT = 46;
const SPRING_COLOR = 0xffa000;
const SPRING_SELECTED_COLOR = 0xffd54f;
const SPRING_LAUNCH_SPEED = 13;
const SPRING_CAP_WIDTH = SPRING_WIDTH + 10;
const SPRING_CAP_THICKNESS = 10;
const SPRING_CAP_COLOR = 0x6d4c41;

const SELECT_HIT_MARGIN = 10;

const HANDLE_RADIUS = 8;
const HANDLE_HIT_RADIUS = 14;
const HANDLE_COLOR = 0xffffff;
const HANDLE_STROKE_COLOR = 0x1565c0;

const SPRING_ROTATE_HANDLE_GAP = 8;
const SPRING_HANDLE_RADIUS = HANDLE_RADIUS * 0.75;
const SPRING_HANDLE_HIT_RADIUS = HANDLE_HIT_RADIUS * 0.75;
const SPRING_ROTATE_ARROW_SIZE = 3;
const SPRING_ROTATE_ARROW_GAP = 2;
const SPRING_MAX_ROTATION = Math.PI / 3;

// centered so the icon's edges sit at the same 20px/16px margin used by
// the level label and Reset button (icon is 34px wide, 26px tall body)
const TRASH_X = 20 + 17;
const TRASH_Y = WORLD_HEIGHT - 16 - 13;
const TRASH_HIT_RADIUS = 30;
const TRASH_COLOR = 0x455a64;
const TRASH_HIGHLIGHT_COLOR = 0xd32f2f;

function distanceToSegment(
  p: Phaser.Math.Vector2,
  a: Phaser.Math.Vector2,
  b: Phaser.Math.Vector2
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq === 0) {
    return Phaser.Math.Distance.Between(p.x, p.y, a.x, a.y);
  }
  const t = Phaser.Math.Clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq, 0, 1);
  const projX = a.x + t * abx;
  const projY = a.y + t * aby;
  return Phaser.Math.Distance.Between(p.x, p.y, projX, projY);
}

export abstract class BaseLevelScene extends Phaser.Scene {
  protected abstract readonly levelLabel: string;
  protected abstract readonly nextLevelKey: string | null;
  protected readonly start: { x: number; y: number } = {
    x: 90,
    y: 100,
  };
  protected readonly cup: { x: number; y: number } = {
    x: 780,
    y: 540,
  };

  private state: GameState = 'placing';
  private activeTool: ToolType | null = null;
  private placedElements: PlacedElement[] = [];
  private selectedElement: PlacedElement | null = null;
  private isDraggingSelected = false;
  private dragAnchor = new Phaser.Math.Vector2();
  private dragOrigin: {
    p1?: Phaser.Math.Vector2;
    p2?: Phaser.Math.Vector2;
    pos?: Phaser.Math.Vector2;
  } = {};
  private pendingBoardStart: Phaser.Math.Vector2 | null = null;
  private boardPreview?: Phaser.GameObjects.Rectangle;
  private toolHoverPreview?: Phaser.GameObjects.Graphics;
  private selectionHandles: (Phaser.GameObjects.Arc | Phaser.GameObjects.Graphics)[] = [];
  private draggingHandle: 'p1' | 'p2' | 'rotate' | null = null;
  private trashHighlighted = false;

  private ball!: MatterJS.BodyType;
  private trashCan!: Phaser.GameObjects.Graphics;
  private ballSprite!: Phaser.GameObjects.Graphics;
  private goButton!: Phaser.GameObjects.Text;
  private nextLevelButton?: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private instructionsText!: Phaser.GameObjects.Text;

  /** Override to add level-specific static obstacles (called once from create()). */
  protected buildObstacles(): void {}

  create() {
    setGravitySliderEnabled(true);
    this.matter.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 32, true, true, true, false);

    this.add
      .text(20, 16, this.levelLabel, {
        fontSize: '20px',
        color: '#0b1f33',
      })
      .setDepth(10);

    this.instructionsText = this.add
      .text(20, 40, '', {
        fontSize: '14px',
        color: '#0b1f33',
      })
      .setDepth(10);

    this.buildCup();
    this.buildKillzone();
    this.buildTrashCan();
    this.buildObstacles();

    setToolSelectHandler((tool) => this.selectTool(tool));
    setActiveToolButton(null);
    setToolPaletteEnabled(true);

    this.add
      .text(WORLD_WIDTH - 90, 16, 'Reset', {
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#33415522',
        padding: {
          x: 10,
          y: 6,
        },
      })
      .setDepth(10)
      .setInteractive({
        useHandCursor: true,
      })
      .on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.resetLevel();
      });

    this.goButton = this.add
      .text(WORLD_WIDTH / 2, 560, 'Go', {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#2e7d32',
        padding: {
          x: 24,
          y: 8,
        },
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setInteractive({
        useHandCursor: true,
      })
      .on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.releaseBall();
      });

    this.messageText = this.add
      .text(WORLD_WIDTH / 2, 260, '', {
        fontSize: '24px',
        color: '#ffffff',
        backgroundColor: '#00000099',
        padding: {
          x: 20,
          y: 12,
        },
        align: 'center',
        wordWrap: {
          width: WORLD_WIDTH - 120,
          useAdvancedWrap: true,
        },
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false);

    if (this.nextLevelKey) {
      this.nextLevelButton = this.add
        .text(WORLD_WIDTH / 2, 330, 'Next Level', {
          fontSize: '20px',
          color: '#ffffff',
          backgroundColor: '#1565c0',
          padding: {
            x: 24,
            y: 8,
          },
        })
        .setOrigin(0.5)
        .setDepth(20)
        .setInteractive({
          useHandCursor: true,
        })
        .on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          this.scene.start(this.nextLevelKey!);
        })
        .setVisible(false);
    }

    this.spawnBall();
    this.instructionsText.setText(this.instructionsForTool());

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);

    this.matter.world.on('collisionstart', (event: MatterJS.IEventCollision<MatterJS.Engine>) => {
      for (const pair of event.pairs) {
        const bodyA = pair.bodyA as unknown as MatterJS.BodyType;
        const bodyB = pair.bodyB as unknown as MatterJS.BodyType;
        const labels = [bodyA.label, bodyB.label];
        if (labels.includes('ball') && labels.includes('cupSensor')) {
          this.onWin();
        }
        if (labels.includes('ball') && labels.includes('killzone')) {
          this.onMiss();
        }
        if (labels.includes('ball') && labels.includes('spring') && this.state === 'rolling') {
          const capBody = bodyA.label === 'spring' ? bodyA : bodyB;
          const spring = this.placedElements.find(
            (item): item is PlacedSpring => item.type === 'spring' && item.capBody === capBody
          );
          if (spring) {
            this.launchBallFromSpring(spring);
            this.playSpringBounce(spring);
          }
        }
      }
    });
  }

  private buildTrashCan() {
    this.trashCan = this.add.graphics().setDepth(9);
    this.drawTrashCan(false);
  }

  private drawTrashCan(highlighted: boolean) {
    const color = highlighted ? TRASH_HIGHLIGHT_COLOR : TRASH_COLOR;
    const bodyTopWidth = 28;
    const bodyBottomWidth = 20;
    const bodyHeight = 26;
    const lidWidth = 34;
    const lidHeight = 6;

    const bodyTopY = TRASH_Y - bodyHeight / 2;
    const bodyBottomY = TRASH_Y + bodyHeight / 2;
    const lidY = bodyTopY - lidHeight / 2 - 2;

    const g = this.trashCan;
    g.clear();

    g.fillStyle(color, 1);
    g.fillRect(TRASH_X - 6, lidY - lidHeight / 2 - 6, 12, 6);
    g.fillRoundedRect(TRASH_X - lidWidth / 2, lidY - lidHeight / 2, lidWidth, lidHeight, 2);

    g.beginPath();
    g.moveTo(TRASH_X - bodyTopWidth / 2, bodyTopY);
    g.lineTo(TRASH_X + bodyTopWidth / 2, bodyTopY);
    g.lineTo(TRASH_X + bodyBottomWidth / 2, bodyBottomY);
    g.lineTo(TRASH_X - bodyBottomWidth / 2, bodyBottomY);
    g.closePath();
    g.fillPath();

    g.lineStyle(2, 0x1c2b30, 1);
    g.beginPath();
    g.moveTo(TRASH_X - 6, bodyTopY + 4);
    g.lineTo(TRASH_X - 4, bodyBottomY - 4);
    g.moveTo(TRASH_X, bodyTopY + 4);
    g.lineTo(TRASH_X, bodyBottomY - 4);
    g.moveTo(TRASH_X + 6, bodyTopY + 4);
    g.lineTo(TRASH_X + 4, bodyBottomY - 4);
    g.strokePath();
  }

  private isOverTrash(pos: Phaser.Math.Vector2): boolean {
    return Phaser.Math.Distance.Between(pos.x, pos.y, TRASH_X, TRASH_Y) <= TRASH_HIT_RADIUS;
  }

  private setTrashHighlighted(on: boolean) {
    if (this.trashHighlighted === on) {
      return;
    }
    this.trashHighlighted = on;
    this.drawTrashCan(on);
  }

  private deleteSelectedElement() {
    const el = this.selectedElement;
    if (!el) {
      return;
    }
    this.clearHandles();
    this.removeElementBodies(el);
    el.view.destroy();
    this.placedElements = this.placedElements.filter((item) => item !== el);
    this.selectedElement = null;
  }

  private removeElementBodies(el: PlacedElement) {
    this.matter.world.remove(el.body);
    if (el.type === 'spring') {
      this.matter.world.remove(el.capBody);
    }
  }

  private selectTool(tool: ToolType) {
    if (this.state !== 'placing') {
      return;
    }
    this.messageText.setVisible(false);
    this.cancelPendingBoard();
    this.clearSelection();
    this.clearToolHoverPreview();
    this.activeTool = this.activeTool === tool ? null : tool;
    setActiveToolButton(this.activeTool);
    this.instructionsText.setText(this.instructionsForTool());
  }

  private instructionsForTool(): string {
    if (this.activeTool === 'board') {
      return 'Click one end of the board, then click the other end. Click the board icon again to stop.';
    }
    if (this.activeTool === 'spring') {
      return 'Click anywhere to place a spring. Click the spring icon again to stop.';
    }
    return 'Pick a piece to place, or drag a placed piece to move it. Press Go when ready.';
  }

  private buildCup() {
    const wallThickness = 10;
    const bottomWidth = 50;
    const topWidth = 90;
    const cupHeight = 60;
    const bottomY = this.cup.y;
    const topY = this.cup.y - cupHeight;

    // sides lean outward from the narrow bottom to the wide rim
    const walls: Array<[Phaser.Math.Vector2, Phaser.Math.Vector2]> = [
      [
        new Phaser.Math.Vector2(this.cup.x - bottomWidth / 2, bottomY),
        new Phaser.Math.Vector2(this.cup.x - topWidth / 2, topY),
      ],
      [
        new Phaser.Math.Vector2(this.cup.x + bottomWidth / 2, bottomY),
        new Phaser.Math.Vector2(this.cup.x + topWidth / 2, topY),
      ],
    ];

    for (const [from, to] of walls) {
      const length = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y);
      const angle = Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y);
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;

      const body = this.matter.add.rectangle(midX, midY, length, wallThickness, {
        isStatic: true,
        label: 'cupWall',
      });
      this.matter.body.setAngle(body, angle);

      this.add.rectangle(midX, midY, length, wallThickness, 0x5d4037).setRotation(angle).setDepth(2);
    }

    // bottom, flat and resting at the lowest point of the cup
    this.matter.add.rectangle(this.cup.x, bottomY, bottomWidth + wallThickness, wallThickness, {
      isStatic: true,
      label: 'cupWall',
    });
    this.add.rectangle(this.cup.x, bottomY, bottomWidth + wallThickness, wallThickness, 0x5d4037).setDepth(2);

    // win sensor, sits just above the bottom of the cup
    this.matter.add.rectangle(this.cup.x, bottomY - 12, bottomWidth - 10, 16, {
      isStatic: true,
      isSensor: true,
      label: 'cupSensor',
    });
  }

  private buildKillzone() {
    this.matter.add.rectangle(WORLD_WIDTH / 2, 640, WORLD_WIDTH, 20, {
      isStatic: true,
      isSensor: true,
      label: 'killzone',
    });
  }

  private spawnBall() {
    // isStatic must NOT be passed in the creation options: Matter only
    // snapshots the body's mass/inertia for later restoration when
    // setStatic() is called as a separate step after creation. A body
    // born static has no snapshot, so releasing it later leaves mass at
    // Infinity forever and the next physics step produces NaN velocity.
    this.ball = this.matter.add.circle(this.start.x, this.start.y, BALL_RADIUS, {
      restitution: 0.15,
      friction: 0.04,
      frictionAir: 0.0008,
      density: 0.004,
      label: 'ball',
    });
    this.matter.body.setStatic(this.ball, true);
    this.ballSprite = this.add.graphics().setPosition(this.start.x, this.start.y).setDepth(6);
    this.drawBallGraphic(this.ballSprite);
  }

  private drawBallGraphic(view: Phaser.GameObjects.Graphics) {
    view.clear();
    view.fillStyle(0xff5252, 1);
    view.fillCircle(0, 0, BALL_RADIUS);

    // diagonal stripe so rotation is visible while it rolls (kept off-axis
    // so it doesn't read as a "no entry" sign like a horizontal bar would)
    const stripeWidth = BALL_RADIUS * 1.8;
    const stripeHeight = 5;
    view.fillStyle(0x2979ff, 1);
    view.rotateCanvas(Math.PI / 4);
    view.fillRect(-stripeWidth / 2, -stripeHeight / 2, stripeWidth, stripeHeight);
  }

  update() {
    this.matter.world.engine.world.gravity.y = physicsSettings.gravityY;

    if (this.ball) {
      const pos = this.ball.position;
      this.ballSprite.setPosition(pos.x, pos.y);
      this.ballSprite.setRotation(this.ball.angle);
    }
  }

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    if (this.state !== 'placing') {
      return;
    }
    if (pointer.y < PLACEMENT_AREA_TOP) {
      return;
    }
    this.messageText.setVisible(false);
    const pos = new Phaser.Math.Vector2(pointer.x, pointer.y);

    if (this.activeTool === 'board') {
      if (!this.pendingBoardStart) {
        this.pendingBoardStart = pos;
        this.startBoardPreview(pos);
      } else {
        this.finalizeBoard(this.pendingBoardStart, pos);
        this.pendingBoardStart = null;
        this.clearBoardPreview();
      }
      return;
    }

    if (this.activeTool === 'spring') {
      this.placeSpring(pos);
      return;
    }

    if (this.selectedElement) {
      const handle = this.findHandleAt(pos, this.selectedElement);
      if (handle) {
        this.draggingHandle = handle;
        return;
      }
    }

    const hit = this.findElementAt(pos);
    this.clearSelection();
    if (hit) {
      this.selectedElement = hit;
      this.isDraggingSelected = true;
      this.dragAnchor.copy(pos);
      this.dragOrigin =
        hit.type === 'board'
          ? {
              p1: hit.p1.clone(),
              p2: hit.p2.clone(),
            }
          : {
              pos: hit.pos.clone(),
            };
      this.setElementHighlight(hit, true);
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    if (this.state !== 'placing') {
      return;
    }
    const pos = new Phaser.Math.Vector2(pointer.x, pointer.y);

    if (pointer.y < PLACEMENT_AREA_TOP) {
      this.clearToolHoverPreview();
    } else {
      this.updateToolHoverPreview(pos);
    }

    if (this.activeTool === 'board' && this.pendingBoardStart) {
      this.updateBoardPreview(this.pendingBoardStart, pos);
      return;
    }

    if (this.draggingHandle === 'p1' || this.draggingHandle === 'p2') {
      if (this.selectedElement?.type === 'board') {
        this.dragBoardHandle(this.selectedElement, this.draggingHandle, pos);
      }
      return;
    }

    if (this.draggingHandle === 'rotate') {
      if (this.selectedElement?.type === 'spring') {
        this.dragSpringHandle(this.selectedElement, pos);
      }
      return;
    }

    if (this.isDraggingSelected && this.selectedElement) {
      this.dragSelectedElement(pos);
      this.setTrashHighlighted(this.isOverTrash(pos));
    }
  }

  private onPointerUp() {
    if (this.isDraggingSelected && this.selectedElement && this.trashHighlighted) {
      this.deleteSelectedElement();
    }
    this.isDraggingSelected = false;
    this.draggingHandle = null;
    this.setTrashHighlighted(false);
  }

  private startBoardPreview(anchor: Phaser.Math.Vector2) {
    this.boardPreview = this.add
      .rectangle(anchor.x, anchor.y, 1, BOARD_THICKNESS, BOARD_PREVIEW_COLOR, 0.6)
      .setDepth(4);
  }

  private updateBoardPreview(anchor: Phaser.Math.Vector2, pos: Phaser.Math.Vector2) {
    if (!this.boardPreview) {
      return;
    }
    const length = Math.max(1, Phaser.Math.Distance.Between(anchor.x, anchor.y, pos.x, pos.y));
    const angle = Phaser.Math.Angle.Between(anchor.x, anchor.y, pos.x, pos.y);
    const midX = (anchor.x + pos.x) / 2;
    const midY = (anchor.y + pos.y) / 2;
    this.boardPreview.setPosition(midX, midY).setRotation(angle).setSize(length, BOARD_THICKNESS);
  }

  private clearBoardPreview() {
    this.boardPreview?.destroy();
    this.boardPreview = undefined;
  }

  /**
   * Ghost of the selected tool that follows the cursor before the first
   * click: a spring for the spring tool, or a default-length segment for
   * the board tool (which switches to the anchor-to-cursor boardPreview
   * once its first endpoint is placed).
   */
  private updateToolHoverPreview(pos: Phaser.Math.Vector2) {
    const showSpring = this.activeTool === 'spring';
    const showBoard = this.activeTool === 'board' && !this.pendingBoardStart;
    if (!showSpring && !showBoard) {
      this.clearToolHoverPreview();
      return;
    }

    if (!this.toolHoverPreview) {
      this.toolHoverPreview = this.add.graphics().setDepth(4).setAlpha(TOOL_HOVER_ALPHA);
    }
    const view = this.toolHoverPreview;
    view.setPosition(pos.x, pos.y).setRotation(0);
    view.clear();

    if (showSpring) {
      this.drawSpring(view, SPRING_COLOR);
    } else {
      view.fillStyle(BOARD_PREVIEW_COLOR, 1);
      view.fillRect(
        -BOARD_HOVER_PREVIEW_LENGTH / 2,
        -BOARD_THICKNESS / 2,
        BOARD_HOVER_PREVIEW_LENGTH,
        BOARD_THICKNESS
      );
    }
  }

  private clearToolHoverPreview() {
    this.toolHoverPreview?.destroy();
    this.toolHoverPreview = undefined;
  }

  private cancelPendingBoard() {
    this.pendingBoardStart = null;
    this.clearBoardPreview();
  }

  private finalizeBoard(p1: Phaser.Math.Vector2, p2: Phaser.Math.Vector2) {
    const length = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
    if (length < BOARD_MIN_LENGTH) {
      return;
    }

    const angle = Phaser.Math.Angle.Between(p1.x, p1.y, p2.x, p2.y);
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    const body = this.matter.add.rectangle(midX, midY, length, BOARD_THICKNESS, {
      isStatic: true,
      friction: 0.06,
      label: 'board',
    });
    this.matter.body.setAngle(body, angle);

    const view = this.add
      .rectangle(midX, midY, length, BOARD_THICKNESS, BOARD_COLOR)
      .setRotation(angle)
      .setDepth(4);

    const el: PlacedBoard = {
      type: 'board',
      p1: p1.clone(),
      p2: p2.clone(),
      body,
      view,
    };
    this.placedElements.push(el);
    this.finishPlacing(el);
  }

  private placeSpring(pos: Phaser.Math.Vector2) {
    const angle = 0;

    // the coil itself is a plain solid obstacle; only the thin cap board on
    // top is labeled 'spring', so the launch only triggers when the ball
    // clearly lands on the board, not when it grazes the coil's sides
    const body = this.matter.add.rectangle(pos.x, pos.y, SPRING_WIDTH, SPRING_HEIGHT, {
      isStatic: true,
      friction: 0.05,
      label: 'obstacle',
    });

    const capPos = this.springCapPosition(pos, angle);
    const capBody = this.matter.add.rectangle(capPos.x, capPos.y, SPRING_CAP_WIDTH, SPRING_CAP_THICKNESS, {
      isStatic: true,
      friction: 0.05,
      label: 'spring',
    });

    const view = this.add.graphics().setPosition(pos.x, pos.y).setDepth(4);
    this.drawSpring(view, SPRING_COLOR);

    const el: PlacedSpring = {
      type: 'spring',
      pos: pos.clone(),
      angle,
      body,
      capBody,
      view,
    };
    this.placedElements.push(el);
    this.finishPlacing(el);
  }

  /** Direction the spring launches toward: straight up (0, -1) at angle 0. */
  private springDirection(angle: number): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(Math.sin(angle), -Math.cos(angle));
  }

  /** Perpendicular to springDirection; the axis along which incoming speed is preserved. */
  private springTangent(angle: number): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(Math.cos(angle), Math.sin(angle));
  }

  private angleFromPosToPoint(pos: Phaser.Math.Vector2, point: Phaser.Math.Vector2): number {
    return Math.atan2(point.x - pos.x, -(point.y - pos.y));
  }

  private launchBallFromSpring(spring: PlacedSpring) {
    const dir = this.springDirection(spring.angle);
    const tangent = this.springTangent(spring.angle);
    const v = this.ball.velocity;
    const tangentialSpeed = v.x * tangent.x + v.y * tangent.y;
    this.matter.body.setVelocity(this.ball, {
      x: tangent.x * tangentialSpeed + dir.x * SPRING_LAUNCH_SPEED,
      y: tangent.y * tangentialSpeed + dir.y * SPRING_LAUNCH_SPEED,
    });
  }

  /**
   * Called right after a new piece is created: turns the placement tool off
   * and selects the piece, so the user can immediately drag or trash it
   * without an extra click to leave placement mode first.
   */
  private finishPlacing(el: PlacedElement) {
    this.activeTool = null;
    setActiveToolButton(null);
    this.clearToolHoverPreview();
    this.selectElement(el);
    this.instructionsText.setText(this.instructionsForTool());
  }

  private selectElement(el: PlacedElement) {
    this.clearSelection();
    this.selectedElement = el;
    this.setElementHighlight(el, true);
  }

  private springCapPosition(pos: Phaser.Math.Vector2, angle: number): Phaser.Math.Vector2 {
    const offset = SPRING_HEIGHT / 2 + SPRING_CAP_THICKNESS / 2;
    const dir = this.springDirection(angle);
    return new Phaser.Math.Vector2(pos.x + dir.x * offset, pos.y + dir.y * offset);
  }

  /** Sits just past the outer face of the cap, clear of the spring itself. */
  private springHandlePosition(pos: Phaser.Math.Vector2, angle: number): Phaser.Math.Vector2 {
    const offset = SPRING_HEIGHT / 2 + SPRING_CAP_THICKNESS + SPRING_ROTATE_HANDLE_GAP;
    const dir = this.springDirection(angle);
    return new Phaser.Math.Vector2(pos.x + dir.x * offset, pos.y + dir.y * offset);
  }

  private rebuildSpringBodies(el: PlacedSpring) {
    this.matter.world.remove(el.body);
    this.matter.world.remove(el.capBody);

    el.body = this.matter.add.rectangle(el.pos.x, el.pos.y, SPRING_WIDTH, SPRING_HEIGHT, {
      isStatic: true,
      friction: 0.05,
      label: 'obstacle',
    });
    this.matter.body.setAngle(el.body, el.angle);

    const capPos = this.springCapPosition(el.pos, el.angle);
    el.capBody = this.matter.add.rectangle(capPos.x, capPos.y, SPRING_CAP_WIDTH, SPRING_CAP_THICKNESS, {
      isStatic: true,
      friction: 0.05,
      label: 'spring',
    });
    this.matter.body.setAngle(el.capBody, el.angle);

    el.view.setRotation(el.angle);
  }

  private drawSpring(view: Phaser.GameObjects.Graphics, color: number) {
    view.clear();

    // no background fill: the coil sits on a transparent backdrop
    view.lineStyle(3, color, 1);
    view.beginPath();
    const coils = 4;
    for (let i = 0; i <= coils; i++) {
      const y = SPRING_HEIGHT / 2 - i * (SPRING_HEIGHT / coils);
      const x = i % 2 === 0 ? -SPRING_WIDTH / 2 + 4 : SPRING_WIDTH / 2 - 4;
      if (i === 0) {
        view.moveTo(x, y);
      } else {
        view.lineTo(x, y);
      }
    }
    view.strokePath();

    // thin board cap: the ball must land here to bounce
    view.fillStyle(SPRING_CAP_COLOR, 1);
    view.fillRect(-SPRING_CAP_WIDTH / 2, -SPRING_HEIGHT / 2 - SPRING_CAP_THICKNESS, SPRING_CAP_WIDTH, SPRING_CAP_THICKNESS);
  }

  /**
   * Squashes the spring's graphic toward its fixed base and springs it back,
   * so the coil visibly compresses at the moment the ball lands on it.
   */
  private playSpringBounce(el: PlacedSpring) {
    const view = el.view;
    const baseY = el.pos.y + SPRING_HEIGHT / 2;

    this.tweens.killTweensOf(view);
    view.setScale(1, 1);
    view.y = el.pos.y;

    this.tweens.add({
      targets: view,
      scaleX: 1.2,
      scaleY: 0.5,
      duration: 90,
      yoyo: true,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        view.y = baseY - (SPRING_HEIGHT / 2) * view.scaleY;
      },
      onComplete: () => {
        view.setScale(1, 1);
        view.y = el.pos.y;
      },
    });
  }

  private findElementAt(pos: Phaser.Math.Vector2): PlacedElement | null {
    for (let i = this.placedElements.length - 1; i >= 0; i--) {
      const el = this.placedElements[i];
      if (el.type === 'board') {
        if (distanceToSegment(pos, el.p1, el.p2) <= BOARD_THICKNESS / 2 + SELECT_HIT_MARGIN) {
          return el;
        }
      } else {
        if (Phaser.Math.Distance.Between(pos.x, pos.y, el.pos.x, el.pos.y) <= SPRING_WIDTH / 2 + SELECT_HIT_MARGIN) {
          return el;
        }
      }
    }
    return null;
  }

  private setElementHighlight(el: PlacedElement, on: boolean) {
    if (el.type === 'board') {
      el.view.setFillStyle(on ? BOARD_SELECTED_COLOR : BOARD_COLOR);
      if (on) {
        this.showHandlesForBoard(el);
      } else {
        this.clearHandles();
      }
    } else {
      this.drawSpring(el.view, on ? SPRING_SELECTED_COLOR : SPRING_COLOR);
      if (on) {
        this.showHandleForSpring(el);
      } else {
        this.clearHandles();
      }
    }
  }

  private showHandlesForBoard(el: PlacedBoard) {
    this.clearHandles();
    for (const point of [el.p1, el.p2]) {
      this.selectionHandles.push(
        this.add
          .circle(point.x, point.y, HANDLE_RADIUS, HANDLE_COLOR)
          .setStrokeStyle(2, HANDLE_STROKE_COLOR)
          .setDepth(6)
      );
    }
  }

  private updateBoardHandlePositions(el: PlacedBoard) {
    this.selectionHandles[0]?.setPosition(el.p1.x, el.p1.y);
    this.selectionHandles[1]?.setPosition(el.p2.x, el.p2.y);
  }

  /**
   * The rotate handle floats just above the spring's cap; dragging it
   * re-aims the launch angle. Small left/right arrows flank the handle,
   * kept parallel to the cap by matching the spring's own rotation, to
   * hint that it slides sideways rather than lifts off.
   */
  private showHandleForSpring(el: PlacedSpring) {
    this.clearHandles();
    const handlePos = this.springHandlePosition(el.pos, el.angle);
    const handle = this.add
      .graphics()
      .setPosition(handlePos.x, handlePos.y)
      .setRotation(el.angle)
      .setDepth(6);
    this.drawRotateHandle(handle);
    this.selectionHandles.push(handle);
  }

  private drawRotateHandle(g: Phaser.GameObjects.Graphics) {
    g.clear();
    g.fillStyle(HANDLE_COLOR, 1);
    g.fillCircle(0, 0, SPRING_HANDLE_RADIUS);
    g.lineStyle(2, HANDLE_STROKE_COLOR, 1);
    g.strokeCircle(0, 0, SPRING_HANDLE_RADIUS);

    const arrowX = SPRING_HANDLE_RADIUS + SPRING_ROTATE_ARROW_GAP;
    g.fillStyle(HANDLE_STROKE_COLOR, 1);
    g.fillTriangle(
      -arrowX - SPRING_ROTATE_ARROW_SIZE,
      0,
      -arrowX,
      -SPRING_ROTATE_ARROW_SIZE,
      -arrowX,
      SPRING_ROTATE_ARROW_SIZE
    );
    g.fillTriangle(
      arrowX + SPRING_ROTATE_ARROW_SIZE,
      0,
      arrowX,
      -SPRING_ROTATE_ARROW_SIZE,
      arrowX,
      SPRING_ROTATE_ARROW_SIZE
    );
  }

  private updateSpringHandlePosition(el: PlacedSpring) {
    const handlePos = this.springHandlePosition(el.pos, el.angle);
    this.selectionHandles[0]?.setPosition(handlePos.x, handlePos.y).setRotation(el.angle);
  }

  private clearHandles() {
    for (const handle of this.selectionHandles) {
      handle.destroy();
    }
    this.selectionHandles = [];
  }

  private findHandleAt(pos: Phaser.Math.Vector2, el: PlacedElement): 'p1' | 'p2' | 'rotate' | null {
    if (el.type === 'board') {
      if (Phaser.Math.Distance.Between(pos.x, pos.y, el.p1.x, el.p1.y) <= HANDLE_HIT_RADIUS) {
        return 'p1';
      }
      if (Phaser.Math.Distance.Between(pos.x, pos.y, el.p2.x, el.p2.y) <= HANDLE_HIT_RADIUS) {
        return 'p2';
      }
      return null;
    }
    const handlePos = this.springHandlePosition(el.pos, el.angle);
    if (Phaser.Math.Distance.Between(pos.x, pos.y, handlePos.x, handlePos.y) <= SPRING_HANDLE_HIT_RADIUS) {
      return 'rotate';
    }
    return null;
  }

  private dragBoardHandle(el: PlacedBoard, handle: 'p1' | 'p2', pos: Phaser.Math.Vector2) {
    if (handle === 'p1') {
      el.p1 = pos.clone();
    } else {
      el.p2 = pos.clone();
    }
    this.rebuildBoardBody(el);
    this.updateBoardHandlePositions(el);
  }

  private dragSpringHandle(el: PlacedSpring, pos: Phaser.Math.Vector2) {
    const angle = this.angleFromPosToPoint(el.pos, pos);
    el.angle = Phaser.Math.Clamp(angle, -SPRING_MAX_ROTATION, SPRING_MAX_ROTATION);
    this.rebuildSpringBodies(el);
    this.updateSpringHandlePosition(el);
  }

  private rebuildBoardBody(el: PlacedBoard) {
    const length = Math.max(1, Phaser.Math.Distance.Between(el.p1.x, el.p1.y, el.p2.x, el.p2.y));
    const angle = Phaser.Math.Angle.Between(el.p1.x, el.p1.y, el.p2.x, el.p2.y);
    const midX = (el.p1.x + el.p2.x) / 2;
    const midY = (el.p1.y + el.p2.y) / 2;

    this.matter.world.remove(el.body);
    el.body = this.matter.add.rectangle(midX, midY, length, BOARD_THICKNESS, {
      isStatic: true,
      friction: 0.06,
      label: 'board',
    });
    this.matter.body.setAngle(el.body, angle);

    el.view.setPosition(midX, midY).setRotation(angle).setSize(length, BOARD_THICKNESS);
  }

  private clearSelection() {
    if (this.selectedElement) {
      this.setElementHighlight(this.selectedElement, false);
    }
    this.selectedElement = null;
    this.isDraggingSelected = false;
    this.draggingHandle = null;
  }

  private dragSelectedElement(pos: Phaser.Math.Vector2) {
    const el = this.selectedElement!;
    const deltaX = pos.x - this.dragAnchor.x;
    const deltaY = pos.y - this.dragAnchor.y;

    if (el.type === 'board') {
      el.p1 = this.dragOrigin.p1!.clone().add({
        x: deltaX,
        y: deltaY,
      });
      el.p2 = this.dragOrigin.p2!.clone().add({
        x: deltaX,
        y: deltaY,
      });
      const midX = (el.p1.x + el.p2.x) / 2;
      const midY = (el.p1.y + el.p2.y) / 2;
      const angle = Phaser.Math.Angle.Between(el.p1.x, el.p1.y, el.p2.x, el.p2.y);
      el.view.setPosition(midX, midY).setRotation(angle);
      this.matter.body.setPosition(el.body, {
        x: midX,
        y: midY,
      });
      this.matter.body.setAngle(el.body, angle);
      this.updateBoardHandlePositions(el);
    } else {
      el.pos = this.dragOrigin.pos!.clone().add({
        x: deltaX,
        y: deltaY,
      });
      el.view.setPosition(el.pos.x, el.pos.y);
      this.matter.body.setPosition(el.body, {
        x: el.pos.x,
        y: el.pos.y,
      });
      const capPos = this.springCapPosition(el.pos, el.angle);
      this.matter.body.setPosition(el.capBody, {
        x: capPos.x,
        y: capPos.y,
      });
      this.updateSpringHandlePosition(el);
    }
  }

  private releaseBall() {
    if (this.state !== 'placing') {
      return;
    }
    this.state = 'rolling';
    this.cancelPendingBoard();
    this.clearSelection();
    this.clearToolHoverPreview();
    this.goButton.setVisible(false);
    this.instructionsText.setText('Rolling...');
    this.matter.body.setStatic(this.ball, false);
    setGravitySliderEnabled(false);
    setToolPaletteEnabled(false);
  }

  private onWin() {
    if (this.state !== 'rolling') {
      return;
    }
    this.state = 'won';
    this.messageText.setText('Solved!').setVisible(true);
    this.instructionsText.setText(
      this.nextLevelKey ? 'Solved! Press Next Level to continue.' : 'Solved! Press Reset to play again.'
    );
    this.matter.body.setStatic(this.ball, true);
    this.nextLevelButton?.setVisible(true);
  }

  private onMiss() {
    if (this.state !== 'rolling') {
      return;
    }
    this.state = 'placing';
    this.matter.body.setStatic(this.ball, true);
    this.matter.body.setPosition(this.ball, {
      x: this.start.x,
      y: this.start.y,
    });
    this.matter.body.setVelocity(this.ball, {
      x: 0,
      y: 0,
    });
    this.matter.body.setAngularVelocity(this.ball, 0);
    this.matter.body.setAngle(this.ball, 0);
    this.goButton.setVisible(true);
    this.messageText.setText('Missed! Adjust your pieces and try again, or press Reset to start over.').setVisible(true);
    this.instructionsText.setText(this.instructionsForTool());
    setGravitySliderEnabled(true);
    setToolPaletteEnabled(true);
  }

  private resetLevel() {
    this.cancelPendingBoard();
    this.clearSelection();
    this.clearToolHoverPreview();
    this.activeTool = null;
    setActiveToolButton(null);

    for (const el of this.placedElements) {
      this.removeElementBodies(el);
      el.view.destroy();
    }
    this.placedElements = [];

    this.matter.world.remove(this.ball);
    this.ballSprite.destroy();
    this.spawnBall();

    this.state = 'placing';
    this.goButton.setVisible(true);
    this.messageText.setVisible(false);
    this.nextLevelButton?.setVisible(false);
    this.instructionsText.setText(this.instructionsForTool());
    setGravitySliderEnabled(true);
    setToolPaletteEnabled(true);
  }
}
