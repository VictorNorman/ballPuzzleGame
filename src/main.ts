import './style.css'
import Phaser from 'phaser'
import { Level1Scene } from './scenes/Level1Scene'
import { Level2Scene } from './scenes/Level2Scene'
import { physicsSettings } from './physicsSettings'
import { toolSettings } from './toolSettings'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: 900,
  height: 600,
  backgroundColor: '#87ceeb',
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 1 },
      debug: false,
    },
  },
  scene: [Level1Scene, Level2Scene],
}

new Phaser.Game(config)

const gravitySlider = document.querySelector<HTMLInputElement>('#gravity-slider')!
const gravityValue = document.querySelector<HTMLOutputElement>('#gravity-value')!

gravitySlider.addEventListener('input', () => {
  const value = parseFloat(gravitySlider.value)
  physicsSettings.gravityY = value
  gravityValue.textContent = value.toFixed(2)
})

const boardButton = document.querySelector<HTMLButtonElement>('#tool-board')!
const springButton = document.querySelector<HTMLButtonElement>('#tool-spring')!

boardButton.addEventListener('click', () => toolSettings.onSelect?.('board'))
springButton.addEventListener('click', () => toolSettings.onSelect?.('spring'))
