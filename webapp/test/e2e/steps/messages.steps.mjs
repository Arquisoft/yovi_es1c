import { When, Then } from '@cucumber/cucumber'
import assert from 'assert'

const BASE_URL = 'https://localhost'

When('I type {string} in the message input', async function (text) {
    // MessagesPage.tsx: el input SOLO existe si hay activeFriend
    // → necesitamos navegar a /messages/:friendId
    // Primero intentar seleccionar un amigo de la lista de la sidebar

    const friendButton = this.page.locator('[class*="friendButton"]').first()
    const friendCount = await friendButton.count()

    if (friendCount > 0) {
        // Hay amigos → hacer click en el primero para activar la conversación
        await friendButton.click()
        await this.page.waitForTimeout(1500)
    }
    // Si no hay amigos, el input no estará disponible (diseño correcto del componente)

    // El input usa aria-label={t('messagesInputLabel')} — buscar por aria-label o por clase
    const input = this.page.locator(
        'input[aria-label], input[class*="input"], form[class*="chatComposer"] input'
    ).first()

    const inputVisible = await input.isVisible().catch(() => false)
    assert.ok(inputVisible, 'Message input not found — ensure testuser_e2e has at least one friend')

    await input.fill(text)
})

Then('the message input should contain {string}', async function (text) {
    const input = this.page.locator(
        'input[aria-label], input[class*="input"], form[class*="chatComposer"] input'
    ).first()

    const value = await input.inputValue()
    assert.strictEqual(value, text, `Expected input to contain "${text}", got "${value}"`)
})

When('I send the message', async function () {
    const submitBtn = this.page.locator('form[class*="chatComposer"] button[type="submit"]')
    await submitBtn.click()
    await this.page.waitForTimeout(1000)
})

Then('the message should appear in the chat', async function (text) {
    const messageText = this.page.locator(`[class*="chatText"]:has-text("${text}")`)
    await messageText.waitFor({ state: 'visible', timeout: 5000 })
    assert.ok(await messageText.isVisible(), `Message "${text}" not found in chat`)
})
Then('I should see the messages page', async function () {
    // MessagesPage.tsx siempre renderiza la estructura base aunque no haya amigos
    // Buscar el contenedor principal o el heading
    const pageContainer = this.page.locator(
        '[class*="messagesPage"], [class*="messages"], h1, h2, main'
    ).first()
    await pageContainer.waitFor({ state: 'visible', timeout: 8000 })
    assert.ok(await pageContainer.isVisible(), 'Messages page structure not visible')
})