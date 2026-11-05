import { expect, test } from '@playwright/test';
import { remInPixels } from './page-shape';

// The whole site is drawn from one size, the font size `html` sets, and
// `--page-scale` in `src/routes/layout.css` multiplies it. These tests hold
// that size at the windows people actually use, so a change to the scale or
// to the formula behind it shows up here and not in a cofounder's screenshot.
// Each test sets its own window, so they only need to run in one project.

// Window width, and the rem in pixels the page should draw there at a 1.1
// scale. A phone and a tablet are 16px times 1.1; from 1024px up the size
// grows with the window, 14px at 1280px and 16px at 1536px before the scale.
const ROOT_SIZES = [
	{ name: 'a phone', width: 390, height: 844, rem: 17.6 },
	{ name: 'a tablet', width: 820, height: 1180, rem: 17.6 },
	{ name: 'a 1280px laptop', width: 1280, height: 800, rem: 15.4 },
	{ name: "the mockups' 1536px width", width: 1536, height: 864, rem: 17.6 },
	{ name: 'a 1920 by 1200 screen', width: 1920, height: 1200, rem: 20.9 },
	{ name: 'a 2560px screen', width: 2560, height: 1440, rem: 26.4 }
];

for (const size of ROOT_SIZES) {
	test(`one rem is ${size.rem}px on ${size.name}`, async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== 'desktop', 'Each test sets its own window.');

		await page.setViewportSize({ width: size.width, height: size.height });
		await page.goto('/conferences');

		expect(await remInPixels(page)).toBeCloseTo(size.rem, 1);
	});
}
