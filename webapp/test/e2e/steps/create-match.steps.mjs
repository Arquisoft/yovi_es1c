import { Given, When, Then } from '@cucumber/cucumber'
import assert from 'assert'

const BASE_URL = 'https://localhost'

Given('I am on the create match page', async function () {
    await this.page.goto(`${BASE_URL}/create-match`)
    await this.page.waitForLoadState('networkidle')
})

// Abre el Select MUI con labelId="game-mode-label" / id="game-mode"
// y elige el MenuItem con value="BOT" (modo local vs IA)
When('I select the local game mode', async function () {
    // Hacer click en el div del Select (no en el label, sino en el input nativo que MUI genera)
    const gameModeSelect = await this.page.$('#game-mode')
    assert.ok(gameModeSelect, 'Game mode select not found')

    await this.page.click('[labelid="game-mode-label"], #\\:r4\\:, #game-mode ~ [role="combobox"], div[id="game-mode"]')
        .catch(async () => {
            // Fallback: click en el div con el texto del Select
            await this.page.locator('div').filter({ hasText: /VS BOT|BOT/ }).first().click()
        })

    // MUI abre un portal fuera del DOM del Paper — esperar el listbox
    await this.page.waitForSelector('[role="listbox"]', { timeout: 5000 })
    await this.page.click('[data-value="BOT"]')
    await this.page.waitForSelector('[role="listbox"]', { state: 'hidden', timeout: 3000 })
})

When('I select the online game mode', async function () {
    await this.page.locator('#game-mode').click()
        .catch(async () => {
            await this.page.locator('div[role="combobox"]').first().click()
        })

    await this.page.waitForSelector('[role="listbox"]', { timeout: 5000 })
    await this.page.click('[data-value="ONLINE"]')
    await this.page.waitForSelector('[role="listbox"]', { state: 'hidden', timeout: 3000 })
})

When('I click the start game button', async function () {
    await this.page.locator('button[type="button"]:not([disabled])').last().click()
    await this.page.waitForTimeout(2000)
})

Then('I should be on the game page', async function () {
    await this.page.waitForURL(`${BASE_URL}/gamey`, { timeout: 20000 })
    assert.ok(this.page.url().includes('/gamey'), `Expected /gamey, got: ${this.page.url()}`)
})

Then('I should be on the matchmaking page', async function () {
    await this.page.waitForURL(`${BASE_URL}/online/matchmaking`, { timeout: 15000 })
    assert.ok(
        this.page.url().includes('/online/matchmaking'),
        `Expected /online/matchmaking, got: ${this.page.url()}`
    )
})