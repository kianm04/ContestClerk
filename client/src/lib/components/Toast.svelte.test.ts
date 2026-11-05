import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Toast from './Toast.svelte';

describe('Toast', () => {
	it('says what just happened', () => {
		render(Toast, { props: { message: 'Application submitted.', tone: 'success' } });

		expect(screen.getByText('Application submitted.')).toBeTruthy();
	});

	it('interrupts a screen reader for a failure and not for anything else', () => {
		const error = render(Toast, { props: { message: 'That did not work.', tone: 'error' } });

		expect(error.getByRole('alert')).toBeTruthy();
		error.unmount();

		const success = render(Toast, { props: { message: 'Saved.', tone: 'success' } });

		expect(success.getByRole('status')).toBeTruthy();
	});

	it('uses the colours of the tone it is given', () => {
		render(Toast, { props: { message: 'Saved.', tone: 'success' } });

		expect(screen.getByRole('status').className).toContain('bg-success-700');
	});

	it('draws Undo as a small form posting to the undo action with each motion', () => {
		const { container } = render(Toast, {
			props: {
				message: '2 other motions dropped',
				tone: 'info',
				undo: {
					label: 'Undo',
					action: '/conferences/mun/committees/unsc/chair/motions?/restore',
					motionIds: ['motion-1', 'motion-2']
				}
			}
		});

		const undo = screen.getByRole('button', { name: 'Undo' });
		const form = undo.closest('form');
		expect(form?.getAttribute('action')).toBe(
			'/conferences/mun/committees/unsc/chair/motions?/restore'
		);
		const ids = Array.from(container.querySelectorAll('input[name="motionId"]')).map((input) =>
			input.getAttribute('value')
		);
		expect(ids).toEqual(['motion-1', 'motion-2']);
	});

	it('posts Undo to the normalised path, and draws no Undo for an address off this site', () => {
		const onSite = render(Toast, {
			props: {
				message: '2 other motions dropped',
				tone: 'info',
				undo: {
					label: 'Undo',
					action: '/conferences/mun/../mun/committees/unsc/chair/motions?/restore',
					motionIds: ['motion-1']
				}
			}
		});

		const form = onSite.getByRole('button', { name: 'Undo' }).closest('form');
		expect(form?.getAttribute('action')).toBe(
			'/conferences/mun/committees/unsc/chair/motions?/restore'
		);
		onSite.unmount();

		// Still on this site to `new URL`, but `//evil.example` once tidied up,
		// which a browser posts to another website (security review M13).
		render(Toast, {
			props: {
				message: '2 other motions dropped',
				tone: 'info',
				undo: { label: 'Undo', action: '/a/..//evil.example?/restore', motionIds: ['motion-1'] }
			}
		});

		expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
	});

	it('has no Undo when there is nothing to take back', () => {
		render(Toast, { props: { message: 'Saved.', tone: 'success' } });

		expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
	});

	it('sits bottom right on a page, and in the middle above the mode bar on the chair console', () => {
		const onPage = render(Toast, { props: { message: 'Saved.', tone: 'success' } });
		const pagePlace = onPage.getByRole('status').parentElement?.className ?? '';

		expect(pagePlace).toContain('bottom-4');
		expect(pagePlace).toContain('md:justify-end');
		onPage.unmount();

		const onConsole = render(Toast, {
			props: { message: 'Agenda set: Climate.', tone: 'success', isAboveModeBar: true }
		});
		const consolePlace = onConsole.getByRole('status').parentElement?.className ?? '';

		expect(consolePlace).toContain('bottom-20');
		expect(consolePlace).toContain('justify-center');
		expect(consolePlace).not.toContain('md:justify-end');
	});
});
