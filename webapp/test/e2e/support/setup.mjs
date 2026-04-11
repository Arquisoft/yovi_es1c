import { setWorldConstructor, Before, After, setDefaultTimeout } from '@cucumber/cucumber'
import { chromium, request } from 'playwright'

setDefaultTimeout(60_000)

class CustomWorld {
  browser = null
  page = null
}

setWorldConstructor(CustomWorld)

Before(async function () {
  const headless = true
  const slowMo = 0
  const devtools = false

  this.browser = await chromium.launch({ headless, slowMo, devtools })

  const context = await this.browser.newContext({ ignoreHTTPSErrors: true })
  this.page = await context.newPage()
})

After(async function () {
  if (this.page) await this.page.close()
  if (this.browser) await this.browser.close()
})