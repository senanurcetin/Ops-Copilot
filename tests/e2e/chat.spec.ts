import { test, expect } from '@playwright/test';

test.describe('Chat Interface', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for chat interface to load
    await page.waitForSelector('[data-testid="chat-input"]');
  });

  test('should display chat interface', async ({ page }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="send-button"]');
    
    await expect(chatInput).toBeVisible();
    await expect(sendButton).toBeVisible();
  });

  test('should send and display message', async ({ page }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="send-button"]');
    
    await chatInput.fill('Hello, how are you?');
    await sendButton.click();
    
    // Wait for message to appear in chat
    await page.waitForSelector('[data-testid="chat-message"]');
    const message = page.locator('[data-testid="chat-message"]').first();
    await expect(message).toContainText('Hello, how are you?');
  });

  test('should display AI response', async ({ page }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="send-button"]');
    
    await chatInput.fill('What is 2+2?');
    await sendButton.click();
    
    // Wait for AI response
    await page.waitForSelector('[data-testid="ai-message"]', { timeout: 10000 });
    const response = page.locator('[data-testid="ai-message"]');
    await expect(response).toBeVisible();
  });

  test('should clear chat history', async ({ page }) => {
    const chatInput = page.locator('[data-testid="chat-input"]');
    const sendButton = page.locator('[data-testid="send-button"]');
    const clearButton = page.locator('[data-testid="clear-chat"]');
    
    await chatInput.fill('Test message');
    await sendButton.click();
    
    // Verify message exists
    await page.waitForSelector('[data-testid="chat-message"]');
    
    // Clear chat
    await clearButton.click();
    
    // Confirm clear
    await page.click('button:has-text("Clear")');
    
    // Verify messages are gone
    const messages = page.locator('[data-testid="chat-message"]');
    await expect(messages).toHaveCount(0);
  });

  test('should handle empty input', async ({ page }) => {
    const sendButton = page.locator('[data-testid="send-button"]');
    
    // Send button should be disabled
    await expect(sendButton).toBeDisabled();
  });
});
