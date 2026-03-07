import {
  ATHLETE_PRESETS,
  EVENT_ORDER,
  MAX_ROUNDS,
  UI_PHASES,
} from './constants.js'

function createAthleteRecord(preset, id) {
  return {
    id,
    name: preset.name,
    color: preset.color,
    score: 0,
    eliminated: false,
    placementHistory: [],
  }
}

function getTopThreeCount(athlete) {
  return athlete.placementHistory.filter((entry) => entry.place <= 3).length
}

function getLastPlacement(athlete) {
  const latest = athlete.placementHistory.at(-1)
  return latest ? latest.place : Number.POSITIVE_INFINITY
}

function cloneAthlete(athlete) {
  return {
    ...athlete,
    placementHistory: athlete.placementHistory.map((entry) => ({ ...entry })),
  }
}

export function scorePlacements(fieldSize) {
  return Array.from({ length: fieldSize }, (_, index) => fieldSize - index)
}

export function getNextEventType(state) {
  if (state.season.winner || state.season.round >= MAX_ROUNDS) {
    return null
  }

  return EVENT_ORDER[state.season.round % EVENT_ORDER.length]
}

export function getLeaderboard(state) {
  return state.athletes
    .map((athlete) => ({
      ...athlete,
      topThreeCount: getTopThreeCount(athlete),
      lastPlacement: getLastPlacement(athlete),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      if (left.eliminated !== right.eliminated) {
        return Number(left.eliminated) - Number(right.eliminated)
      }

      if (right.topThreeCount !== left.topThreeCount) {
        return right.topThreeCount - left.topThreeCount
      }

      if (left.lastPlacement !== right.lastPlacement) {
        return left.lastPlacement - right.lastPlacement
      }

      return left.id - right.id
    })
}

export function createSeason(seed = Date.now()) {
  const athletes = ATHLETE_PRESETS.map((preset, id) => createAthleteRecord(preset, id))

  return {
    athletes,
    season: {
      round: 0,
      activeAthleteIds: athletes.map((athlete) => athlete.id),
      completedEvents: [],
      currentEvent: EVENT_ORDER[0],
      winner: null,
      seed: String(seed),
    },
    ui: {
      phase: UI_PHASES.READY,
      selectedSpeed: 1,
      lastResults: null,
      eliminationNotice: null,
    },
  }
}

export function pickEliminationCandidate(athletes, activeIds, placements) {
  const placementLookup = new Map(placements.map((athleteId, index) => [athleteId, index + 1]))
  const activeAthletes = activeIds.map((athleteId) => athletes[athleteId])

  return activeAthletes.reduce((currentWorst, candidate) => {
    if (!currentWorst) {
      return candidate
    }

    if (candidate.score !== currentWorst.score) {
      return candidate.score < currentWorst.score ? candidate : currentWorst
    }

    const candidatePlace = placementLookup.get(candidate.id) ?? Number.POSITIVE_INFINITY
    const currentPlace = placementLookup.get(currentWorst.id) ?? Number.POSITIVE_INFINITY
    if (candidatePlace !== currentPlace) {
      return candidatePlace > currentPlace ? candidate : currentWorst
    }

    const candidateTopThree = getTopThreeCount(candidate)
    const currentTopThree = getTopThreeCount(currentWorst)
    if (candidateTopThree !== currentTopThree) {
      return candidateTopThree < currentTopThree ? candidate : currentWorst
    }

    return candidate.id < currentWorst.id ? candidate : currentWorst
  }, null)
}

export function applyEventResults(state, results) {
  const placements = results.placements.map((entry) =>
    typeof entry === 'number' ? entry : entry.athleteId,
  )

  const fieldSize = state.season.activeAthleteIds.length
  const pointsByPlace = scorePlacements(fieldSize)
  const nextAthletes = state.athletes.map((athlete) => cloneAthlete(athlete))
  const placementSummaries = placements.map((athleteId, index) => {
    const athlete = nextAthletes[athleteId]
    const points = pointsByPlace[index]
    const placementEntry = {
      round: state.season.round + 1,
      eventType: results.eventType,
      place: index + 1,
      points,
    }

    athlete.score += points
    athlete.placementHistory.push(placementEntry)

    return {
      athleteId,
      name: athlete.name,
      color: athlete.color,
      place: index + 1,
      points,
      totalScore: athlete.score,
    }
  })

  let eliminatedAthlete = null
  let activeAthleteIds = [...state.season.activeAthleteIds]

  if (fieldSize > 1) {
    eliminatedAthlete = pickEliminationCandidate(nextAthletes, activeAthleteIds, placements)
    eliminatedAthlete.eliminated = true
    activeAthleteIds = activeAthleteIds.filter((athleteId) => athleteId !== eliminatedAthlete.id)
  }

  const winnerId = activeAthleteIds.length === 1 ? activeAthleteIds[0] : null
  const nextRound = state.season.round + 1
  const nextState = {
    athletes: nextAthletes,
    season: {
      ...state.season,
      round: nextRound,
      activeAthleteIds,
      completedEvents: [
        ...state.season.completedEvents,
        {
          round: nextRound,
          eventType: results.eventType,
          placements: placementSummaries,
          eliminatedAthleteId: eliminatedAthlete?.id ?? null,
        },
      ],
      currentEvent: winnerId === null ? EVENT_ORDER[nextRound % EVENT_ORDER.length] : null,
      winner: winnerId === null ? null : nextAthletes[winnerId],
    },
    ui: {
      ...state.ui,
      phase: winnerId === null ? UI_PHASES.RESULTS : UI_PHASES.COMPLETE,
      lastResults: {
        eventType: results.eventType,
        placements: placementSummaries,
      },
      eliminationNotice: eliminatedAthlete
        ? `${eliminatedAthlete.name} is eliminated.`
        : `${nextAthletes[winnerId].name} wins the Algicosathlon.`,
    },
  }

  return {
    updatedSeason: nextState,
    eliminatedAthlete,
    standings: getLeaderboard(nextState),
  }
}
