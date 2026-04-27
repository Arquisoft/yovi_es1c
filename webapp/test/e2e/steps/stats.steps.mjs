import { Given, When, Then } from '@cucumber/cucumber'
import assert from 'assert'

const BASE_URL = 'https://localhost'

When('I click the stats link', async function () {
    await this.page.click('a[href="/stats"]')
    await this.page.waitForLoadState('networkidle')
})

Then('I should see the stats section', async function () {
    const el = await this.page.$('[class*="stat" i], [data-testid*="stat" i], h1, h2')
    assert.ok(el, 'Stats section not found on page')
})

Then('I should be on the stats page', async function () {
    await this.page.waitForURL(`${BASE_URL}/stats`, { timeout: 8000 })
    const url = this.page.url()
    assert.ok(url.includes('/stats'), `Expected stats page, got: ${url}`)
})