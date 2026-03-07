import Matter from 'matter-js'

import { CANVAS_SIZE, EVENT_DETAILS, EVENT_TYPES } from './constants.js'
import { createSeededRandom, randomBetween } from './random.js'

const { Bodies, Body, Composite, Engine, World } = Matter

const ATHLETE_RADIUS = 12
const FIXED_TIMESTEP = 1000 / 60
const MAX_SUBSTEPS = 6

function createStaticRectangle(x, y, width, height, angle = 0, fill = '#2b334f') {
  const body = Bodies.rectangle(x, y, width, height, {
    isStatic: true,
    angle,
    restitution: 0.4,
    friction: 0.8,
  })

  body.plugin.algico = {
    type: 'obstacle',
    fill,
    stroke: '#d9e2f2',
  }

  return body
}

function createStaticCircle(x, y, radius, fill = '#32476d') {
  const body = Bodies.circle(x, y, radius, {
    isStatic: true,
    restitution: 1.1,
    friction: 0.05,
  })

  body.plugin.algico = {
    type: 'obstacle',
    fill,
    stroke: '#e8f0ff',
  }

  return body
}

function createAthleteBody(entry, x, y, options = {}) {
  const body = Bodies.circle(x, y, ATHLETE_RADIUS, {
    restitution: options.restitution ?? 0.5,
    friction: options.friction ?? 0.02,
    frictionAir: options.frictionAir ?? 0.01,
    density: options.density ?? 0.002,
  })

  body.plugin.algico = {
    type: 'athlete',
    athleteId: entry.id,
    color: entry.color,
    label: entry.name.slice(0, 2).toUpperCase(),
  }

  return body
}

