import './style.css'

import {
  CANVAS_SIZE,
  EVENT_DETAILS,
  MAX_ROUNDS,
  SPEED_OPTIONS,
  UI_PHASES,
} from './constants.js'
import { createSeason, applyEventResults, getLeaderboard, getNextEventType } from './season.js'
import { createEventSimulation } from './simulation.js'

const DEBUG_ENABLED = import.meta.env.MODE === 'e2e'
const app = document.querySelector('#app')

app.innerHTML = `
  <div class="shell">
    <header class="hero">
      <div>
        <p class="eyebrow">Algicosathlon</p>
        <h1>Season Simulator</h1>
        <p class="hero-copy">
          Sixteen colored athletes enter. After every physics event, the lowest scorer goes home.
        </p>
      </div>
      <div class="hero-stats">
        <div class="stat-card">
          <span>Format</span>
          <strong>15 rounds</strong>
        </div>
        <div class="stat-card">
          <span>Events</span>
          <strong>4 rotating</strong>
        </div>
      </div>
    </header>
    <main class="layout">
      <section class="stage-panel" data-testid="stage-panel">
        <div class="stage-header">
          <div>
            <p id="round-label" class="panel-kicker" data-testid="round-label"></p>
            <h2 id="event-name" data-testid="event-name"></h2>
          </div>
          <p id="event-description" class="event-copy" data-testid="event-description"></p>
        </div>
        <canvas
          id="sim-canvas"
          data-testid="sim-canvas"
          width="${CANVAS_SIZE.width}"
          height="${CANVAS_SIZE.height}"
        ></canvas>
        <div class="controls">
          <button id="new-season-btn" class="primary" data-testid="new-season-button">Start New Season</button>
          <button id="run-event-btn" data-testid="run-event-button">Run Event</button>
          <button id="next-event-btn" data-testid="next-event-button">Next Event</button>
          <button id="reset-btn" data-testid="reset-button">Reset</button>
          <label class="speed-control">
            Speed
            <select id="speed-select" data-testid="speed-select">
              ${SPEED_OPTIONS.map((value) => `<option value="${value}">${value}x</option>`).join('')}
            </select>
          </label>
        </div>
      </section>
      <aside class="sidebar">
        <section class="panel banner-panel" data-testid="status-panel">
          <p class="panel-kicker">Status</p>
          <h3 id="status-line" data-testid="status-line"></h3>
          <p id="notice-line" class="notice-line" data-testid="notice-line"></p>
        </section>
        <section class="panel" data-testid="summary-panel">
          <p class="panel-kicker">Round Summary</p>
          <div id="summary-card" class="summary-card" data-testid="summary-card"></div>
        </section>
        <section class="panel" data-testid="leaderboard-panel">
          <div class="leaderboard-head">
            <p class="panel-kicker">Leaderboard</p>
            <span id="active-count" class="tag" data-testid="active-count"></span>
          </div>
          <div id="leaderboard" class="leaderboard" data-testid="leaderboard"></div>
        </section>
      </aside>
    </main>
  </div>
`

const canvas = document.querySelector('#sim-canvas')
const context = canvas.getContext('2d')
const roundLabel = document.querySelector('#round-label')
const eventName = document.querySelector('#event-name')
const eventDescription = document.querySelector('#event-description')
const statusLine = document.querySelector('#status-line')
const noticeLine = document.querySelector('#notice-line')
const summaryCard = document.querySelector('#summary-card')
const leaderboard = document.querySelector('#leaderboard')
const activeCount = document.querySelector('#active-count')
const runEventButton = document.querySelector('#run-event-btn')
const nextEventButton = document.querySelector('#next-event-btn')
const newSeasonButton = document.querySelector('#new-season-btn')
const resetButton = document.querySelector('#reset-btn')
const speedSelect = document.querySelector('#speed-select')

const runtime = {
  state: null,
  simulation: null,
  frameId: null,
  lastFrameTime: 0,
}

function getSeasonSeed(state) {
  return state?.season.seed ?? null
}

function getEventSeed(state, eventType = getNextEventType(state)) {
  return `${getSeasonSeed(state)}:${state.season.round}:${eventType}`
}

function createSeed() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

function destroySimulation() {
  if (runtime.simulation) {
    runtime.simulation.destroy()
    runtime.simulation = null
  }
}

function getActiveAthletes(state) {
  return state.season.activeAthleteIds.map((athleteId) => state.athletes[athleteId])
}

function createSimulationForState(state) {
  const eventType = getNextEventType(state)
  if (!eventType) {
    return null
  }

  return createEventSimulation(
    eventType,
    getActiveAthletes(state),
    getEventSeed(state, eventType),
  )
}

function mountSimulation() {
  destroySimulation()
  runtime.simulation = createSimulationForState(runtime.state)
}

