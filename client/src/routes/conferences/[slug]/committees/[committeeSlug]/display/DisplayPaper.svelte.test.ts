import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { PaperForScreen } from '$lib/papers-on-floor';
import DisplayPaper from './DisplayPaper.svelte';

const DRAFT = { id: 'paper-1', name: 'Draft resolution 1.1', title: 'Autonomous weapons' };

describe('DisplayPaper', () => {
	it('shows one clause, its number beside it and its sub-clauses lettered', () => {
		const paper: PaperForScreen = {
			...DRAFT,
			position: 'Operative clause 1 of 6',
			page: {
				shows: 'clause',
				number: 1,
				html: '<p><u>Calls upon</u> all States to negotiate, which:</p>',
				subClauses: [
					{
						label: '(a)',
						html: '<p>prohibits;</p>',
						subClauses: [{ label: '(i)', html: '<p>targets;</p>', subClauses: [] }]
					},
					{ label: '(b)', html: '<p>regulates;</p>', subClauses: [] }
				]
			}
		};
		const { container } = render(DisplayPaper, { paper });

		expect(screen.getByText('Draft resolution 1.1 · Operative clause 1 of 6')).toBeTruthy();
		expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe(
			'Autonomous weapons'
		);
		expect(screen.getByText('1')).toBeTruthy();
		expect(container.querySelector('u')?.textContent).toBe('Calls upon');
		expect([...container.querySelectorAll('li > span')].map((label) => label.textContent)).toEqual([
			'(a)',
			'(i)',
			'(b)'
		]);
	});

	it('shows the preambulatory clauses together under the line they hang from', () => {
		const paper: PaperForScreen = {
			...DRAFT,
			position: 'Preambulatory clauses',
			page: {
				shows: 'preamble',
				opening: 'The General Assembly,',
				clauses: [
					'<p><em>Recalling</em> the Convention,</p>',
					'<p><em>Noting</em> the reports,</p>'
				]
			}
		};
		render(DisplayPaper, { paper });

		expect(screen.getByText('Draft resolution 1.1 · Preambulatory clauses')).toBeTruthy();
		expect(screen.getByText('The General Assembly,')).toBeTruthy();
		expect(screen.getByText('Recalling').tagName).toBe('EM');
		expect(screen.getByText('the reports,', { exact: false })).toBeTruthy();
	});

	it('shows a working paper whole, with no clause in the grey line', () => {
		const paper: PaperForScreen = {
			id: 'paper-2',
			name: 'Working paper 1.1',
			title: 'Funding the fund',
			position: null,
			page: { shows: 'text', html: '<p>The fund is paid for by every member.</p>' }
		};
		render(DisplayPaper, { paper });

		expect(screen.getByText('Working paper 1.1')).toBeTruthy();
		expect(screen.getByText('The fund is paid for by every member.')).toBeTruthy();
	});
});