function drawBody(ctx, body) {
  const style = body.plugin.algico ?? { fill: '#666', stroke: '#fff' }
  ctx.fillStyle = style.fill ?? style.color ?? '#666'
  ctx.strokeStyle = style.stroke ?? '#fff'
  ctx.lineWidth = style.type === 'athlete' ? 2.5 : 1.5

  if (body.circleRadius) {
    ctx.beginPath()
    ctx.arc(body.position.x, body.position.y, body.circleRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    return
  }

  ctx.beginPath()
  ctx.moveTo(body.vertices[0].x, body.vertices[0].y)
  body.vertices.slice(1).forEach((vertex) => {
    ctx.lineTo(vertex.x, vertex.y)
  })
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}

function drawAthleteLabels(ctx, entries) {
  ctx.font = "700 10px 'Trebuchet MS', sans-serif"
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  entries.forEach((entry) => {
    ctx.fillStyle = '#f8fafc'
    ctx.fillText(entry.name.slice(0, 2).toUpperCase(), entry.body.position.x, entry.body.position.y + 0.5)
  })
}

function drawOverlay(ctx, state) {
  ctx.fillStyle = 'rgba(9, 11, 18, 0.7)'
  ctx.fillRect(16, 16, 270, 72)
  ctx.fillStyle = '#f8fafc'
  ctx.font = "700 22px 'Trebuchet MS', sans-serif"
  ctx.fillText(state.meta.name, 28, 44)
  ctx.font = "500 12px 'Trebuchet MS', sans-serif"
  ctx.fillStyle = '#cbd5e1'
  const seconds = (state.elapsedMs / 1000).toFixed(1)
  const status = state.complete ? 'Complete' : state.started ? 'Running' : 'Preview'
  ctx.fillText(`${status}  •  ${seconds}s`, 28, 66)
}

function completeRaceEvent(state, progressGetter) {
  if (state.complete) {
    return
  }

  const remaining = state.entries
    .filter((entry) => !entry.finishedAt)
    .sort((left, right) => progressGetter(right) - progressGetter(left))

  const placements = [
    ...state.finishOrder,
    ...remaining.map((entry) => entry.id),
  ]

  state.complete = true
  state.result = {
    eventType: state.eventType,
    placements,
  }
}

function completeSurvivalEvent(state, survivorSorter) {
  if (state.complete) {
    return
  }

  const survivors = state.entries
    .filter((entry) => !entry.outAt)
    .sort((left, right) => survivorSorter(left, right))
    .map((entry) => entry.id)

  const placements = [...survivors, ...state.knockoutOrder.slice().reverse()]
  state.complete = true
  state.result = {
    eventType: state.eventType,
    placements,
  }
}

function markFinished(state, entry) {
  if (entry.finishedAt) {
    return
  }

  entry.finishedAt = state.elapsedMs
  state.finishOrder.push(entry.id)
}

function markKnockedOut(state, entry) {
  if (entry.outAt) {
    return
  }

  entry.outAt = state.elapsedMs
  state.knockoutOrder.push(entry.id)
}

function createWorldBounds(state, wallFill = '#384660') {
  const { width, height } = state
  const walls = [
    createStaticRectangle(width / 2, height + 24, width + 120, 60, 0, wallFill),
    createStaticRectangle(-24, height / 2, 60, height + 120, 0, wallFill),
    createStaticRectangle(width + 24, height / 2, 60, height + 120, 0, wallFill),
    createStaticRectangle(width / 2, -24, width + 120, 60, 0, wallFill),
  ]
  World.add(state.world, walls)
}

function buildDownhill(state) {
  state.engine.gravity.y = 1.05
  state.finishX = 874
  state.finishOrder = []
  createWorldBounds(state, '#253047')

  const terrain = [
    createStaticRectangle(208, 148, 280, 18, -0.32, '#29415c'),
    createStaticRectangle(468, 280, 290, 18, -0.19, '#35506e'),
    createStaticRectangle(746, 412, 280, 18, -0.28, '#405f80'),
    createStaticRectangle(860, 492, 220, 18, 0, '#334155'),
  ]
  const bumpers = [
    createStaticCircle(318, 212, 16, '#6989a6'),
    createStaticCircle(594, 344, 18, '#7ba3c2'),
  ]
  World.add(state.world, [...terrain, ...bumpers])

  state.entries.forEach((entry, index) => {
    const row = Math.floor(index / 4)
    const col = index % 4
    entry.body = createAthleteBody(entry, 80 + col * 22, 64 + row * 22, {
      restitution: 0.32,
      frictionAir: 0.012,
    })
    World.add(state.world, entry.body)
  })

  state.step = () => {
    state.entries.forEach((entry) => {
      if (entry.finishedAt) {
        return
      }

      Body.applyForce(entry.body, entry.body.position, {
        x: 0.00018 + state.random() * 0.00007,
        y: 0.00002,
      })

      if (entry.body.position.x >= state.finishX) {
        markFinished(state, entry)
      }
    })

    if (state.finishOrder.length === state.entries.length || state.elapsedMs >= 16000) {
      completeRaceEvent(
        state,
        (entry) => entry.body.position.x + entry.body.position.y * 0.35,
      )
    }
  }

  state.drawBackdrop = (ctx) => {
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, state.width, state.height)
    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 4
    ctx.setLineDash([10, 6])
    ctx.beginPath()
    ctx.moveTo(state.finishX, 0)
    ctx.lineTo(state.finishX, state.height)
    ctx.stroke()
    ctx.setLineDash([])
  }
}

