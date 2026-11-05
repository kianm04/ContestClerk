import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import PaperScreenControl from './PaperScreenControl.svelte';

/** The form a button posts, and so the action it runs. */
function actionOf(name: string): string | null {
	return screen.getByRole('button', { name }).closest('form')?.getAttribute('action') ?? null;
}

describe('PaperScreenControl', () => {
	it('offers "Show on screen" while the paper is off it', () => {
		render(PaperScreenControl, { screen: { isOnScreen: false, step: null } });

		expect(actionOf('Show on screen')).toBe('?/showOnScreen');
		expect(screen.queryByRole('button', { name: 'Next clause' })).toBeNull();
	});

	it('steps through the clauses while it is on, saying where the projector stands', () => {
		render(PaperScreenControl, {
			screen: {
				isOnScreen: true,
				step: { position: 'Operative clause 1 of 6', hasPrevious: true, hasNext: true }
			}
		});

		expect(screen.getByText('On screen · Operative clause 1 of 6')).toBeTruthy();
		expect(actionOf('Previous clause')).toBe('?/previousClause');
		expect(actionOf('Next clause')).toBe('?/nextClause');
		expect(actionOf('Take off screen')).toBe('?/takeOffScreen');
	});

	it('cannot step past either end', () => {
		render(PaperScreenControl, {
			screen: {
				isOnScreen: true,
				step: { position: 'Preambulatory clauses', hasPrevious: false, hasNext: true }
			}
		});

		expect(screen.getByRole('button', { name: 'Previous clause' }).hasAttribute('disabled')).toBe(
			true
		);
		expect(screen.getByRole('button', { name: 'Next clause' }).hasAttribute('disabled')).toBe(
			false
		);
	});

	it('only takes a paper shown whole off the screen', () => {
		render(PaperScreenControl, { screen: { isOnScreen: true, step: null } });

		expect(screen.getByText('On screen')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Previous clause' })).toBeNull();
		expect(actionOf('Take off screen')).toBe('?/takeOffScreen');
	});
});
