import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import type { AttendanceStatus, RoomSeat } from '$lib/committee-room';
import RollCallList from './RollCallList.svelte';

const SEATS: RoomSeat[] = [
	{ id: 'seat-br', name: 'Brazil', countryCode: 'BR', delegateName: 'Gabriel Santos' },
	{ id: 'seat-cn', name: 'China', countryCode: 'CN', delegateName: null },
	{ id: 'seat-fr', name: 'France', countryCode: 'FR', delegateName: 'Camille Dubois' }
];

const MARKS: Record<string, AttendanceStatus> = {
	'seat-br': 'present',
	'seat-cn': 'absent',
	'seat-fr': 'absent'
};

/** Draw the list, with a stand-in for the instant form that sends nothing. */
function renderList(markedSeatId: string | null = null) {
	// The form's submit is stopped, so a press only shows what the list does.
	const onSubmit = vi.fn(({ cancel }: { cancel: () => void }) => cancel());

	render(RollCallList, {
		props: { seats: SEATS, marks: MARKS, rollCallId: 'roll-1', from: 'gsl', markedSeatId, onSubmit }
	});
}

/** A seat's row. */
function row(seatName: string): HTMLElement {
	const form = screen.getByRole('form', { name: `Attendance of ${seatName}` });

	return form.closest('li') as HTMLElement;
}

/** The answer button of a seat. */
function answer(seatName: string, label: string): HTMLElement {
	return within(row(seatName)).getByRole('button', { name: label });
}

describe('RollCallList', () => {
	it('draws each seat with its delegate and its three answers, the chosen one pressed', () => {
		renderList();

		expect(within(row('Brazil')).getByText('Gabriel Santos')).toBeTruthy();
		expect(within(row('China')).getByText('No delegate')).toBeTruthy();
		expect(answer('Brazil', 'Present').getAttribute('aria-pressed')).toBe('true');
		expect(answer('Brazil', 'Absent').getAttribute('aria-pressed')).toBe('false');
		expect(answer('China', 'Absent').getAttribute('aria-pressed')).toBe('true');
	});

	it('sends the roll call, the seat and the page the view was opened from', () => {
		renderList();

		const form = screen.getByRole('form', { name: 'Attendance of France' });
		const fields = Object.fromEntries(new FormData(form as HTMLFormElement));

		expect(form.getAttribute('action')).toBe('?/setStatus');
		expect(fields).toEqual({ rollCallId: 'roll-1', from: 'gsl', seatId: 'seat-fr' });
	});

	it('starts the focus marker on the row the address names, or the first', () => {
		renderList('seat-cn');

		expect(row('China').className).toContain('bg-brand-50');
		expect(row('Brazil').className).not.toContain('bg-brand-50');
		expect(answer('China', 'Absent').hasAttribute('autofocus')).toBe(true);
	});

	it('moves the marker and the focus with the arrow keys', async () => {
		renderList();
		answer('Brazil', 'Present').focus();

		await fireEvent.keyDown(answer('Brazil', 'Present'), { key: 'ArrowDown' });

		expect(document.activeElement).toBe(answer('China', 'Absent'));
		expect(row('China').className).toContain('bg-brand-50');

		await fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowUp' });

		expect(document.activeElement).toBe(answer('Brazil', 'Present'));
	});

	it('answers the marked seat with A, P or V and moves on to the next', async () => {
		renderList();
		const submitted: string[] = [];
		document.addEventListener('submit', (event) => {
			const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
			submitted.push(submitter?.value ?? '');
		});
		answer('China', 'Absent').focus();

		await fireEvent.keyDown(answer('China', 'Absent'), { key: 'v' });

		expect(submitted).toEqual(['present_and_voting']);
		expect(document.activeElement).toBe(answer('France', 'Absent'));
	});

	it('focuses the button a mouse clicks, which Safari does not do by itself', async () => {
		renderList();

		// `detail: 1` is one mouse click; a click from code or a key has 0.
		await fireEvent.click(answer('China', 'Present'), { detail: 1 });

		expect(document.activeElement).toBe(answer('China', 'Present'));
		expect(row('China').className).toContain('bg-brand-50');
	});

	it("moves on to the next seat when the console presses the marked row's answer", async () => {
		renderList();
		(document.activeElement as HTMLElement | null)?.blur();

		await fireEvent.click(answer('Brazil', 'Absent'));

		expect(document.activeElement).toBe(answer('China', 'Absent'));
		expect(row('China').className).toContain('bg-brand-50');
	});

	it("declares A, P and V on the marked row's answers only, for the console's keys", () => {
		renderList('seat-cn');

		expect(answer('China', 'Absent').getAttribute('aria-keyshortcuts')).toBe('A');
		expect(answer('China', 'Present').getAttribute('aria-keyshortcuts')).toBe('P');
		expect(answer('China', 'Present and voting').getAttribute('aria-keyshortcuts')).toBe('V');
		expect(answer('Brazil', 'Present').hasAttribute('aria-keyshortcuts')).toBe(false);
	});

	it('keeps the marker on the last seat after its answer', async () => {
		renderList();
		answer('France', 'Absent').focus();

		await fireEvent.keyDown(answer('France', 'Absent'), { key: 'p' });

		expect(row('France').contains(document.activeElement)).toBe(true);
	});

	it('leaves a key held with Ctrl, Cmd or Alt to the browser', async () => {
		renderList();
		answer('Brazil', 'Present').focus();

		await fireEvent.keyDown(answer('Brazil', 'Present'), { key: 'ArrowDown', ctrlKey: true });

		expect(document.activeElement).toBe(answer('Brazil', 'Present'));
	});
});