function buildBounce(state) {
  state.engine.gravity.y = 1.1
  state.finishX = 880
  state.finishOrder = []
  createWorldBounds(state, '#214357')

  const track = [
    createStaticRectangle(190, 492, 390, 20, 0, '#28546d'),
    createStaticRectangle(528, 500, 280, 20, -0.04, '#2c6484'),
    createStaticRectangle(818, 494, 250, 20, 0, '#256b77'),
  ]
  const pegs = [
    [250, 400],
    [320, 332],
    [390, 410],
    [480, 350],
    [560, 420],
    [646, 334],
    [728, 402],
  ].map(([x, y]) => createStaticCircle(x, y, 20, '#67c3d6'))
  const pads = [
    createStaticRectangle(238, 466, 90, 12, 0, '#f59e0b'),
    createStaticRectangle(612, 466, 96, 12, 0, '#f59e0b'),
  ]
  World.add(state.world, [...track, ...pegs, ...pads])

  state.boostPads = [
    { x1: 194, x2: 282, impulseY: -0.009, impulseX: 0.0022 },
    { x1: 564, x2: 660, impulseY: -0.0105, impulseX: 0.0025 },
  ]

  state.entries.forEach((entry, index) => {
    const row = Math.floor(index / 4)
    const col = index % 4
    entry.body = createAthleteBody(entry, 86 + col * 22, 140 + row * 28, {
      restitution: 0.9,
      frictionAir: 0.009,
    })
    entry.nextBoostAt = 0
    World.add(state.world, entry.body)
  })

  state.step = () => {
    state.entries.forEach((entry) => {
      if (entry.finishedAt) {
        return
      }

      Body.applyForce(entry.body, entry.body.position, {
        x: 0.00032 + state.random() * 0.0001,
        y: 0,
      })

      if (state.elapsedMs >= entry.nextBoostAt) {
        const pad = state.boostPads.find(
          ({ x1, x2 }) =>
            entry.body.position.x >= x1 &&
            entry.body.position.x <= x2 &&
            entry.body.position.y >= 430,
        )

        if (pad) {
          Body.setVelocity(entry.body, {
            x: entry.body.velocity.x + pad.impulseX * 2400,
            y: -11 + state.random() * -2,
          })
          entry.nextBoostAt = state.elapsedMs + 850
        }
      }

      if (entry.body.position.x >= state.finishX) {
        markFinished(state, entry)
      }
    })

    if (state.finishOrder.length === state.entries.length || state.elapsedMs >= 18000) {
      completeRaceEvent(
        state,
        (entry) => entry.body.position.x + (state.height - entry.body.position.y) * 0.15,
      )
    }
  }

  state.drawBackdrop = (ctx) => {
    ctx.fillStyle = '#091b24'
    ctx.fillRect(0, 0, state.width, state.height)
    ctx.fillStyle = 'rgba(245, 158, 11, 0.24)'
    state.boostPads.forEach((pad) => {
      ctx.fillRect(pad.x1, 454, pad.x2 - pad.x1, 20)
    })
    ctx.strokeStyle = '#22d3ee'
    ctx.lineWidth = 4
    ctx.setLineDash([10, 6])
    ctx.beginPath()
    ctx.moveTo(state.finishX, 0)
    ctx.lineTo(state.finishX, state.height)
    ctx.stroke()
    ctx.setLineDash([])
  }
}

function buildBalance(state) {
  state.engine.gravity.y = 1
  state.knockoutOrder = []
  createWorldBounds(state, '#243825')

  const beam = createStaticRectangle(510, 324, 690, 14, 0, '#cbd5e1')
  const floor = createStaticRectangle(state.width / 2, 584, state.width + 120, 48, 0, '#1f2937')
  World.add(state.world, [beam, floor])

  state.entries.forEach((entry, index) => {
    entry.body = createAthleteBody(entry, 176 + index * 40, 292, {
      restitution: 0.12,
      frictionAir: 0.03,
      friction: 0.08,
    })
    World.add(state.world, entry.body)
  })

  state.nextPulseAt = 1350
  state.step = () => {
    state.entries.forEach((entry) => {
      if (entry.outAt) {
        return
      }

      Body.applyForce(entry.body, entry.body.position, {
        x: 0.00011 + state.random() * 0.00005,
        y: 0,
      })

      if (state.elapsedMs >= state.nextPulseAt) {
        const direction = Math.floor(state.elapsedMs / 1350) % 2 === 0 ? 1 : -1
        Body.applyForce(entry.body, entry.body.position, {
          x: direction * (0.0011 + state.random() * 0.00055),
          y: -0.00012,
        })
      }

      if (
        entry.body.position.y >= 386 ||
        entry.body.position.x <= 128 ||
        entry.body.position.x >= 888
      ) {
        markKnockedOut(state, entry)
      }
    })

    if (state.elapsedMs >= state.nextPulseAt) {
      state.nextPulseAt += 1350
    }

    const survivors = state.entries.filter((entry) => !entry.outAt)
    if (survivors.length <= 1 || state.elapsedMs >= 15000) {
      completeSurvivalEvent(
        state,
        (left, right) => right.body.position.x - left.body.position.x,
      )
    }
  }

  state.drawBackdrop = (ctx) => {
    ctx.fillStyle = '#09120c'
    ctx.fillRect(0, 0, state.width, state.height)
    ctx.strokeStyle = '#84cc16'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 8])
    ctx.beginPath()
    ctx.moveTo(166, 324)
    ctx.lineTo(854, 324)
    ctx.stroke()
    ctx.setLineDash([])
  }
}

