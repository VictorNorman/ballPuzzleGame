export interface GameControlHandlers {
  onGo: () => void;
  onStop: () => void;
  onReset: () => void;
}

export const gameControls: {
  onGo: (() => void) | null;
  onStop: (() => void) | null;
  onReset: (() => void) | null;
} = {
  onGo: null,
  onStop: null,
  onReset: null,
};

export function setGameControlHandlers(handlers: GameControlHandlers) {
  gameControls.onGo = handlers.onGo;
  gameControls.onStop = handlers.onStop;
  gameControls.onReset = handlers.onReset;
}

export function setGoButtonEnabled(enabled: boolean) {
  const button = document.querySelector<HTMLButtonElement>('#go-button');
  if (button) {
    button.disabled = !enabled;
  }
}

export function setStopButtonEnabled(enabled: boolean) {
  const button = document.querySelector<HTMLButtonElement>('#stop-button');
  if (button) {
    button.disabled = !enabled;
  }
}
