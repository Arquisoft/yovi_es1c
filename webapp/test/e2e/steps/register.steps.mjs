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