function buildArena(state) {
  state.engine.gravity.y = 0
  state.knockoutOrder = []
  createWorldBounds(state, '#4a2335')

  const arenaWalls = [
    createStaticRectangle(480, 72, 720, 16, 0, '#75304b'),
    createStaticRectangle(480, 468, 720, 16, 0, '#75304b'),
    createStaticRectangle(120, 270, 16, 412, 0, '#75304b'),
    createStaticRectangle(840, 270, 16, 412, 0, '#75304b'),
  ]
  World.add(state.world, arenaWalls)

  state.safeBounds = {
    left: 132,
    right: 828,
    top: 84,
    bottom: 456,
    centerX: 480,
    centerY: 270,
  }

  const bumperSpecs = [
    { x: 480, y: 148, amplitude: 210, axis: 'x', phase: 0, radius: 18 },
    { x: 660, y: 270, amplitude: 120, axis: 'y', phase: 0.8, radius: 18 },
    { x: 300, y: 350, amplitude: 170, axis: 'x', phase: 1.5, radius: 16 },
  ]

  state.bumpers = bumperSpecs.map((spec) => {
    const body = createStaticCircle(spec.x, spec.y, spec.radius, '#fb7185')
    body.plugin.algico.bumpSpec = spec
    return body
  })
  World.add(state.world, state.bumpers)

  state.entries.forEach((entry, index) => {
    const row = Math.floor(index / 4)
    const col = index % 4
    entry.body = createAthleteBody(entry, 410 + col * 42, 205 + row * 42, {
      restitution: 0.92,
      frictionAir: 0.015,
      friction: 0.01,
    })
    World.add(state.world, entry.body)
  })

  state.nextBurstAt = 900
  state.step = () => {
    const time = state.elapsedMs / 1000
    state.bumpers.forEach((bumper) => {
      const { bumpSpec } = bumper.plugin.algico
      const position =
        bumpSpec.axis === 'x'
          ? {
              x: bumpSpec.x + Math.sin(time * 1.8 + bumpSpec.phase) * bumpSpec.amplitude,
              y: bumpSpec.y,
            }
          : {
              x: bumpSpec.x,
              y: bumpSpec.y + Math.sin(time * 1.7 + bumpSpec.phase) * bumpSpec.amplitude,
            }
      Body.setPosition(bumper, position)
    })

    state.entries.forEach((entry) => {
      if (entry.outAt) {
        return
      }

      if (state.elapsedMs >= state.nextBurstAt) {
        const angle = state.random() * Math.PI * 2
        const force = 0.0018 + state.random() * 0.0007
        Body.applyForce(entry.body, entry.body.position, {
          x: Math.cos(angle) * force,
          y: Math.sin(angle) * force,
        })
      }

      if (entry.body.position.x < state.safeBounds.left) {
        Body.applyForce(entry.body, entry.body.position, { x: -0.0006, y: 0 })
      } else if (entry.body.position.x > state.safeBounds.right) {
        Body.applyForce(entry.body, entry.body.position, { x: 0.0006, y: 0 })
      }

      const { x, y } = entry.body.position
      if (
        x < state.safeBounds.left ||
        x > state.safeBounds.right ||
        y < state.safeBounds.top ||
        y > state.safeBounds.bottom
      ) {
        markKnockedOut(state, entry)
      }
    })

    if (state.elapsedMs >= state.nextBurstAt) {
      state.nextBurstAt += 900
    }

    const survivors = state.entries.filter((entry) => !entry.outAt)
    if (survivors.length <= 1 || state.elapsedMs >= 15000) {
      completeSurvivalEvent(state, (left, right) => {
        const leftDistance = Math.hypot(
          left.body.position.x - state.safeBounds.centerX,
          left.body.position.y - state.safeBounds.centerY,
        )
        const rightDistance = Math.hypot(
          right.body.position.x - state.safeBounds.centerX,
          right.body.position.y - state.safeBounds.centerY,
        )
        return leftDistance - rightDistance
      })
    }
  }

  state.drawBackdrop = (ctx) => {
    ctx.fillStyle = '#1a0917'
    ctx.fillRect(0, 0, state.width, state.height)
    ctx.strokeStyle = 'rgba(251, 113, 133, 0.7)'
    ctx.lineWidth = 3
    ctx.strokeRect(
      state.safeBounds.left,
      state.safeBounds.top,
      state.safeBounds.right - state.safeBounds.left,
      state.safeBounds.bottom - state.safeBounds.top,
    )
  }
}

