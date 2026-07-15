import Phaser from 'phaser';
import { BallSoundPlayer } from '../audio';
import { setGameControlHandlers, setGoButtonEnabled, setStopButtonEnabled } from '../gameControls';
import { physicsSettings, setGravitySliderEnabled } from '../physicsSettings';
import type { ToolType } from '../toolSettings';
import { setActiveToolButton, setToolPaletteEnabled, setToolSelectHandler } from '../toolSettings';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../worldConstants';
import { buildCup, buildKillzone, buildPortal, cupRestPosition } from '../levelGeometry';
import type { PlacedSpring } from '../pieceEditor';
import { PieceEditor, springDirection, springTangent } from '../pieceEditor';

export { PORTAL_RADIUS } from '../levelGeometry';
export { WORLD_HEIGHT, WORLD_WIDTH };

type GameState = 'placing' | 'rolling' | 'won';

const BALL_RADIUS = 12;
const PLACEMENT_AREA_TOP = 60;
const SPRING_LAUNCH_SPEED = 13;
const CUP_WALL_IMPACT_DAMPING = 0.2;

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
  private editor = new PieceEditor(this);

  private ball!: MatterJS.BodyType;
  private ballSprite!: Phaser.GameObjects.Graphics;
  private nextLevelButton?: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private instructionsText!: Phaser.GameObjects.Text;

  private ballOnBoardThisStep = false;
  private isRollSoundActive = false;
  private soundPlayer = new BallSoundPlayer();

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

    buildCup(this, this.cup);
    buildKillzone(this);
    this.editor.buildTrashCan();
    this.buildObstacles();

    setToolSelectHandler((tool) => this.selectTool(tool));
    setActiveToolButton(null);
    setToolPaletteEnabled(true);

    setGameControlHandlers({
      onGo: () => this.releaseBall(),
      onStop: () => this.stopRoll(),
      onReset: () => this.resetLevel(),
    });
    setGoButtonEnabled(true);
    setStopButtonEnabled(false);

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
    this.instructionsText.setText(this.editor.instructions());

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
        if (labels.includes('ball') && labels.includes('cupWall') && this.state === 'rolling') {
          // kills most of the impact bounce so a fast ball can't ricochet
          // back out over the cup's flared rim; sliding contact (handled by
          // collisionactive, not this event) is left untouched
          const v = this.ball.velocity;
          this.matter.body.setVelocity(this.ball, {
            x: v.x * CUP_WALL_IMPACT_DAMPING,
            y: v.y * CUP_WALL_IMPACT_DAMPING,
          });
        }
        if (labels.includes('ball') && labels.includes('portal') && this.state === 'rolling') {
          this.onPortal();
        }
        if (labels.includes('ball') && labels.includes('spring') && this.state === 'rolling') {
          const capBody = bodyA.label === 'spring' ? bodyA : bodyB;
          const spring = this.editor.findSpringByCapBody(capBody);
          if (spring) {
            this.launchBallFromSpring(spring);
            this.editor.playSpringBounce(spring);
            this.soundPlayer.playSpringSound();
          }
        }
      }
    });

    this.matter.world.on('collisionactive', (event: MatterJS.IEventCollision<MatterJS.Engine>) => {
      if (this.state !== 'rolling') {
        return;
      }
      for (const pair of event.pairs) {
        const bodyA = pair.bodyA as unknown as MatterJS.BodyType;
        const bodyB = pair.bodyB as unknown as MatterJS.BodyType;
        const labels = [bodyA.label, bodyB.label];
        if (labels.includes('ball') && labels.includes('board')) {
          this.ballOnBoardThisStep = true;
        }
      }
    });
  }

  private selectTool(tool: ToolType) {
    if (this.state !== 'placing') {
      return;
    }
    this.messageText.setVisible(false);
    this.editor.selectTool(tool);
    this.instructionsText.setText(this.editor.instructions());
  }

  /** A static warp point: touching it instantly sends the ball back to the start, mid-roll. */
  protected buildPortal(pos: { x: number; y: number }) {
    buildPortal(this, pos);
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

      if (this.ballOnBoardThisStep) {
        const speed = Math.hypot(this.ball.velocity.x, this.ball.velocity.y);
        if (!this.isRollSoundActive) {
          this.soundPlayer.startRollSound();
          this.isRollSoundActive = true;
        }
        this.soundPlayer.updateRollSound(speed);
      } else if (this.isRollSoundActive) {
        this.stopRollSound();
      }
    }
    this.ballOnBoardThisStep = false;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    if (this.state !== 'placing') {
      return;
    }
    if (pointer.y < PLACEMENT_AREA_TOP) {
      return;
    }
    this.messageText.setVisible(false);
    this.editor.onPointerDown(new Phaser.Math.Vector2(pointer.x, pointer.y));
    this.instructionsText.setText(this.editor.instructions());
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    if (this.state !== 'placing') {
      return;
    }
    const pos = new Phaser.Math.Vector2(pointer.x, pointer.y);
    this.editor.onPointerMove(pos, pointer.y >= PLACEMENT_AREA_TOP);
  }

  private onPointerUp() {
    this.editor.onPointerUp();
  }

  private launchBallFromSpring(spring: PlacedSpring) {
    const dir = springDirection(spring.angle);
    const tangent = springTangent(spring.angle);
    const v = this.ball.velocity;
    const tangentialSpeed = v.x * tangent.x + v.y * tangent.y;
    this.matter.body.setVelocity(this.ball, {
      x: tangent.x * tangentialSpeed + dir.x * SPRING_LAUNCH_SPEED,
      y: tangent.y * tangentialSpeed + dir.y * SPRING_LAUNCH_SPEED,
    });
  }

  private stopRollSound() {
    this.isRollSoundActive = false;
    this.soundPlayer.stopRollSound();
  }

  private releaseBall() {
    if (this.state !== 'placing') {
      return;
    }
    this.state = 'rolling';
    this.editor.cancelPendingBoard();
    this.editor.clearSelection();
    this.editor.clearToolHoverPreview();
    this.messageText.setVisible(false);
    this.instructionsText.setText('Rolling...');
    this.matter.body.setStatic(this.ball, false);
    setGravitySliderEnabled(false);
    setToolPaletteEnabled(false);
    setGoButtonEnabled(false);
    setStopButtonEnabled(true);
  }

  /** Interrupts a roll in progress and returns to placing mode, keeping placed pieces. */
  private stopRoll() {
    if (this.state !== 'rolling') {
      return;
    }
    this.state = 'placing';
    this.stopRollSound();
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
    this.messageText.setVisible(false);
    this.instructionsText.setText(this.editor.instructions());
    setGravitySliderEnabled(true);
    setToolPaletteEnabled(true);
    setGoButtonEnabled(true);
    setStopButtonEnabled(false);
  }

  private onWin() {
    if (this.state !== 'rolling') {
      return;
    }
    this.state = 'won';
    this.stopRollSound();
    this.soundPlayer.playWinSound();
    this.messageText.setText('Solved!').setVisible(true);
    this.instructionsText.setText(
      this.nextLevelKey ? 'Solved! Press Next Level to continue.' : 'Solved! Press Reset to play again.'
    );
    this.matter.body.setStatic(this.ball, true);
    this.matter.body.setPosition(this.ball, cupRestPosition(this.cup, BALL_RADIUS));
    this.matter.body.setVelocity(this.ball, {
      x: 0,
      y: 0,
    });
    this.matter.body.setAngularVelocity(this.ball, 0);
    this.nextLevelButton?.setVisible(true);
    setStopButtonEnabled(false);
  }

  private onMiss() {
    if (this.state !== 'rolling') {
      return;
    }
    this.state = 'placing';
    this.stopRollSound();
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
    this.soundPlayer.playMissSound();
    this.messageText.setText('Missed! Adjust your pieces and try again, or press Reset to start over.').setVisible(true);
    this.instructionsText.setText(this.editor.instructions());
    setGravitySliderEnabled(true);
    setToolPaletteEnabled(true);
    setGoButtonEnabled(true);
    setStopButtonEnabled(false);
  }

  /** Instantly warps the ball back to the start without interrupting the roll. */
  private onPortal() {
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
    this.stopRollSound();
  }

  private resetLevel() {
    this.stopRollSound();
    this.editor.reset();

    this.matter.world.remove(this.ball);
    this.ballSprite.destroy();
    this.spawnBall();

    this.state = 'placing';
    setGoButtonEnabled(true);
    setStopButtonEnabled(false);
    this.messageText.setVisible(false);
    this.nextLevelButton?.setVisible(false);
    this.instructionsText.setText(this.editor.instructions());
    setGravitySliderEnabled(true);
    setToolPaletteEnabled(true);
  }
}
