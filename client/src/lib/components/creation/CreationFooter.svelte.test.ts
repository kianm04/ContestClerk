import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createStepUrl, manageUrl } from '$lib/urls';
import CreationFooter from './CreationFooter.svelte';

const now = '2026-10-04T12:00:00.000Z';

describe('CreationFooter', () => {
	it('says the draft is saved and when', () => {
		render(CreationFooter, {
			props: {
				status: 'saved',
				savedAt: '2026-10-04T11:58:00.000Z',
				now,
				primaryLabel: 'Continue to setup'
			}
		});

		expect(screen.getByText('Draft saved')).toBeTruthy();
		expect(screen.getByText('2 minutes ago')).toBeTruthy();
	});

	it('says when a save failed, and nothing at all before there is a draft', () => {
		const { unmount } = render(CreationFooter, {
			props: { status: 'failed', savedAt: null, now, primaryLabel: 'Continue' }
		});
		expect(screen.getByText('Could not save').className).toContain('text-creation-red');
		unmount();

		render(CreationFooter, {
			props: { status: 'none', savedAt: null, now, primaryLabel: 'Continue' }
		});
		expect(screen.queryByText('Draft saved')).toBeNull();
	});

	it('sends the named form with the primary button and links back and out', () => {
		render(CreationFooter, {
			props: {
				status: 'saved',
				savedAt: null,
				now,
				primaryLabel: 'Continue to when & where',
				primaryForm: 'creation-step-form',
				backHref: createStepUrl('delft', 'basics'),
				exitHref: manageUrl()
			}
		});

		const primary = screen.getByRole('button', { name: 'Continue to when & where' });
		expect(primary.getAttribute('form')).toBe('creation-step-form');
		expect(primary.getAttribute('type')).toBe('submit');
		expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe(
			'/create/delft/basics'
		);
		expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe('/manage');
	});

	it('cannot be pressed until there is something to continue with', () => {
		render(CreationFooter, {
			props: {
				status: 'none',
				savedAt: null,
				now,
				primaryLabel: 'Continue to basics',
				isPrimaryDisabled: true
			}
		});

		expect(
			screen.getByRole('button', { name: 'Continue to basics' }).hasAttribute('disabled')
		).toBe(true);
	});
});
