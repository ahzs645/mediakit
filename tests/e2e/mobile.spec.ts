import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import JSZip from 'jszip';

test.use({ hasTouch: true, isMobile: true });

async function setup(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-22T20:00:00Z'));
  await page.route('**/wp-json/unbc-events/v1/events/**', route => route.fulfill({ json: {
    events: Array.from({ length: 35 }, (_, index) => {
      const day = 19 + Math.floor(index / 5);
      return { id: String(index), title: `Campus gathering ${day}.${index % 5 + 1}`, description: 'Meet your campus community. Bring a friend.', startDate: `2026-10-${day}T17:00:00Z`, endDate: `2026-10-${day}T18:00:00Z`, category: 'unbc', status: 'scheduled' };
    }),
    eventMetadata: Object.fromEntries(Array.from({ length: 35 }, (_, index) => [String(index), { location: 'Student centre', categories: [{ name: index % 2 ? 'Community' : 'UNBC' }], website: `https://${index % 2 ? 'tourismpg.com' : 'www.unbc.ca'}/events/${index}` }])),
    pages: 1, pagination: { hasMore: false },
  } }));
  await page.goto('/');
  await expect(page.getByText('Connected to live calendar')).toBeVisible();
  await expect(page.locator('.artboard')).not.toHaveClass(/is-rendering/);
}
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });
async function ready(page: Page) { await expect(page.locator('.artboard')).not.toHaveClass(/is-rendering/); }

