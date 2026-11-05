import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

/*
	The form controls that are the browser's own until JavaScript runs and
	shadcn's after: `FormSelect`, `FormCheckbox` and the role editor's scope
	radios. A test on the `desktop-no-js` project presses the browser's own;
	on the others it waits for shadcn's to take its place first, because a pick
	made in the browser's own control just before the swap would be lost with
	it.

	shadcn marks each of its controls with a `data-slot`, which is how a test
	can tell the two apart without reaching for anything a person cannot see.
*/

/** Whether this project runs without JavaScript. */
function isWithoutJavaScript(testInfo: TestInfo): boolean {
	return testInfo.project.use.javaScriptEnabled === false;
}

/** How long the page may take to come to life. */
const ENHANCED_TIMEOUT_MS = 15_000;

/** Escapes the characters a regular expression would read as its own. */
function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pick the choice with these words in a `FormSelect` found by its label. A
 * choice may carry a detail after a dot, such as "Chair · assigned
 * committees", so the label is matched at the start of the choice's words.
 * With JavaScript the list floats over the page, outside the form, so its
 * options are looked for on the whole page.
 */
export async function pickOption(
	page: Page,
	testInfo: TestInfo,
	field: Locator,
	optionLabel: string
): Promise<void> {
	const optionName = new RegExp(`^\\s*${escapeRegExp(optionLabel)}( · .*)?\\s*$`);

	if (isWithoutJavaScript(testInfo)) {
		const optionText = await field
			.locator('option')
			.filter({ hasText: optionName })
			.first()
			.textContent();
		await field.selectOption({ label: (optionText ?? optionLabel).trim() });
		return;
	}

	await expect(field).toHaveAttribute('data-slot', 'select-trigger', {
		timeout: ENHANCED_TIMEOUT_MS
	});
	await field.click();
	await page.getByRole('option', { name: optionName }).click();
	await expect(field).toContainText(optionLabel);
}

/** Tick or untick a `FormCheckbox` found by its label. */
export async function setChecked(
	testInfo: TestInfo,
	box: Locator,
	isChecked: boolean
): Promise<void> {
	if (!isWithoutJavaScript(testInfo)) {
		await expect(box).toHaveAttribute('data-slot', 'checkbox', { timeout: ENHANCED_TIMEOUT_MS });
	}

	await box.setChecked(isChecked);
}

/** Choose a radio found by its label, shadcn's or the browser's own. */
export async function chooseRadio(testInfo: TestInfo, radio: Locator): Promise<void> {
	if (!isWithoutJavaScript(testInfo)) {
		await expect(radio).toHaveAttribute('data-slot', 'radio-group-item', {
			timeout: ENHANCED_TIMEOUT_MS
		});
	}

	await radio.check();
}
