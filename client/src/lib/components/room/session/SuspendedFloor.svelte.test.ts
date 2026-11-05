import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { CommitteeStateView } from '$lib/chair-room';
import SuspendedFloor from './SuspendedFloor.svelte';

const ROOM = '/conferences/thimun-2027/committees/unsc/chair';

/** Twelve minutes after the room was suspended at 12:00 UTC. */
const NOW = new Date('2026-01-01T12:12:30.000Z');

const STATE: CommitteeStateView = {
	currentSessionId: 'session-1',
	mode: 'suspended',
	currentMotionId: null,
	activeSpeakersListId: 'list-gsl',
	currentSpeakerEntryId: 'entry-china',
	currentVoteId: null,
	agendaTopic: null,
	timer: { totalSeconds: 90, endsAt: null, pausedRemainingSeconds: 52 },
	suspendedAt: '2026-01-01T12:00:00.000Z',
	suspendedUntil: null,
	modeBeforeSuspension: 'formal_debate'
};

/** The suspended screen with no return time set yet. */
const PROPS = {
	title: 'Suspended for lunch',
	suspension: { suspendedAt: '2026-01-01T12:00:00.000Z', suspendedUntil: null },
	resumeSentence: 'When the session resumes: GSL, China with 0:52 left',
	state: STATE,
	timezone: 'UTC',
	clockOffsetSampleMs: 0,
	endHref: `${ROOM}?end=confirm`
};

/** The screen's filled controls: they carry the dark blue. */
function filledControls(): Element[] {
	return [...document.querySelectorAll('a.bg-primary, button.bg-primary')];
}

beforeEach(() => {
	vi.useFakeTimers({ now: NOW });
});

afterEach(() => {
	vi.useRealTimers();
});

describe('SuspendedFloor', () => {
	it('is headed by the title, with the reason, which can take the focus', () => {
		render(SuspendedFloor, { props: PROPS });

		const heading = screen.getByRole('heading', { level: 1, name: 'Suspended for lunch' });

		expect(heading.id).toBe('suspended-heading');
		expect(heading.getAttribute('tabindex')).toBe('-1');
	});

	it('counts up "12 min so far" until a return time is set, and offers to set one', () => {
		render(SuspendedFloor, { props: PROPS });

		expect(screen.getByText('12 min so far')).toBeTruthy();
		expect(screen.getByText('Set a return time')).toBeTruthy();
	});

	it('counts down to the return time once one is set, and offers to change it', () => {
		const suspension = { ...PROPS.suspension, suspendedUntil: '2026-01-01T12:54:00.000Z' };
		render(SuspendedFloor, { props: { ...PROPS, suspension } });

		expect(screen.getByText('Back at 12:54 · in 42 min')).toBeTruthy();
		expect(screen.getByText('Change the return time')).toBeTruthy();
		expect(screen.getByLabelText<HTMLInputElement>('Back at').value).toBe('12:54');
	});

	it('offers 10, 15, 30 and 60 minutes and a time field, each posting the return time', () => {
		render(SuspendedFloor, { props: PROPS });

		for (const minutes of [10, 15, 30, 60]) {
			const button = screen.getByRole('button', { name: `${minutes} min` });

			expect(button.getAttribute('name')).toBe('minutes');
			expect(button.getAttribute('value')).toBe(String(minutes));
			expect(button.closest('form')?.getAttribute('action')).toBe('?/setReturnTime');
		}

		const field = screen.getByLabelText('Back at');
		const set = screen.getByRole('button', { name: 'Set' });

		expect(field.getAttribute('type')).toBe('time');
		// "Set" is the only button of the field's own form, so Enter in the field presses it.
		expect(set.closest('form')).toBe(field.closest('form'));
		expect(set.closest('form')?.querySelectorAll('button')).toHaveLength(1);
	});

	it('says what "Resume session" brings back, the one filled button', () => {
		render(SuspendedFloor, { props: PROPS });

		const resume = screen.getByRole('button', { name: 'Resume session' });

		expect(screen.getByText(PROPS.resumeSentence)).toBeTruthy();
		expect(resume.closest('form')?.getAttribute('action')).toBe('?/resume');
		expect(filledControls()).toEqual([resume]);
	});

	it('keeps "End session" here for a phone, whose mode bar has no End', () => {
		render(SuspendedFloor, { props: PROPS });

		const end = screen.getByRole('link', { name: 'End session' });

		expect(end.getAttribute('href')).toBe(`${ROOM}?end=confirm`);
		expect(end.className).toContain('md:hidden');
	});
});
