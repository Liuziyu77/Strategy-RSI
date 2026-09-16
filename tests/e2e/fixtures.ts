import { test as base, expect } from '@playwright/test';

// UI tests must not depend on availability of optional third-party fonts.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
    await use(page);
  },
});
export { expect };