for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 740 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 844, height: 390 }]) {
  test(`touch workflow fits ${viewport.width}×${viewport.height} without hiding tabs or actions`, async ({ page }) => {
    await page.setViewportSize(viewport); await setup(page);
    await expect(page.getByRole('tablist', { name: 'Studio workspace' })).toBeVisible();
    await expect(tab(page, 'Events')).toHaveAttribute('aria-selected', 'true');
    await tab(page, 'Export').tap();
    await page.getByRole('button', { name: 'Choose events', exact: true }).tap();
    await page.getByRole('button', { name: 'Show 2026-10-19', exact: true }).tap();
    await page.getByRole('checkbox', { name: 'Select Campus gathering 19.1', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Select Campus gathering 19.2', exact: true }).check();
    await tab(page, 'Design').tap();
    await page.getByRole('button', { name: 'Weekly list', exact: false }).tap();
    await page.getByRole('button', { name: 'Forest palette', exact: true }).tap();
    await tab(page, 'Preview').tap(); await ready(page);
    const artboard = await page.locator('.artboard').boundingBox();
    expect(artboard!.width / artboard!.height).toBeCloseTo(1080 / 1920, 2);
    await tab(page, 'Export').tap();
    await expect(page.getByRole('button', { name: 'Download current slide (1)', exact: true })).toBeEnabled();
    for (const name of ['Events', 'Design', 'Preview', 'Export']) {
      const bounds = (await tab(page, name).boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await tab(page, 'Events').tap();
    await expect(page.getByRole('checkbox', { name: 'Select Campus gathering 19.1', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Select Campus gathering 19.2', exact: true })).toBeChecked();
    if (viewport.width === 390) {
      await page.screenshot({ path: 'docs/mobile-events.png' });
      await tab(page, 'Design').tap(); await page.screenshot({ path: 'docs/mobile-design.png' });
      await tab(page, 'Export').tap(); await page.screenshot({ path: 'docs/mobile-export.png' });
    }
  });
}

test('mobile filters, scroll positions, and multi-event selections survive tab changes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page);
  const filters = page.getByRole('button', { name: /^Filters/ });
  await filters.tap(); await expect(filters).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('Event source', { exact: true }).selectOption('tourismpg.com');
  await page.getByLabel('Event category', { exact: true }).selectOption('Community');
  await expect(filters).toContainText('2');
  await filters.tap(); await expect(filters).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Event source', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Show 2026-10-19', exact: true }).tap();
  await page.getByRole('button', { name: 'Select all 2026-10-19', exact: true }).tap();
  await expect(page.locator('.selected-filter')).toContainText('2');
  await page.getByRole('button', { name: 'Show all dates', exact: true }).tap();
  await page.locator('.events-scroll').evaluate(element => { element.scrollTop = 140; });
  const scroll = await page.locator('.events-scroll').evaluate(element => element.scrollTop);
  expect(scroll).toBeGreaterThan(0);
  await tab(page, 'Preview').tap(); await tab(page, 'Events').tap();
  expect(await page.locator('.events-scroll').evaluate(element => element.scrollTop)).toBe(scroll);
  await expect(page.locator('.selected-filter')).toContainText('2');
  await filters.tap(); await expect(page.getByLabel('Event source', { exact: true })).toHaveValue('tourismpg.com');
  await expect(page.getByLabel('Event category', { exact: true })).toHaveValue('Community');
});

test('phone editor retains typing focus and saves with a reduced keyboard viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page);
  await page.getByRole('button', { name: 'Edit Campus gathering 19.1', exact: true }).tap();
  const title = page.getByRole('textbox', { name: 'Event title', exact: true });
  await title.fill('Campus coffee'); await title.press('End'); await title.pressSequentially(' and conversation');
  await expect(title).toBeFocused(); await expect(title).toHaveValue('Campus coffee and conversation');
  expect(await title.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  await page.setViewportSize({ width: 390, height: 430 });
  await page.getByLabel('Description', { exact: true }).fill('Bring a friend.');
  await page.getByRole('button', { name: 'Save edits', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Campus coffee and conversation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add a custom event', exact: true }).tap();
  await page.getByRole('textbox', { name: 'Event title', exact: true }).fill('Phone-created event');
  await page.getByLabel('All-day event', { exact: true }).check();
  await page.getByRole('button', { name: 'Add to design', exact: true }).tap();
  await expect(page.locator('.selected-filter')).toContainText('1');
});

test('mobile exports images, archives, and project backups without opening another tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page);
  await page.getByRole('button', { name: 'Add suggestions', exact: true }).tap();
  await tab(page, 'Design').tap(); await page.getByRole('button', { name: 'Weekly list', exact: false }).tap();
  await tab(page, 'Export').tap(); await ready(page);
  const image = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download current slide (1)', exact: true }).tap();
  expect(await sharp(await fs.readFile((await (await image).path())!)).metadata()).toMatchObject({ width: 1080, height: 1920 });
  const archive = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download all slides + caption', exact: true }).tap();
  const zip = await JSZip.loadAsync(await fs.readFile((await (await archive).path())!)); expect(zip.file('caption.txt')).toBeTruthy();
  await page.getByRole('button', { name: 'Project menu', exact: true }).tap();
  const backup = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save project', exact: true }).tap();
  const backupPath = (await (await backup).path())!; const saved = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  expect(saved.selected).toHaveLength(5); expect(saved.template).toBe('list');
  await page.getByRole('button', { name: 'Project menu', exact: true }).tap();
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Open project', exact: true }).tap();
  await (await chooser).setFiles({ name: 'saved-project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await expect(page.getByRole('dialog')).toHaveCount(0); await ready(page);
  await tab(page, 'Events').tap(); await expect(page.locator('.selected-filter')).toContainText('5');
});

test('mobile tabs support keyboard navigation and expose one active panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await setup(page);
  await tab(page, 'Events').focus(); await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'Design')).toBeFocused(); await expect(tab(page, 'Design')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await expect(page.getByRole('tabpanel', { name: 'Design', exact: true })).toBeVisible();
  await page.keyboard.press('End'); await expect(tab(page, 'Export')).toBeFocused();
  await page.keyboard.press('Home'); await expect(tab(page, 'Events')).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole('tablist')).toBeHidden();
  await expect(page.getByRole('region', { name: 'Choose events', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Design and export', exact: true })).toBeVisible();
});
