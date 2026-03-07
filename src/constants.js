export const CANVAS_SIZE = {
  width: 960,
  height: 540,
}

export const UI_PHASES = {
  READY: 'ready',
  RUNNING: 'running',
  RESULTS: 'results',
  COMPLETE: 'complete',
}

export const EVENT_TYPES = {
  DOWNHILL: 'downhill',
  BOUNCE: 'bounce',
  BALANCE: 'balance',
  ARENA: 'arena',
}

export const EVENT_ORDER = [
  EVENT_TYPES.DOWNHILL,
  EVENT_TYPES.BOUNCE,
  EVENT_TYPES.BALANCE,
  EVENT_TYPES.ARENA,
]

export const MAX_ROUNDS = 15

export const SPEED_OPTIONS = [1, 2, 4]

export const ATHLETE_PRESETS = [
  { name: 'Axiom', color: '#ff595e' },
  { name: 'Binary', color: '#ff924c' },
  { name: 'Cipher', color: '#ffca3a' },
  { name: 'Delta', color: '#8ac926' },
  { name: 'Echo', color: '#52b788' },
  { name: 'Flux', color: '#1982c4' },
  { name: 'Glint', color: '#4267ac' },
  { name: 'Helix', color: '#6a4c93' },
  { name: 'Ion', color: '#b5179e' },
  { name: 'Joule', color: '#f15bb5' },
  { name: 'Kappa', color: '#43aa8b' },
  { name: 'Lambda', color: '#4d908e' },
  { name: 'Matrix', color: '#277da1' },
  { name: 'Nova', color: '#577590' },
  { name: 'Orbit', color: '#f3722c' },
  { name: 'Pixel', color: '#f94144' },
]

export const EVENT_DETAILS = {
  [EVENT_TYPES.DOWNHILL]: {
    name: 'Downhill Race',
    description: 'Gravity drags the field down a jagged slope. First across the finish gate wins.',
    accent: '#f97316',
    background: '#1b1f3b',
  },
  [EVENT_TYPES.BOUNCE]: {
    name: 'Bouncing Obstacle Course',
    description: 'Peg fields, spring pads, and bumpers turn the run into a pinball sprint.',
    accent: '#06b6d4',
    background: '#112733',
  },
  [EVENT_TYPES.BALANCE]: {
    name: 'Balance Beam',
    description: 'Stay on the beam through lateral shove pulses. Longest survival takes the round.',
    accent: '#84cc16',
    background: '#1f2a1f',
  },
  [EVENT_TYPES.ARENA]: {
    name: 'Collision Arena',
    description: 'Chaos bursts and moving bumpers knock athletes out of the safe zone.',
    accent: '#ef4444',
    background: '#2b162c',
  },
}
