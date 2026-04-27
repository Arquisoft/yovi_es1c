import { Given, When, Then } from '@cucumber/cucumber'
import assert from 'assert'

const BASE_URL = 'https://localhost'

// Helper de login reutilizable en Background
Given('I am logged in as {string}', async function (username) {
    await this.page.goto(`${BASE_URL}/register`)
    await this.page.waitForLoadState('networkidle')

    // Registrar con timestamp único para evitar conflictos
    const uniqueUser = `${username}_${Date.now()}`
    this.currentUser = uniqueUser

    await this.page.fill('input[autocomplete="username"], input[name="username"]', uniqueUser)
    const passwordInputs = await this.page.$$('input[type="password"]')
    for (const input of passwordInputs) {
        await input.fill('Password1!')
    }
    await this.page.click('button[type="submit"]')
    await this.page.waitForURL(`${BASE_URL}/`, { timeout: 10000 })
})

Given('I am on the home page', async function () {
    await this.page.goto(`${BASE_URL}/`)
    await this.page.waitForLoadState('networkidle')
})

Given('I navigate to {string}', async function (path) {
    await this.page.goto(`${BASE_URL}${path}`)
    await this.page.waitForLoadState('networkidle')
})

Then('the page should have loaded', async function () {
    const title = await this.page.title()
    assert.ok(title.length > 0, 'Page title is empty, page may not have loaded')
})