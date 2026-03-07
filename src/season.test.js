import { describe, expect, test } from 'vitest'

import { EVENT_ORDER } from './constants.js'
import {
  applyEventResults,
  createSeason,
  getNextEventType,
  pickEliminationCandidate,
  scorePlacements,
} from './season.js'

describe('season setup', () => {
  test('creates sixteen unique athletes', () => {
    const season = createSeason('seed-a')

    expect(season.athletes).toHaveLength(16)
    expect(new Set(season.athletes.map((athlete) => athlete.name)).size).toBe(16)
    expect(new Set(season.athletes.map((athlete) => athlete.color)).size).toBe(16)
  })

  test('scores placements from field size down to one', () => {
    expect(scorePlacements(5)).toEqual([5, 4, 3, 2, 1])
    expect(scorePlacements(2)).toEqual([2, 1])
  })

  test('rotates events across the full season', () => {
    let season = createSeason('seed-b')
    const encounteredEvents = []

    for (let round = 0; round < 15; round += 1) {
      encounteredEvents.push(getNextEventType(season))
      const placements = [...season.season.activeAthleteIds]
      const result = applyEventResults(season, {
        eventType: getNextEventType(season),
        placements,
      })
      season = result.updatedSeason
    }

    expect(encounteredEvents).toEqual(
      Array.from({ length: 15 }, (_, index) => EVENT_ORDER[index % EVENT_ORDER.length]),
    )
    expect(season.season.winner).not.toBeNull()
  })
})

describe('elimination logic', () => {
  test('eliminates the lowest scorer after an event', () => {
    const season = createSeason('seed-c')
    const placements = [...season.season.activeAthleteIds]
    const { updatedSeason, eliminatedAthlete } = applyEventResults(season, {
      eventType: 'downhill',
      placements,
    })

    expect(eliminatedAthlete.name).toBe(season.athletes.at(-1).name)
    expect(updatedSeason.season.activeAthleteIds).toHaveLength(15)
  })

  test('breaks elimination ties by worse finish, then top-threes, then lower id', () => {
    let season = createSeason('seed-d')
    season.athletes[0].score = 10
    season.athletes[1].score = 10
    season.season.activeAthleteIds = [0, 1]

    let eliminatedAthlete = pickEliminationCandidate(season.athletes, [0, 1], [0, 1])
    expect(eliminatedAthlete.id).toBe(1)

    season = createSeason('seed-e')
    season.athletes[0].score = 10
    season.athletes[1].score = 10
    season.athletes[0].placementHistory.push({
      round: 0,
      eventType: 'bounce',
      place: 2,
      points: 0,
    })
    season.athletes[1].placementHistory.push({
      round: 0,
      eventType: 'bounce',
      place: 4,
      points: 0,
    })
    eliminatedAthlete = pickEliminationCandidate(season.athletes, [0, 1], [])
    expect(eliminatedAthlete.id).toBe(1)

    season = createSeason('seed-f')
    season.athletes[0].score = 10
    season.athletes[1].score = 10
    eliminatedAthlete = pickEliminationCandidate(season.athletes, [0, 1], [])
    expect(eliminatedAthlete.id).toBe(0)
  })

  test('declares a champion when one athlete remains', () => {
    const season = createSeason('seed-g')
    season.season.activeAthleteIds = [4, 7]
    season.athletes = season.athletes.map((athlete, index) => ({
      ...athlete,
      eliminated: ![4, 7].includes(index),
    }))

    const { updatedSeason } = applyEventResults(season, {
      eventType: 'arena',
      placements: [7, 4],
    })

    expect(updatedSeason.season.winner.id).toBe(7)
    expect(updatedSeason.ui.phase).toBe('complete')
  })
})