const EVENT_BUILDERS = {
  [EVENT_TYPES.DOWNHILL]: buildDownhill,
  [EVENT_TYPES.BOUNCE]: buildBounce,
  [EVENT_TYPES.BALANCE]: buildBalance,
  [EVENT_TYPES.ARENA]: buildArena,
}

export function createEventSimulation(eventType, activeAthletes, seed) {
  const eventBuilder = EVENT_BUILDERS[eventType]
  if (!eventBuilder) {
    throw new Error(`Unknown event type: ${eventType}`)
  }

  const engine = Engine.create()
  const state = {
    eventType,
    meta: EVENT_DETAILS[eventType],
    width: CANVAS_SIZE.width,
    height: CANVAS_SIZE.height,
    engine,
    world: engine.world,
    entries: activeAthletes.map((athlete) => ({
      ...athlete,
      body: null,
      finishedAt: null,
      outAt: null,
    })),
    finishOrder: [],
    knockoutOrder: [],
    elapsedMs: 0,
    started: false,
    complete: false,
    result: null,
    accumulator: 0,
    random: createSeededRandom(seed),
  }

  eventBuilder(state)

  return {
    eventType,
    start() {
      state.started = true
    },
    update(deltaMs, speed = 1) {
      if (!state.started || state.complete) {
        return
      }

      state.accumulator += deltaMs * speed
      let steps = 0

      while (state.accumulator >= FIXED_TIMESTEP && steps < MAX_SUBSTEPS && !state.complete) {
        Engine.update(state.engine, FIXED_TIMESTEP)
        state.elapsedMs += FIXED_TIMESTEP
        state.step()
        state.accumulator -= FIXED_TIMESTEP
        steps += 1
      }
    },
    draw(ctx) {
      state.drawBackdrop(ctx)

      const bodies = Composite.allBodies(state.world)
      bodies
        .filter((body) => body.plugin.algico?.type !== 'athlete')
        .forEach((body) => drawBody(ctx, body))
      bodies
        .filter((body) => body.plugin.algico?.type === 'athlete')
        .forEach((body) => drawBody(ctx, body))
      drawAthleteLabels(ctx, state.entries)
      drawOverlay(ctx, state)
    },
    isComplete() {
      return state.complete
    },
    getResults() {
      return state.result
    },
    destroy() {
      Composite.clear(state.world, false)
      Engine.clear(state.engine)
    },
  }
}
