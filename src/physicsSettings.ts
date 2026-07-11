export const physicsSettings = {
  gravityY: 1,
};

export function setGravitySliderEnabled(enabled: boolean) {
  const slider = document.querySelector<HTMLInputElement>('#gravity-slider');
  if (slider) {
    slider.disabled = !enabled;
  }
}
