import { BaseLevelScene, WORLD_HEIGHT } from './BaseLevelScene';

const BLOCK = {
  x: 450,
  width: 70,
  top: 200,
};

export class Level2Scene extends BaseLevelScene {
  protected readonly levelLabel = 'Level 2';
  protected readonly nextLevelKey = null;

  constructor() {
    super('Level2');
  }

  protected buildObstacles() {
    const height = WORLD_HEIGHT - BLOCK.top;
    const centerY = BLOCK.top + height / 2;

    this.matter.add.rectangle(BLOCK.x, centerY, BLOCK.width, height, {
      isStatic: true,
      friction: 0.06,
      label: 'obstacle',
    });

    this.add
      .graphics()
      .setDepth(3)
      .fillStyle(0x455a64, 1)
      .fillRect(BLOCK.x - BLOCK.width / 2, BLOCK.top, BLOCK.width, height);
  }
}
