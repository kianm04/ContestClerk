import { expect, type Locator, type Page } from '@playwright/test';

// The live paper editor as a browser test drives it: a position paper
// (`delegation-papers.spec.ts`) and a paper written in committee
// (`committee-papers.spec.ts`) are written in the same one. Until the page's
// script runs it is a plain text box; then Tiptap's editor takes its place,
// with the formatting toolbar above it.

/** How long the page may take to read the paper and start the editor. */
const EDITOR_TIMEOUT_MS = 15_000;

/** Wait for the editor, which replaces the plain box once the page's script runs. */
export async function waitForEditor(page: Page): Promise<void> {
	await expect(page.getByRole('toolbar', { name: 'Formatting' })).toBeVisible({
		timeout: EDITOR_TIMEOUT_MS
	});
}

/** Replace everything in the editor with `text`. */
export async function typeIntoEditor(box: Locator, text: string): Promise<void> {
	await box.click();
	await box.page().keyboard.press('ControlOrMeta+A');
	await box.page().keyboard.type(text);
}

/** Put the cursor at the start or the end of the editor's first paragraph. */
export async function placeCursor(box: Locator, where: 'start' | 'end'): Promise<void> {
	await box.click();
	/*
		The keys for "start of the text" differ between systems, so the browser's
		selection is set directly; the editor follows it as it would a click.
		The browser tells the editor a little later, so on a busy machine the
		typing could arrive first: `selectionchange` is sent at once instead.
	*/
	await box.evaluate((editor, isStart) => {
		const range = document.createRange();
		range.selectNodeContents(editor.querySelector('p') ?? editor);
		range.collapse(isStart);
		window.getSelection()?.removeAllRanges();
		window.getSelection()?.addRange(range);
		document.dispatchEvent(new Event('selectionchange'));
	}, where === 'start');
}

/** The editor's text without the others' cursors, whose name labels sit inside it. */
export async function editorText(box: Locator): Promise<string | null> {
	return box.evaluate((editor) => {
		const copy = editor.cloneNode(true) as HTMLElement;
		copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());

		return copy.textContent;
	});
}

/** Select the first place `words` appear in the editor, as a reader dragging over them would. */
export async function selectWords(box: Locator, words: string): Promise<void> {
	await box.click();
	await box.evaluate((editor, wanted) => {
		const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
			const start = node.textContent?.indexOf(wanted) ?? -1;
			if (start === -1) continue;

			const range = document.createRange();
			range.setStart(node, start);
			range.setEnd(node, start + wanted.length);
			window.getSelection()?.removeAllRanges();
			window.getSelection()?.addRange(range);
			// Told at once, as `placeCursor` tells it.
			document.dispatchEvent(new Event('selectionchange'));
			return;
		}
		throw new Error(`“${wanted}” is not in the editor`);
	}, words);
}
