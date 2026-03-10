import { expect, test } from '@playwright/test'

let consoleErrors = []

async function getDebugSnapshot(page) {
  return page.evaluate(() => window.__ALGICO_DEBUG__.getSnapshot())
}

async function completeRound(page, speed = 60) {
  await page.evaluate((value) => window.__ALGICO_DEBUG__.setSpeed(value), speed)
  await page.getByTestId('run-event-button').click()
  await expect
    .poll(async () => {
      const snapshot = await getDebugSnapshot(page)
      return snapshot.phase
    })
    .toBe('results')
  return getDebugSnapshot(page)
}

test.beforeEach(async ({ page }) => {
  consoleErrors = []

  page.on('pageerror', (error) => {
    consoleErrors.push(`pageerror:${error.message}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  await page.goto('/')
  await page.waitForFunction(() => Boolean(window.__ALGICO_DEBUG__))
})

test.afterEach(async () => {
  expect(consoleErrors).toEqual([])
})

test('loads the core UI and exposes the smoke-test runtime', async ({ page }) => {
  await expect(page.getByTestId('stage-panel')).toBeVisible()
  await expect(page.getByTestId('leaderboard-panel')).toBeVisible()
  await expect(page.getByTestId('run-event-button')).toBeEnabled()

  const snapshot = await getDebugSnapshot(page)
  expect(snapshot.phase).toBe('ready')
  expect(snapshot.activeAthleteCount).toBe(16)
  expect(snapshot.currentEvent).toBe('downhill')
  expect(snapshot.leaderboard).toHaveLength(16)
})

test('round flow produces placements, elimination, and the next event preview', async ({ page }) => {
  const initial = await getDebugSnapshot(page)
  expect(initial.seed).toBeTruthy()

  const roundResults = await completeRound(page)
  expect(roundResults.round).toBe(1)
  expect(roundResults.activeAthleteCount).toBe(15)
  expect(roundResults.latestResults.placements).toHaveLength(16)
  expect(new Set(roundResults.latestResults.placements.map((entry) => entry.athleteId)).size).toBe(16)

  await expect(page.getByTestId('next-event-button')).toBeEnabled()
  await page.getByTestId('next-event-button').click()

  const nextRound = await getDebugSnapshot(page)
  expect(nextRound.phase).toBe('ready')
  expect(nextRound.currentEvent).toBe('bounce')
  expect(nextRound.activeAthleteCount).toBe(15)
})

test('reset preserves the seed while new season changes it', async ({ page }) => {
  const original = await getDebugSnapshot(page)

  await completeRound(page)
  await page.getByTestId('reset-button').click()

  const resetSnapshot = await getDebugSnapshot(page)
  expect(resetSnapshot.seed).toBe(original.seed)
  expect(resetSnapshot.round).toBe(0)
  expect(resetSnapshot.activeAthleteCount).toBe(16)
  expect(resetSnapshot.phase).toBe('ready')

  await page.getByTestId('new-season-button').click()
  const newSeason = await getDebugSnapshot(page)
  expect(newSeason.seed).not.toBe(original.seed)
  expect(newSeason.round).toBe(0)
  expect(newSeason.activeAthleteCount).toBe(16)
})

test('each event type can be reached deterministically and completed', async ({ page }) => {
  const rounds = [
    { round: 1, eventType: 'downhill', activeAthleteCount: 16 },
    { round: 2, eventType: 'bounce', activeAthleteCount: 15 },
    { round: 3, eventType: 'balance', activeAthleteCount: 14 },
    { round: 4, eventType: 'arena', activeAthleteCount: 13 },
  ]

  for (const entry of rounds) {
    const preview = await page.evaluate((payload) => window.__ALGICO_DEBUG__.prepareRound(payload), {
      seed: 'event-coverage-seed',
      round: entry.round,
      speed: 60,
    })

    expect(preview.currentEvent).toBe(entry.eventType)
    expect(preview.activeAthleteCount).toBe(entry.activeAthleteCount)

    const result = await completeRound(page, 60)
    expect(result.latestResults.eventType).toBe(entry.eventType)
    expect(result.latestResults.placements).toHaveLength(entry.activeAthleteCount)
    expect(new Set(result.latestResults.placements.map((placement) => placement.athleteId)).size).toBe(
      entry.activeAthleteCount,
    )
  }
})

test('a full season resolves to a single champion without breaking standings', async ({ page }) => {
  const finalSnapshot = await page.evaluate(() => {
    const api = window.__ALGICO_DEBUG__
    api.prepareRound({ seed: 'full-season-seed', round: 1, speed: 80 })

    while (!api.getSnapshot().champion) {
      api.completeCurrentRound(80)
      if (!api.getSnapshot().champion) {
        api.prepareNextRound()
      }
    }

    return api.getSnapshot()
  })

  expect(finalSnapshot.champion).not.toBeNull()
  expect(finalSnapshot.phase).toBe('complete')
  expect(finalSnapshot.activeAthleteCount).toBe(1)
  expect(finalSnapshot.round).toBe(15)

  const activeAthletes = finalSnapshot.leaderboard.filter((athlete) => !athlete.eliminated)
  expect(activeAthletes).toHaveLength(1)
  expect(activeAthletes[0].name).toBe(finalSnapshot.champion.name)

  const scores = finalSnapshot.leaderboard.map((athlete) => athlete.score)
  expect(scores).toEqual([...scores].sort((left, right) => right - left))
  await expect(page.getByTestId('next-event-button')).toBeDisabled()
})
