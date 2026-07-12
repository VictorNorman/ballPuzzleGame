import { BaseLevelScene, WORLD_HEIGHT } from './BaseLevelScene';

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
}
