import { flushSync } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import type { ResolvedPathname } from '$app/types';
import ListFooter from './ListFooter.svelte';

const OPEN_LIST = {
	id: 'gsl-1',
	name: "General Speakers' List",
	speakingTimeSeconds: 90,
	isOpen: true
};
const TIME_FIELD =
	'/conferences/thimun-2027/committees/unsc/chair/gsl?time=change' as ResolvedPathname;

/** The footer of `list`, with the field open when the address asks for it. */
function renderFooter(list = OPEN_LIST, isTimeFieldOpen = false) {
	return render(ListFooter, {
		props: { list, isTimeFieldOpen, timeFieldHref: TIME_FIELD, onSubmit: vi.fn() }
	});
}

describe('ListFooter', () => {
	it('reads "1:30 each · Change" and "Close list" on an open list', () => {
		renderFooter();

		expect(screen.getByText('1:30 each')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Change' }).getAttribute('href')).toBe(TIME_FIELD);
		const close = screen.getByRole('button', { name: 'Close list' });
		expect(close.closest('form')?.getAttribute('action')).toBe('?/closeList');
	});

	it('reads "Open list" on a closed list', () => {
		renderFooter({ ...OPEN_LIST, isOpen: false });

		const open = screen.getByRole('button', { name: 'Open list' });
		expect(open.closest('form')?.getAttribute('action')).toBe('?/openList');
	});

	it('opens the speaking time field in place on "Change", holding the time as "1:30"', async () => {
		renderFooter();

		await fireEvent.click(screen.getByRole('link', { name: 'Change' }));

		const field = screen.getByLabelText<HTMLInputElement>('Speaking time');
		expect(field.value).toBe('1:30');
		expect(field.name).toBe('speakingTime');
		expect(field.closest('form')?.getAttribute('action')).toBe('?/setSpeakingTime');
		expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
	});

	it('closes the field on Escape without saving', async () => {
		renderFooter();
		await fireEvent.click(screen.getByRole('link', { name: 'Change' }));

		await fireEvent.keyDown(screen.getByLabelText('Speaking time'), { key: 'Escape' });

		expect(screen.queryByLabelText('Speaking time')).toBeNull();
		expect(screen.getByText('1:30 each')).toBeTruthy();
	});

	it('draws the field at once when the address asks for it, as without JavaScript', () => {
		renderFooter(OPEN_LIST, true);

		expect(screen.getByLabelText('Speaking time')).toBeTruthy();
		expect(screen.queryByRole('link', { name: 'Change' })).toBeNull();
	});
});

describe('ListFooter, when the page reads its data again', () => {
	it('keeps the field the chair opened while a reload brings the same address', async () => {
		// `$state` here stands in for the page's `data`, which a realtime change
		// or a press's answer replaces with a fresh object, `?time=change` or not.
		let data = $state({ list: OPEN_LIST, isTimeFieldOpen: false });
		render(ListFooter, {
			props: {
				get list() {
					return data.list;
				},
				get isTimeFieldOpen() {
					return data.isTimeFieldOpen;
				},
				timeFieldHref: TIME_FIELD,
				onSubmit: vi.fn()
			}
		});
		await fireEvent.click(screen.getByRole('link', { name: 'Change' }));

		data = { list: { ...OPEN_LIST }, isTimeFieldOpen: false };
		flushSync();

		expect(screen.getByLabelText('Speaking time')).toBeTruthy();
	});
});
