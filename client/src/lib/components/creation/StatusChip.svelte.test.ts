import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import StatusChip, { tone } from './StatusChip.svelte';

describe('tone', () => {
	it('words each status and colours it by what it means', () => {
		expect(tone('ready')).toMatchObject({ label: 'Ready', textClass: 'text-success' });
		expect(tone('review').textClass).toBe('text-warning');
		expect(tone('not_imported')).toMatchObject({
			label: 'Not yet imported',
			textClass: 'text-link'
		});
		expect(tone('not_decided').chipClass).toContain('bg-creation-amber-tint');
		expect(tone('blocked')).toMatchObject({ label: 'Needed', textClass: 'text-destructive' });
	});
});

describe('StatusChip', () => {
	it('draws the status as a word', () => {
		render(StatusChip, { props: { status: 'needs_dates' } });

		expect(screen.getByText('Dates needed')).toBeTruthy();
	});

	it('takes other words when given them', () => {
		render(StatusChip, { props: { status: 'ready', label: 'Published' } });

		expect(screen.getByText('Published')).toBeTruthy();
	});
});
