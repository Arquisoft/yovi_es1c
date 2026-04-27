import { Given, When, Then } from '@cucumber/cucumber'
import assert from 'assert'


Given('the register page is open', async function () {
    const page = this.page
    if (!page) throw new Error('Page not initialized')
    await page.goto('https://localhost/register')
})

When('I enter {string} as the username and submit', async function (username) {
    const page = this.page
    if (!page) throw new Error('Page not initialized')

    const uniqueUsername = `${username}_${Date.now()}`
    this.registeredUsername = uniqueUsername

    await page.fill('input[autocomplete="username"]', uniqueUsername)
    await page.fill('input[autocomplete="new-password"]', 'password123')
    await page.click('button[type="submit"]')
})

Then('I should see a welcome message containing {string}', async function (_expected) {
    const page = this.page
    if (!page) throw new Error('Page not initialized')
    await page.waitForSelector('.MuiAlert-message', { timeout: 5000 })
    const text = await page.textContent('.MuiAlert-message')
    assert.ok(
        text && text.includes(this.registeredUsername),
        `Expected message with "${this.registeredUsername}", got: "${text}"`
    )
})


When('I fill in the register username with {string}', async function (username) {
    await this.page.fill('input[autocomplete="username"], input[name="username"]', username)
})

When('I fill in the register password with {string}', async function (password) {
    const inputs = await this.page.$$('input[type="password"]')
    await inputs[0].fill(password)
})

When('I fill in the confirm password with {string}', async function (password) {
    const inputs = await this.page.$$('input[type="password"]')
    const confirmInput = inputs.length > 1 ? inputs[1] : inputs[0]
    await confirmInput.fill(password)
})

When('I click the register button', async function () {
    await this.page.click('button[type="submit"]')
})

Then('I should see a register error message', async function () {
    await this.page.waitForSelector('.MuiAlert-message, [role="alert"]', { timeout: 5000 })
    const el = await this.page.$('.MuiAlert-message, [role="alert"]')
    assert.ok(el, 'Expected a register error message to be visible')
})

Then('I should see a password mismatch error', async function () {
    await this.page.waitForSelector('.MuiAlert-message, [role="alert"], [class*="error" i]', { timeout: 5000 })
    const el = await this.page.$('.MuiAlert-message, [role="alert"], [class*="error" i]')
    assert.ok(el, 'Expected a password mismatch error to be visible')
})