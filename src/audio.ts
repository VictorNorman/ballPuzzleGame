import Phaser from 'phaser';

// shared across all level instances so switching/resetting levels doesn't
// leak a new AudioContext (browsers cap how many can be created)
let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContext();
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume();
  }
  return sharedAudioContext;
}

const ROLL_SOUND_MIN_SPEED = 0.3;
const ROLL_SOUND_MAX_SPEED = 15;
const ROLL_SOUND_MIN_FREQ = 70;
const ROLL_SOUND_MAX_FREQ = 260;
const ROLL_SOUND_MIN_GAIN = 0.02;
const ROLL_SOUND_MAX_GAIN = 0.18;

/** Synthesizes and plays the ball's sound effects: spring bounces and the rolling rumble. */
export class BallSoundPlayer {
  private rollOscillator?: OscillatorNode;
  private rollGain?: GainNode;

  /** Synthesizes a short "sproing" — a falling pitch with a decaying wobble on top. */
  playSpringSound() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const duration = 0.25;

    const sampleRate = 200;
    const sampleCount = Math.ceil(duration * sampleRate);
    const curve = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      const progress = i / (sampleCount - 1);
      const basePitch = 500 - progress * 250;
      const wobbleFreq = 18 - progress * 10;
      const wobbleDepth = 120 * (1 - progress);
      curve[i] = basePitch + Math.sin(progress * duration * wobbleFreq * Math.PI * 2) * wobbleDepth;
    }

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueCurveAtTime(curve, now, duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  /** Starts the sustained rumble played while the ball is rolling on a board. */
  startRollSound() {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = ROLL_SOUND_MIN_FREQ;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();

    this.rollOscillator = osc;
    this.rollGain = gain;
  }

  /** Re-pitches and re-levels the rolling rumble to track the ball's current speed. */
  updateRollSound(speed: number) {
    if (!this.rollOscillator || !this.rollGain) {
      return;
    }
    const t = Phaser.Math.Clamp(
      (speed - ROLL_SOUND_MIN_SPEED) / (ROLL_SOUND_MAX_SPEED - ROLL_SOUND_MIN_SPEED),
      0,
      1
    );
    const freq = Phaser.Math.Linear(ROLL_SOUND_MIN_FREQ, ROLL_SOUND_MAX_FREQ, t);
    const gainLevel = speed < ROLL_SOUND_MIN_SPEED ? 0 : Phaser.Math.Linear(ROLL_SOUND_MIN_GAIN, ROLL_SOUND_MAX_GAIN, t);

    const now = getAudioContext().currentTime;
    this.rollOscillator.frequency.setTargetAtTime(freq, now, 0.05);
    this.rollGain.gain.setTargetAtTime(gainLevel, now, 0.05);
  }

  stopRollSound() {
    if (!this.rollOscillator || !this.rollGain) {
      return;
    }
    const now = getAudioContext().currentTime;
    this.rollGain.gain.setTargetAtTime(0, now, 0.05);
    this.rollOscillator.stop(now + 0.2);
    this.rollOscillator = undefined;
    this.rollGain = undefined;
  }

  /** Plays a bright three-note "ding ding ding" chime when a level is solved. */
  playWinSound() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const notes = [784, 988, 1175]; // G5, B5, D6 - ascending major triad
    const gap = 0.16;
    notes.forEach((freq, i) => this.playDing(ctx, now + i * gap, freq));
  }

  /** A single bell-like chime: a sine fundamental plus a faint high overtone. */
  private playDing(ctx: AudioContext, startTime: number, freq: number) {
    const duration = 0.4;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);

    // a faint high partial is what reads as "bell" rather than a plain tone
    const overtone = ctx.createOscillator();
    overtone.type = 'sine';
    overtone.frequency.value = freq * 2.01;

    const overtoneGain = ctx.createGain();
    overtoneGain.gain.setValueAtTime(0, startTime);
    overtoneGain.gain.linearRampToValueAtTime(0.08, startTime + 0.01);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.75);

    overtone.connect(overtoneGain);
    overtoneGain.connect(ctx.destination);
    overtone.start(startTime);
    overtone.stop(startTime + duration * 0.75);
  }

  /** Plays a slow, descending "womp womp womp" for a missed attempt. */
  playMissSound() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const notes = [392, 330, 262]; // G4, E4, C4 - descending
    const gap = 0.22;
    notes.forEach((freq, i) => this.playWomp(ctx, now + i * gap, freq));
  }

  /** A single muted "womp": a triangle tone that sags slightly in pitch as it fades. */
  private playWomp(ctx: AudioContext, startTime: number, freq: number) {
    const duration = 0.3;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, startTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.85, startTime + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.22, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }
}
