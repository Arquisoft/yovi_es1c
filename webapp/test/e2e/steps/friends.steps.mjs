import { Given, When, Then } from '@cucumber/cucumber'
import assert from 'assert'

Then('I should see the friends page', async function () {
    const el = await this.page.$('[class*="friend" i], [data-testid*="friend" i], h1, h2')
    assert.ok(el, 'Friends page content not found')
})

When('I search for a user {string}', async function (username) {
    const searchInput = await this.page.$('input[type="search"], input[placeholder*="search" i], input[placeholder*="buscar" i], input[placeholder*="user" i]')
    assert.ok(searchInput, 'Search input not found on friends page')
    await searchInput.fill(username)
    await this.page.keyboard.press('Enter')
    await this.page.waitForTimeout(1000)
})

Then('I should see search results', async function () {
    const results = await this.page.$('[class*="result" i], [class*="user" i], li, [role="listitem"]')
    assert.ok(results, 'No search results found')
})