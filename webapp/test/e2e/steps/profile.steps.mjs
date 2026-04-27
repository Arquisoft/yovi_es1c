import { Given, When, Then } from '@cucumber/cucumber'
import assert from 'assert'

Then('I should see the profile page content', async function () {
    const el = await this.page.$('[class*="profile" i], [data-testid*="profile" i], h1, h2')
    assert.ok(el, 'Profile page content not found')
})

Then('I should see my username on the profile', async function () {
    const content = await this.page.textContent('body')
    assert.ok(
        content && this.currentUser && content.includes(this.currentUser.split('_')[0]),
        `Expected username on profile, page content: "${content?.substring(0, 200)}"`
    )
})