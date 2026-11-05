import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { UNEXPECTED_ERROR_TEXT } from '$lib/auth';
import ErrorPage from './+error.svelte';

/**
 * What `page` from `$app/state` holds while the error page is shown. The mock
 * below hands the component this object, so each test can say which error
 * SvelteKit is showing before it renders. `vi.hoisted` creates it before the
 * mock, which Vitest moves to the very top of the file.
 */
const shownError = vi.hoisted(() => {
	const initial: { status: number; error: { message: string } | null } = {
		status: 500,
		error: null
	};

	return initial;
});

vi.mock('$app/state', () => ({ page: shownError }));

describe('+error.svelte', () => {
	beforeEach(() => {
		shownError.status = 500;
		shownError.error = null;
	});

	it('shows the sentence handleError chose for an error nobody planned for', () => {
		shownError.error = { message: UNEXPECTED_ERROR_TEXT };

		render(ErrorPage);

		expect(screen.getByRole('heading', { level: 1, name: UNEXPECTED_ERROR_TEXT })).toBeTruthy();
		expect(screen.getByText('Error 500')).toBeTruthy();
		expect(document.title).toBe('Error 500 · MUNMeet');
	});

	it('shows the words a page gave its own 404, and a way back', () => {
		shownError.status = 404;
		shownError.error = { message: 'This committee does not exist.' };

		render(ErrorPage);

		expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
			'This committee does not exist.'
		);
		expect(screen.getByText('Error 404')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Go to the home page' })).toBeTruthy();
	});
});
