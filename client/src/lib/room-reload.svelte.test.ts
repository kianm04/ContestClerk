import { afterEach, describe, expect, it, vi } from 'vitest';

// SvelteKit's browser modules only work inside a running app, so these stand
// in for them: `invalidate` is watched, and the navigation and the instant
// forms say what each test needs.
const invalidate = vi.hoisted(() => vi.fn());
const navigating = vi.hoisted(() => ({ type: null as string | null }));
const forms = vi.hoisted(() => ({ isSending: false, answered: Promise.resolve() }));

vi.mock('$app/navigation', () => ({ invalidate }));
vi.mock('$app/state', () => ({ navigating }));
vi.mock('$lib/instant-form.svelte', () => ({
	isAnyInstantFormSending: () => forms.isSending,
	whenInstantFormsAnswered: () => forms.answered
}));

import { createRoomReload } from './room-reload.svelte';

/** The reload, made inside `$effect.root`, which lets its `$effect` start outside a component. */
function makeReload() {
	let reload: ReturnType<typeof createRoomReload> | undefined;
	const stop = $effect.root(() => {
		reload = createRoomReload(() => 'committee-room:committee-1');
	});

	if (reload === undefined) throw new Error('The reload was not made.');

	return { reload, stop };
}

afterEach(() => {
	invalidate.mockReset();
	navigating.type = null;
	forms.isSending = false;
	forms.answered = Promise.resolve();
});

describe('createRoomReload', () => {
	it('reads the room again at once when nothing stands in the way', () => {
		const { reload, stop } = makeReload();

		reload.request();

		expect(invalidate).toHaveBeenCalledWith('committee-room:committee-1');
		stop();
	});

	it('waits while a link is being followed, so the click is not swallowed', () => {
		navigating.type = 'link';
		const { reload, stop } = makeReload();

		reload.request();

		expect(invalidate).not.toHaveBeenCalled();
		stop();
	});

	it('waits for the reader’s presses to be answered, then reads the room once', async () => {
		let answer = () => {};
		forms.isSending = true;
		forms.answered = new Promise((resolve) => {
			answer = resolve;
		});
		const { reload, stop } = makeReload();

		reload.request();
		reload.request();
		expect(invalidate).not.toHaveBeenCalled();

		forms.isSending = false;
		answer();
		await forms.answered;
		await Promise.resolve();

		expect(invalidate).toHaveBeenCalledOnce();
		stop();
	});
});