function setSelectedSpeed(speed) {
  const normalizedSpeed = Number(speed)
  if (!Number.isFinite(normalizedSpeed) || normalizedSpeed <= 0) {
    return
  }

  runtime.state.ui.selectedSpeed = normalizedSpeed
  speedSelect.value = SPEED_OPTIONS.includes(normalizedSpeed) ? String(normalizedSpeed) : ''
}

function startSeason(seed) {
  const preservedSpeed = runtime.state?.ui.selectedSpeed ?? 1
  runtime.state = createSeason(seed)
  setSelectedSpeed(preservedSpeed)
  mountSimulation()
  render()
}

function advanceStateThroughCurrentRound(state, speed = 30) {
  const simulation = createSimulationForState(state)
  if (!simulation) {
    return state
  }

  simulation.start()
  let guard = 0
  while (!simulation.isComplete() && guard < 4000) {
    simulation.update(1000 / 60, speed)
    guard += 1
  }

  if (!simulation.isComplete()) {
    simulation.destroy()
    throw new Error('Simulation did not complete during debug advance.')
  }

  const { updatedSeason } = applyEventResults(state, simulation.getResults())
  simulation.destroy()
  return updatedSeason
}

function formatStatus() {
  const { phase } = runtime.state.ui

  if (phase === UI_PHASES.RUNNING) {
    return 'Event running'
  }
  if (phase === UI_PHASES.RESULTS) {
    return 'Event finished'
  }
  if (phase === UI_PHASES.COMPLETE) {
    return `${runtime.state.season.winner.name} is champion`
  }
  return 'Ready for next event'
}

function renderSummary() {
  const { lastResults } = runtime.state.ui
  if (!lastResults) {
    summaryCard.innerHTML = `
      <p class="summary-empty">
        Start the event to generate placements, points, and the next elimination.
      </p>
    `
    return
  }

  summaryCard.innerHTML = `
    <ol class="summary-list">
      ${lastResults.placements
        .map(
          (entry) => `
            <li>
              <span class="summary-athlete">
                <span class="swatch" style="background:${entry.color}"></span>
                ${entry.place}. ${entry.name}
              </span>
              <span class="summary-points">+${entry.points} · ${entry.totalScore} total</span>
            </li>
          `,
        )
        .join('')}
    </ol>
  `
}

function renderLeaderboard() {
  const standings = getLeaderboard(runtime.state)
  activeCount.textContent = `${runtime.state.season.activeAthleteIds.length} active`
  leaderboard.innerHTML = standings
    .map(
      (athlete, index) => `
        <article class="leaderboard-row ${athlete.eliminated ? 'is-eliminated' : ''}">
          <div class="leaderboard-main">
            <span class="rank">${index + 1}</span>
            <span class="swatch" style="background:${athlete.color}"></span>
            <div>
              <strong>${athlete.name}</strong>
              <p>${athlete.eliminated ? 'Eliminated' : 'Still alive'} · ${athlete.topThreeCount} top-3s</p>
            </div>
          </div>
          <span class="score">${athlete.score}</span>
        </article>
      `,
    )
    .join('')
}

function renderMeta() {
  const eventType = runtime.simulation?.eventType ?? getNextEventType(runtime.state)
  const eventDetail = eventType ? EVENT_DETAILS[eventType] : null
  const nextRoundNumber = Math.min(runtime.state.season.round + 1, MAX_ROUNDS)
  roundLabel.textContent = runtime.state.season.winner
    ? `Season complete · seed ${runtime.state.season.seed}`
    : `Round ${nextRoundNumber} of ${MAX_ROUNDS} · seed ${runtime.state.season.seed}`
  eventName.textContent = eventDetail?.name ?? 'Champion crowned'
  eventDescription.textContent =
    eventDetail?.description ?? 'The season is over. Reset to run the bracket again.'
  statusLine.textContent = formatStatus()
  noticeLine.textContent = runtime.state.ui.eliminationNotice ?? 'No eliminations yet.'
}

function renderControls() {
  const phase = runtime.state.ui.phase
  const hasWinner = Boolean(runtime.state.season.winner)
  runEventButton.disabled = phase !== UI_PHASES.READY || !runtime.simulation
  nextEventButton.disabled = phase !== UI_PHASES.RESULTS || hasWinner
  resetButton.disabled = phase === UI_PHASES.RUNNING
  newSeasonButton.disabled = phase === UI_PHASES.RUNNING
}

function renderCanvasFallback() {
  context.fillStyle = '#0f172a'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#e2e8f0'
  context.font = "700 28px 'Trebuchet MS', sans-serif"
  context.fillText('No simulation mounted', 32, 60)
}

function render() {
  renderMeta()
  renderSummary()
  renderLeaderboard()
  renderControls()

  if (runtime.simulation) {
    runtime.simulation.draw(context)
  } else {
    renderCanvasFallback()
  }
}

function finalizeEventIfNeeded() {
  if (!runtime.simulation?.isComplete() || runtime.state.ui.phase !== UI_PHASES.RUNNING) {
    return
  }

  const { updatedSeason } = applyEventResults(runtime.state, runtime.simulation.getResults())
  runtime.state = updatedSeason
  render()
}

