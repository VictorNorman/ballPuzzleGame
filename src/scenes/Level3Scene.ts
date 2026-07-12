import { BaseLevelScene, WORLD_HEIGHT } from './BaseLevelScene';

const WALLS = [
  {
    x: 300,
    top: 380,
    width: 60,
  },
  {
    x: 560,
    top: 220,
    width: 60,
  },
];

export class Level3Scene extends BaseLevelScene {
  protected readonly levelLabel = 'Level 3';
  protected readonly nextLevelKey = 'Level4';

  constructor() {
    super('Level3');
  }

  protected buildObstacles() {
    for (const wall of WALLS) {
      const height = WORLD_HEIGHT - wall.top;
      const centerY = wall.top + height / 2;

      this.matter.add.rectangle(wall.x, centerY, wall.width, height, {
        isStatic: true,
        friction: 0.06,
        label: 'obstacle',
      });

      this.add
        .graphics()
        .setDepth(3)
        .fillStyle(0x455a64, 1)
        .fillRect(wall.x - wall.width / 2, wall.top, wall.width, height);
    }
  }
}
