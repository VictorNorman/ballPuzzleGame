import { BaseLevelScene, PORTAL_RADIUS, WORLD_HEIGHT } from './BaseLevelScene';

// half the cup's rim width (topWidth / 2 in buildCup), used to sit the
// portal just clear of the cup's rim rather than overlapping it
const CUP_RIM_HALF_WIDTH = 45;
const PORTAL_GAP = 8;

export class Level4Scene extends BaseLevelScene {
  protected readonly levelLabel = 'Level 4';
  protected readonly nextLevelKey = null;
  protected readonly start = {
    x: 90,
    y: WORLD_HEIGHT - WORLD_HEIGHT / 5,
  };
  protected readonly cup = {
    x: 780,
    y: WORLD_HEIGHT / 2,
  };

  constructor() {
    super('Level4');
  }

  protected buildObstacles() {
    this.buildPortal({
      x: this.cup.x + CUP_RIM_HALF_WIDTH + PORTAL_RADIUS + PORTAL_GAP,
      y: this.cup.y - 30,
    });
  }
}