function prepareNextRound() {
  if (runtime.state.ui.phase !== UI_PHASES.RESULTS || runtime.state.season.winner) {
    return false
  }

  runtime.state.ui.phase = UI_PHASES.READY
  mountSimulation()
  render()
  return true
}

function getDebugSnapshot() {
  const standings = getLeaderboard(runtime.state)
  return {
    phase: runtime.state.ui.phase,
    round: runtime.state.season.round,
    currentEvent: runtime.simulation?.eventType ?? getNextEventType(runtime.state),
    activeAthleteCount: runtime.state.season.activeAthleteIds.length,
    seed: runtime.state.season.seed,
    latestResults: runtime.state.ui.lastResults
      ? {
          eventType: runtime.state.ui.lastResults.eventType,
          placements: runtime.state.ui.lastResults.placements.map((entry) => ({ ...entry })),
        }
      : null,
    eliminationNotice: runtime.state.ui.eliminationNotice,
    champion: runtime.state.season.winner
      ? {
          id: runtime.state.season.winner.id,
          name: runtime.state.season.winner.name,
          score: runtime.state.season.winner.score,
        }
      : null,
    leaderboard: standings.map((athlete) => ({
      id: athlete.id,
      name: athlete.name,
      score: athlete.score,
      eliminated: athlete.eliminated,
      topThreeCount: athlete.topThreeCount,
      lastPlacement: athlete.lastPlacement,
    })),
  }
}

function installDebugApi() {
  if (!DEBUG_ENABLED) {
    return
  }

  Object.defineProperty(window, '__ALGICO_DEBUG__', {
    configurable: true,
    value: Object.freeze({
      getSnapshot() {
        return getDebugSnapshot()
      },
      setSpeed(speed) {
        setSelectedSpeed(speed)
        render()
        return getDebugSnapshot()
      },
      startSeason(seed = createSeed()) {
        startSeason(String(seed))
        return getDebugSnapshot()
      },
      resetSeason() {
        startSeason(runtime.state.season.seed)
        return getDebugSnapshot()
      },
      prepareRound({
        seed = runtime.state.season.seed,
        round = 1,
        speed = runtime.state.ui.selectedSpeed,
      } = {}) {
        startSeason(String(seed))
        setSelectedSpeed(speed)

        while (runtime.state.season.round < Math.max(0, round - 1) && !runtime.state.season.winner) {
          runtime.state = advanceStateThroughCurrentRound(runtime.state, speed)
        }

        runtime.state.ui.phase = runtime.state.season.winner ? UI_PHASES.COMPLETE : UI_PHASES.READY
        mountSimulation()
        render()
        return getDebugSnapshot()
      },
      completeCurrentRound(speed = runtime.state.ui.selectedSpeed) {
        if (!runtime.simulation) {
          mountSimulation()
        }
        if (!runtime.simulation) {
          return getDebugSnapshot()
        }

        setSelectedSpeed(speed)
        runtime.simulation.start()
        runtime.state.ui.phase = UI_PHASES.RUNNING

        let guard = 0
        while (!runtime.simulation.isComplete() && guard < 4000) {
          runtime.simulation.update(1000 / 60, speed)
          guard += 1
        }

        if (!runtime.simulation.isComplete()) {
          throw new Error('Simulation did not complete during browser smoke test.')
        }

        finalizeEventIfNeeded()
        return getDebugSnapshot()
      },
      prepareNextRound() {
        prepareNextRound()
        return getDebugSnapshot()
      },
    }),
  })
}

function animationLoop(timestamp) {
  if (!runtime.lastFrameTime) {
    runtime.lastFrameTime = timestamp
  }

  const deltaMs = Math.min(timestamp - runtime.lastFrameTime, 32)
  runtime.lastFrameTime = timestamp

  if (runtime.state?.ui.phase === UI_PHASES.RUNNING && runtime.simulation) {
    runtime.simulation.update(deltaMs, runtime.state.ui.selectedSpeed)
    finalizeEventIfNeeded()
  }

  render()
  runtime.frameId = window.requestAnimationFrame(animationLoop)
}

runEventButton.addEventListener('click', () => {
  if (!runtime.simulation || runtime.state.ui.phase !== UI_PHASES.READY) {
    return
  }

  runtime.simulation.start()
  runtime.state.ui.phase = UI_PHASES.RUNNING
})

nextEventButton.addEventListener('click', () => {
  if (!prepareNextRound()) {
    return
  }
})

newSeasonButton.addEventListener('click', () => {
  startSeason(createSeed())
})

resetButton.addEventListener('click', () => {
  startSeason(runtime.state.season.seed)
})

speedSelect.addEventListener('change', (event) => {
  setSelectedSpeed(event.target.value)
})

startSeason(createSeed())
installDebugApi()
runtime.frameId = window.requestAnimationFrame(animationLoop)
