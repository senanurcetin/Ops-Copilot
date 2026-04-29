# Testing Guide

## Overview

This project includes comprehensive E2E testing using Playwright to ensure quality and reliability.

## E2E Testing with Playwright

### Setup

Playwright is configured in [`playwright.config.ts`](../playwright.config.ts). Tests are located in the `tests/e2e/` directory.

### Running E2E Tests

```bash
# Install dependencies (if not already installed)
npm install

# Run all E2E tests
npx playwright test

# Run tests in UI mode (interactive)
npx playwright test --ui

# Run tests in debug mode
npx playwright test --debug

# Run a specific test file
npx playwright test tests/e2e/auth.spec.ts

# Run tests matching a pattern
npx playwright test --grep @smoke

# Run tests on specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

### Test Structure

Tests are organized by feature:

- **`auth.spec.ts`** - Authentication and login flows
- **`chat.spec.ts`** - Chat interface functionality

### Writing New Tests

Example test structure:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup before each test
    await page.goto('/');
  });

  test('should do something', async ({ page }) => {
    // Test implementation
    await expect(page).toHaveTitle(/Title/);
  });
});
```

### Best Practices

1. **Use Data Attributes**: Add `data-testid` attributes to elements for reliable selection
   ```typescript
   await page.locator('[data-testid="button-id"]').click();
   ```

2. **Wait for Elements**: Always wait for elements to be ready
   ```typescript
   await page.waitForSelector('[data-testid="element"]');
   ```

3. **Test User Workflows**: Focus on testing complete user journeys
4. **Avoid Flakiness**: Use proper waiting strategies instead of hardcoded delays
5. **Keep Tests Independent**: Each test should be able to run in isolation

### CI/CD Integration

E2E tests run automatically on:

- Every push to `main`, `develop`, and `feature/add-testing` branches
- Every pull request to `main` and `develop` branches
- Daily schedule at 2 AM UTC

See [`.github/workflows/e2e-tests.yml`](../.github/workflows/e2e-tests.yml) for configuration.

## Unit Testing

Unit tests use Jest and are located in `src/__tests__/`.

```bash
# Run all unit tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

## Coverage Requirements

- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 70%
- **Statements**: 70%

See [`jest.config.json`](../jest.config.json) for Jest configuration.

## Debugging Tests

### Playwright Inspector

```bash
npx playwright test --debug
```

This opens the Playwright Inspector where you can:
- Step through the test
- Inspect DOM elements
- View network requests
- Execute custom commands

### Trace Files

Playwright automatically records traces on first failure:

```bash
# View trace
npx playwright show-trace trace.zip
```

### Screenshots and Videos

Enable in `playwright.config.ts`:

```typescript
use: {
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
}
```

## Troubleshooting

### Tests Timing Out

- Increase timeout in test: `test.setTimeout(60000)`
- Check if server is running: `npm run dev`

### Element Not Found

- Verify `data-testid` attribute exists in component
- Use `page.pause()` to debug element selectors

### Authentication Issues

- Ensure Firebase test credentials are set
- Check environment variables are loaded

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Testing Library Best Practices](https://testing-library.com/docs/queries/about)
- [Jest Documentation](https://jestjs.io/)
