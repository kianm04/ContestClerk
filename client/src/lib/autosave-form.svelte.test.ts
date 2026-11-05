import type { ActionResult } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutosaveForm } from './autosave-form.svelte';

// SvelteKit's `deserialize` only works inside a running app. The stand-in
// fetch below answers in plain JSON, so reading it back is `JSON.parse`.
vi.mock('$app/forms', () => ({ deserialize: (text: string) => JSON.parse(text) }));

const fetchMock = vi.fn();

function answerWith(result: ActionResult) {
	fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(result)));
}

/** A form with one field, and the change event the page would see on it. */
function typeInto(form: HTMLFormElement, value: string): Event {
	(form.elements.namedItem('name') as HTMLInputElement).value = value;
	const event = new Event('input', { bubbles: true });
	Object.defineProperty(event, 'currentTarget', { value: form });
	return event;
}

function makeForm(): HTMLFormElement {
	const form = document.createElement('form');
	form.innerHTML = '<input name="name" />';
	return form;
}

beforeEach(() => {
	vi.useFakeTimers();
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('createAutosaveForm', () => {
	it('waits for a pause in typing, then posts the whole form once', async () => {
		answerWith({ type: 'success', status: 200, data: { saved: true } });
		const onSaved = vi.fn();
		const autosave = createAutosaveForm({ action: '?/save', initialSavedAt: null, onSaved });
		const form = makeForm();

		autosave.handleChange(typeInto(form, 'Del'));
		await vi.advanceTimersByTimeAsync(400);
		autosave.handleChange(typeInto(form, 'Delft MUN'));
		expect(autosave.status).toBe('unsaved');

		await vi.advanceTimersByTimeAsync(800);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toContain('?/save');
		expect(init.headers).toMatchObject({ 'x-sveltekit-action': 'true' });
		expect((init.body as FormData).get('name')).toBe('Delft MUN');
		expect(autosave.status).toBe('saved');
		expect(autosave.savedAt).not.toBeNull();
		expect(onSaved).toHaveBeenCalledWith({ saved: true });
	});

	it('starts from the stored moment', () => {
		const autosave = createAutosaveForm({
			action: '?/save',
			initialSavedAt: '2026-10-04T10:00:00Z'
		});

		expect(autosave.status).toBe('saved');
		expect(autosave.savedAt).toBe('2026-10-04T10:00:00Z');
	});

	it('says it could not save when the action fails or the network does', async () => {
		answerWith({ type: 'failure', status: 400, data: {} });
		const autosave = createAutosaveForm({ action: '?/save', initialSavedAt: null, delayMs: 10 });
		const form = makeForm();

		autosave.handleChange(typeInto(form, 'x'));
		await vi.advanceTimersByTimeAsync(10);
		expect(autosave.status).toBe('failed');

		fetchMock.mockRejectedValueOnce(new Error('offline'));
		autosave.handleChange(typeInto(form, 'y'));
		await vi.advanceTimersByTimeAsync(10);
		expect(autosave.status).toBe('failed');
	});

	it('sends nothing once cancelled', async () => {
		const autosave = createAutosaveForm({ action: '?/save', initialSavedAt: null });

		autosave.handleChange(typeInto(makeForm(), 'x'));
		autosave.cancel();
		await vi.advanceTimersByTimeAsync(2000);

		expect(fetchMock).not.toHaveBeenCalled();
	});
});
