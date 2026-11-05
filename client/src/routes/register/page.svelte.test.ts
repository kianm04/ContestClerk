import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { RegisterFormResult } from '$lib/auth';
import { loginUrl } from '$lib/urls';
import RegisterPage from './+page.svelte';
import type { PageProps } from './$types';

/*
	The create account page as a component, because the "Almost done" answer
	cannot be reached in a browser test: it only comes back when the project
	sends a confirmation email, and the local one signs a new account straight
	in. The refusal is drawn here as well, beside the browser test in
	`tests/e2e/auth.spec.ts` that makes Supabase refuse for real.
*/

/** Where the visitor was heading, as `?next=` carried it. */
const NEXT = '/conferences/northbridge-applications-open/apply';

/** The page's props after a submit whose answer was `form`. */
function renderAfterSubmit(form: RegisterFormResult) {
	// The page reads only `data.next` and `data.email`, so nothing else of the
	// real `PageData`, which also carries the layout's data, is given.
	const props = { data: { next: NEXT, email: '' }, form, params: {} } as unknown as PageProps;

	return render(RegisterPage, { props });
}

describe('the create account page', () => {
	it('offers to log in instead, keeping `next`, under a refusal', () => {
		renderAfterSubmit({
			fullName: 'Amara Okafor',
			email: 'amara@example.com',
			message: { text: 'We could not create an account with this address.', isSuccess: false },
			offersLogIn: true
		});

		const alert = screen.getByRole('alert');
		const link = screen.getByRole('link', { name: 'Log in instead' });

		expect(alert.textContent).toContain('We could not create an account with this address.');
		expect(alert.contains(link)).toBe(true);
		expect(link.getAttribute('href')).toBe(loginUrl(NEXT));
	});

	it('offers to log in instead, keeping `next`, under "Almost done"', () => {
		renderAfterSubmit({
			fullName: 'Amara Okafor',
			email: 'amara@example.com',
			message: {
				text: 'Almost done. Open the confirmation link we sent to amara@example.com.',
				isSuccess: true
			},
			offersLogIn: true
		});

		const link = screen.getByRole('link', { name: 'Log in instead' });

		expect(screen.getByRole('status').contains(link)).toBe(true);
		expect(link.getAttribute('href')).toBe(loginUrl(NEXT));
	});

	it('does not offer it when the form itself was filled in wrongly', () => {
		renderAfterSubmit({
			fullName: '',
			email: 'amara@example.com',
			message: { text: 'Please enter your name.', isSuccess: false },
			offersLogIn: false
		});

		expect(screen.queryByRole('link', { name: 'Log in instead' })).toBeNull();
	});
});
