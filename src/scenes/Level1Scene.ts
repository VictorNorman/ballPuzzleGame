import { BaseLevelScene } from './BaseLevelScene';

export class Level1Scene extends BaseLevelScene {
  protected readonly levelLabel = 'Level 1';
  protected readonly nextLevelKey = 'Level2';

  constructor() {
    super('Level1');
  }
}
