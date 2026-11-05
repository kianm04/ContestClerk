import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import type { KeyView } from '$lib/console-keys';
import ShortcutKeys from './ShortcutKeys.svelte';

// `goto` opens an address in the running app; here it stands in for the
// Motions page arriving, which each test that uses it draws itself.
const goto = vi.hoisted(() => vi.fn());
vi.mock('$app/navigation', () => ({ goto }));

/**
 * A page shaped like the console: the frame's buttons around the view's
 * `<main id="main">`. Each button counts its clicks in `clicks`, by its name.
 */
function drawConsole(viewHtml: string, frameHtml = '') {
	const page = document.createElement('div');
	page.innerHTML = `${frameHtml}<main id="main">${viewHtml}</main>`;
	document.body.append(page);

	const clicks: string[] = [];
	page.addEventListener('click', (event) => {
		const target = event.target as HTMLElement;
		clicks.push(target.dataset.name ?? target.textContent ?? '');
	});

	return { page, clicks };
}

/** The listener, with the shortcuts on, on the GSL view, unless told otherwise. */
function listen(
	changes: Partial<{ isEnabled: boolean; view: KeyView; isRollCallVoteOpen: boolean }> = {}
) {
	const onShowKeyList = vi.fn();
	render(ShortcutKeys, {
		props: {
			isEnabled: true,
			view: 'gsl',
			isRollCallVoteOpen: false,
			onShowKeyList,
			...changes
		}
	});

	return { onShowKeyList };
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('ShortcutKeys', () => {
	it('presses the button that declares the key', async () => {
		const { clicks } = drawConsole('<button aria-keyshortcuts="N">Next: Brazil</button>');
		listen();

		await fireEvent.keyDown(document.body, { key: 'n' });

		expect(clicks).toEqual(['Next: Brazil']);
	});

	it('looks in the view before the frame, so the view’s button wins', async () => {
		const { clicks } = drawConsole(
			'<button aria-keyshortcuts="N">Next on the floor</button>',
			'<button aria-keyshortcuts="N">Next in the strip</button>'
		);
		listen();

		await fireEvent.keyDown(document.body, { key: 'N' });

		expect(clicks).toEqual(['Next on the floor']);
	});

	it('falls back to the frame when the view declares nothing', async () => {
		const { clicks } = drawConsole(
			'<p>Motions</p>',
			'<a href="#" aria-keyshortcuts="2 M">Motions tab</a>'
		);
		listen({ view: 'motions' });

		await fireEvent.keyDown(document.body, { key: '2' });

		expect(clicks).toEqual(['Motions tab']);
	});

	it('puts the cursor in "Raised by" with M on Motions', async () => {
		drawConsole('<input aria-keyshortcuts="M" aria-label="Raised by" />');
		listen({ view: 'motions' });

		await fireEvent.keyDown(document.body, { key: 'm' });

		expect(document.activeElement?.getAttribute('aria-label')).toBe('Raised by');
		expect(goto).not.toHaveBeenCalled();
	});

	it('opens Motions with M from another view, then puts the cursor in "Raised by"', async () => {
		const { page } = drawConsole(
			'<p>The GSL</p>',
			'<a href="/chair/motions" aria-keyshortcuts="2 M">Motions tab</a>'
		);
		// Motions arrives in place of the GSL once `goto` has opened it.
		goto.mockImplementationOnce(async () => {
			const main = page.querySelector('main');
			if (main) main.innerHTML = '<input aria-keyshortcuts="M" aria-label="Raised by" />';
		});
		listen();

		await fireEvent.keyDown(document.body, { key: 'm' });
		await Promise.resolve();

		expect(goto).toHaveBeenCalledWith(`${window.location.origin}/chair/motions`);
		expect(document.activeElement?.getAttribute('aria-label')).toBe('Raised by');
	});

	it('skips a disabled button', async () => {
		const { clicks } = drawConsole(
			'<button disabled aria-keyshortcuts="N">Next</button>',
			'<button aria-keyshortcuts="N">Next in the strip</button>'
		);
		listen();

		await fireEvent.keyDown(document.body, { key: 'n' });

		expect(clicks).toEqual(['Next in the strip']);
	});

	it('does nothing while the cursor is in a text field, except Escape', async () => {
		const { page, clicks } = drawConsole(
			'<input type="text" aria-label="Topic" /><button aria-keyshortcuts="N">Next</button>',
			'<a href="#" aria-keyshortcuts="Escape">Keep going</a>'
		);
		listen();
		const field = page.querySelector('input') as HTMLInputElement;
		field.focus();

		await fireEvent.keyDown(field, { key: 'n' });
		expect(clicks).toEqual([]);

		await fireEvent.keyDown(field, { key: 'Escape' });
		expect(clicks).toEqual(['Keep going']);
	});

	it('ignores a key held with Ctrl, Cmd or Alt, and a held key repeating', async () => {
		const { clicks } = drawConsole('<button aria-keyshortcuts="Space">Pause</button>');
		listen();

		await fireEvent.keyDown(document.body, { key: 'n', ctrlKey: true });
		await fireEvent.keyDown(document.body, { key: ' ', repeat: true });

		expect(clicks).toEqual([]);
	});

	it('keeps only Space and Escape with the shortcuts switched off', async () => {
		const { clicks } = drawConsole(
			'<button aria-keyshortcuts="Space">Pause</button><button aria-keyshortcuts="N">Next</button>'
		);
		listen({ isEnabled: false });

		await fireEvent.keyDown(document.body, { key: 'n' });
		await fireEvent.keyDown(document.body, { key: ' ' });

		expect(clicks).toEqual(['Pause']);
	});

	it('leaves Space to a focused button', async () => {
		const { page, clicks } = drawConsole(
			'<button aria-keyshortcuts="Space">Pause</button><button>Yield</button>'
		);
		listen();
		const yieldButton = page.querySelectorAll('button')[1];
		yieldButton.focus();

		await fireEvent.keyDown(yieldButton, { key: ' ' });

		expect(clicks).toEqual([]);
	});

	it('puts the cursor in the add box with "/" rather than clicking it', async () => {
		const { page } = drawConsole('<input type="text" aria-keyshortcuts="/" aria-label="Add" />');
		listen();

		await fireEvent.keyDown(document.body, { key: '/' });

		expect(document.activeElement).toBe(page.querySelector('input'));
	});

	it('asks for the list of keys with "?"', async () => {
		drawConsole('<p>GSL</p>');
		const { onShowKeyList } = listen();

		await fireEvent.keyDown(document.body, { key: '?' });

		expect(onShowKeyList).toHaveBeenCalledOnce();
	});

	it('answers a roll call vote only inside the view, never with the frame’s Next', async () => {
		const { clicks } = drawConsole(
			'<p>Roll call vote</p>',
			'<button aria-keyshortcuts="N">Next</button>'
		);
		listen({ view: 'voting', isRollCallVoteOpen: true });

		await fireEvent.keyDown(document.body, { key: 'n' });

		expect(clicks).toEqual([]);
	});

	it('leaves a key another handler already took alone', async () => {
		const { page, clicks } = drawConsole('<button aria-keyshortcuts="N">Next</button>');
		listen();
		page.addEventListener('keydown', (event) => event.preventDefault());

		await fireEvent.keyDown(page, { key: 'n' });

		expect(clicks).toEqual([]);
	});
});
