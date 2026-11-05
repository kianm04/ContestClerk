import { expect, test, type Page } from '@playwright/test';

// The shared Markdown editor, tried in its styleguide group (T143). The group
// is a `method="get"` form, so the server's formatting of whatever was typed
// can be seen with JavaScript switched off too.

/** The editor's formatted writing area, emptied and ready to type into. */
async function emptyWritingArea(page: Page) {
	await page.goto('/styleguide#markdown');

	// The toolbar only appears once the editor has started in the browser.
	const group = page.locator('#markdown');
	await expect(group.getByRole('toolbar', { name: 'Formatting' })).toBeVisible();

	const writingArea = group.locator('[contenteditable="true"]');
	await writingArea.click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('Delete');

	return { group, writingArea };
}

/** The Markdown the editor holds, read from its "Markdown" view and switched back. */
async function markdownOf(page: Page): Promise<string> {
	const group = page.locator('#markdown');
	const switchButton = group.getByRole('button', { name: 'Markdown', exact: true });

	await switchButton.click();
	const markdown = await group.locator('textarea[name="sampleMarkdown"]').inputValue();
	await switchButton.click();

	return markdown;
}

test('without JavaScript the editor is a Markdown box, and the server formats what it sends', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.use.javaScriptEnabled !== false, 'Only the no-JS project.');

	await page.goto('/styleguide');
	const group = page.locator('#markdown');
	const box = group.getByRole('textbox', { name: 'Sample notes' });
	await expect(box).toHaveValue(/## Opening statements/);

	await box.fill('Some **bold** words\n\n<script>alert(1)</script>');
	await group.getByRole('button', { name: 'Show it formatted' }).press('Enter');

	await expect(page).toHaveURL(/sampleMarkdown=/);
	const figure = group.getByRole('figure').filter({ hasText: 'MarkdownContent' });
	await expect(figure.locator('strong', { hasText: 'bold' })).toBeVisible();
	// Raw HTML comes back as the text that was typed, never as a script.
	await expect(figure.getByText('<script>alert(1)</script>')).toBeVisible();
});

test('the server shows the sample formatted, with safe links', async ({ page }) => {
	await page.goto('/styleguide');
	const group = page.locator('#markdown');
	const figure = group.getByRole('figure').filter({ hasText: 'MarkdownContent' });

	await expect(figure.getByRole('heading', { name: 'Opening statements' })).toBeVisible();
	await expect(figure.locator('u', { hasText: 'quiet' })).toBeVisible();
	await expect(figure.getByRole('link', { name: 'UN Charter' })).toHaveAttribute(
		'rel',
		'noopener noreferrer'
	);
});

test.describe('with JavaScript', () => {
	test.skip(({ javaScriptEnabled }) => javaScriptEnabled === false, 'The editor needs JavaScript.');

	test('bold comes from the toolbar and from Ctrl+B', async ({ page }) => {
		const { group, writingArea } = await emptyWritingArea(page);
		const bold = group.getByRole('button', { name: 'Bold' });

		// Typing straight after the click, with no wait, is the point: the cursor
		// has to be back in the writing area by the time the first key arrives.
		await bold.click();
		await page.keyboard.type('loud');
		await expect(bold).toHaveAttribute('aria-pressed', 'true');
		await page.keyboard.press('ControlOrMeta+b');
		await expect(bold).toHaveAttribute('aria-pressed', 'false');
		await page.keyboard.type(' quiet ');
		await page.keyboard.press('ControlOrMeta+b');
		await page.keyboard.type('again');

		await expect(writingArea.locator('strong')).toHaveText(['loud', 'again']);
		expect(await markdownOf(page)).toBe('**loud** quiet **again**');
	});

	test('typed Markdown formats itself', async ({ page }) => {
		const { writingArea } = await emptyWritingArea(page);

		await page.keyboard.type('**x** and');
		await page.keyboard.press('Enter');
		await page.keyboard.type('- first');

		await expect(writingArea.locator('strong')).toHaveText('x');
		await expect(writingArea.locator('ul li')).toHaveText('first');
		expect(await markdownOf(page)).toBe('**x** and\n\n- first');
	});

	test('a list from the toolbar, and a link through the link box', async ({ page }) => {
		const { group, writingArea } = await emptyWritingArea(page);

		await group.getByRole('button', { name: 'Numbered list' }).click();
		await page.keyboard.type('Read the Charter');
		await expect(writingArea.locator('ol li')).toHaveText('Read the Charter');
		/*
			A triple click selects the whole item. ProseMirror handles it itself;
			Chrome sometimes drops a Shift+Home pressed a moment after typing.
		*/
		await writingArea.locator('ol li').click({ clickCount: 3 });

		// Ctrl+K opens the same box as the Link button.
		await page.keyboard.press('ControlOrMeta+k');
		const address = group.getByLabel('Link address');
		await expect(address).toBeFocused();
		await address.fill('javascript:alert(1)');
		await address.press('Enter');
		await expect(address).toHaveAttribute('aria-invalid', 'true');

		await address.fill('www.un.org');
		await address.press('Enter');

		await expect(writingArea.locator('ol li a')).toHaveAttribute('href', 'https://www.un.org');
		expect(await markdownOf(page)).toBe('1. [Read the Charter](https://www.un.org)');
	});

	test('the Markdown switch goes there and back without losing anything', async ({ page }) => {
		const { group, writingArea } = await emptyWritingArea(page);
		const switchButton = group.getByRole('button', { name: 'Markdown', exact: true });
		const box = group.locator('textarea[name="sampleMarkdown"]');

		await page.keyboard.type('Plain words');
		await switchButton.click();
		await expect(switchButton).toHaveAttribute('aria-pressed', 'true');
		await expect(writingArea).toBeHidden();
		await expect(box).toHaveValue('Plain words');

		await box.fill('## Agenda\n\nSome ++underlined++ and *italic* words');
		await switchButton.click();

		await expect(box).toBeHidden();
		await expect(writingArea.locator('h2')).toHaveText('Agenda');
		await expect(writingArea.locator('u')).toHaveText('underlined');
		await expect(writingArea.locator('em')).toHaveText('italic');
		expect(await markdownOf(page)).toBe('## Agenda\n\nSome ++underlined++ and *italic* words');
	});
});
