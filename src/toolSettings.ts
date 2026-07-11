export type ToolType = 'board' | 'spring'

export const toolSettings: { onSelect: ((tool: ToolType) => void) | null } = {
  onSelect: null,
}

export function setToolSelectHandler(handler: (tool: ToolType) => void) {
  toolSettings.onSelect = handler
}

export function setActiveToolButton(tool: ToolType | null) {
  const boardButton = document.querySelector<HTMLButtonElement>('#tool-board')
  const springButton = document.querySelector<HTMLButtonElement>('#tool-spring')
  boardButton?.classList.toggle('active', tool === 'board')
  boardButton?.setAttribute('aria-pressed', String(tool === 'board'))
  springButton?.classList.toggle('active', tool === 'spring')
  springButton?.setAttribute('aria-pressed', String(tool === 'spring'))
}

export function setToolPaletteEnabled(enabled: boolean) {
  const boardButton = document.querySelector<HTMLButtonElement>('#tool-board')
  const springButton = document.querySelector<HTMLButtonElement>('#tool-spring')
  if (boardButton) boardButton.disabled = !enabled
  if (springButton) springButton.disabled = !enabled
}
