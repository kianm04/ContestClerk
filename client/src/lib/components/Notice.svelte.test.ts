import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Notice from './Notice.svelte';

const children = createRawSnippet(() => ({
	render: () => '<span>Only your team can see this page.</span>'
}));

describe('Notice', () => {
	it('shows what it was given to say', () => {
		render(Notice, { props: { tone: 'info', children } });

		expect(screen.getByText('Only your team can see this page.')).toBeTruthy();
	});

	it('shows a title above it when there is one', () => {
		render(Notice, { props: { tone: 'warning', title: 'Draft preview', children } });

		expect(screen.getByText('Draft preview')).toBeTruthy();
	});

	it('interrupts a screen reader for an error and not for anything else', () => {
		const error = render(Notice, { props: { tone: 'error', children } });

		expect(error.getByRole('alert')).toBeTruthy();
		error.unmount();

		const success = render(Notice, { props: { tone: 'success', children } });

		expect(success.getByRole('status')).toBeTruthy();
	});

	it('uses the colours of the tone it is given', () => {
		render(Notice, { props: { tone: 'success', children } });

		expect(screen.getByRole('status').className).toContain('bg-success-100');
	});
});
