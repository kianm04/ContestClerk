import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import FileField from './FileField.svelte';

const baseProps = {
	label: 'Position paper',
	name: 'paper',
	accept: 'application/pdf,.docx',
	maxSizeMb: 5
};

describe('FileField', () => {
	it('labels the picker and offers only the file types it accepts', () => {
		render(FileField, { props: baseProps });

		const input = screen.getByLabelText('Position paper');
		expect(input.getAttribute('type')).toBe('file');
		expect(input.getAttribute('accept')).toBe('application/pdf,.docx');
	});

	it('always says how big a file may be', () => {
		render(FileField, { props: baseProps });

		expect(screen.getByText(/Up to 5 MB\./)).toBeTruthy();
	});

	it('names the file already uploaded and offers to replace it', () => {
		render(FileField, { props: { ...baseProps, currentFileName: 'france-climate.pdf' } });

		expect(screen.getByText('Now: france-climate.pdf')).toBeTruthy();
		expect(screen.getByText(/Choose a file to replace it\./)).toBeTruthy();
	});

	it('says nothing about a current file when there is none', () => {
		render(FileField, { props: baseProps });

		expect(screen.queryByText(/Choose a file to replace it\./)).toBeNull();
	});

	it('points a screen reader at the help line and the error', () => {
		render(FileField, { props: { ...baseProps, error: 'That file is too big.' } });

		expect(screen.getByLabelText('Position paper').getAttribute('aria-describedby')).toBe(
			'field-paper-help field-paper-error'
		);
		expect(screen.getByText('That file is too big.')).toBeTruthy();
	});
});
