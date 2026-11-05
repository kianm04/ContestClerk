import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import DangerZone from './DangerZone.svelte';

const children = createRawSnippet(() => ({ render: () => '<button>Delete committee</button>' }));

describe('DangerZone', () => {
	it('is headed "Danger zone" unless the page says otherwise', () => {
		render(DangerZone, { props: { children } });

		expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Danger zone');
	});

	it('takes a heading of its own', () => {
		render(DangerZone, { props: { title: 'Delete this conference', children } });

		expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Delete this conference');
	});

	it('is a landmark a screen reader can jump to, named after its heading', () => {
		render(DangerZone, { props: { children } });

		expect(screen.getByRole('region', { name: 'Danger zone' })).toBeTruthy();
	});

	it('shows the destructive actions inside it', () => {
		render(DangerZone, { props: { children } });

		expect(screen.getByRole('button', { name: 'Delete committee' })).toBeTruthy();
	});
});
