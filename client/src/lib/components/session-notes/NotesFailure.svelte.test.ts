import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import NotesFailure from './NotesFailure.svelte';

describe('NotesFailure', () => {
	it('says what went wrong, that nothing is lost, and tries again on request', async () => {
		const onRetry = vi.fn();
		render(NotesFailure, { props: { message: 'Check your connection.', onRetry } });

		expect(screen.getByText('Your notes were not saved')).toBeTruthy();
		expect(screen.getByText(/Check your connection\. Your notes are still here/)).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
		expect(onRetry).toHaveBeenCalledOnce();
	});
});
