import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: 'mobile.spec.ts',
  use: { ...base.use, channel: undefined },
  projects: [
    { name: 'phone-chrome', use: { browserName: 'chromium', channel: 'chrome' } },
    { name: 'phone-webkit', use: { browserName: 'webkit', channel: undefined } },
  ],
});
