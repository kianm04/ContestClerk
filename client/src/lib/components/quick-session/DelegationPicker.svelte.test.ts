import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import {
	countryMember,
	emptyDraft,
	memberFromName,
	type DraftChange,
	type QuickSessionDraft
} from '$lib/quick-session';
import DelegationPicker from './DelegationPicker.svelte';

/** A draft holding these members and this search. */
function makeDraft(members: string[], search = ''): QuickSessionDraft {
	return { ...emptyDraft(), search, members: members.map((code) => countryMember(code)) };
}

/**
 * Draw the column inside a real `<form>`, as the pages do, so a button's
 * `form` is there to read the pasted box from. `onChange` is a spy that
 * remembers every change the column hands up.
 */
function renderPicker(draft: QuickSessionDraft) {
	const form = document.createElement('form');
	document.body.append(form);
	const onChange = vi.fn<(change: DraftChange) => void>();

	render(DelegationPicker, { target: form, props: { draft, errors: {}, onChange } });

	return { onChange, form };
}

/** The draft of the last change the column handed up. */
function lastDraft(onChange: ReturnType<typeof renderPicker>['onChange']): QuickSessionDraft {
	const lastCall = onChange.mock.calls.at(-1);

	if (lastCall === undefined) throw new Error('The column handed up no change.');

	return lastCall[0].draft;
}

describe('DelegationPicker', () => {
	it('offers the three ready-made lists and "Paste a list", each posting without JavaScript', () => {
		renderPicker(makeDraft([]));

		const council = screen.getByRole('button', { name: 'Security Council' });

		expect(screen.getByText('Start from')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'UN members' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'EU members' })).toBeTruthy();
		expect(screen.getByText('Paste a list').closest('details')).toBeTruthy();
		expect(council.getAttribute('formaction')).toBe('?/fillFromList');
		expect(council.getAttribute('name')).toBe('list');
		expect(council.getAttribute('value')).toBe('security_council');
	});

	it('fills the committee from a list in the browser, replacing what was there', async () => {
		const { onChange } = renderPicker(makeDraft(['DE']));

		await fireEvent.click(screen.getByRole('button', { name: 'Security Council' }));

		expect(lastDraft(onChange).members).toHaveLength(15);
		expect(lastDraft(onChange).members.map((member) => member.name)).not.toContain('Germany');
	});

	it('lists all 193 member states with "+", and "added" for a chosen one', () => {
		renderPicker(makeDraft(['AR']));

		const addAfghanistan = screen.getByRole('button', { name: 'Add Afghanistan' });

		// Every "+" but Argentina's; "Add these", under "Paste a list", is not one of them.
		expect(screen.getAllByRole('button', { name: /^Add (?!these$)/ })).toHaveLength(192);
		expect(screen.queryByRole('button', { name: 'Add Argentina' })).toBeNull();
		expect(screen.getByText('added')).toBeTruthy();
		expect(addAfghanistan.getAttribute('formaction')).toBe('?/addMember');
		expect(addAfghanistan.getAttribute('value')).toBe('country:AF');
	});

	it('adds a member state with "+" in the browser', async () => {
		const { onChange } = renderPicker(makeDraft([]));

		await fireEvent.click(screen.getByRole('button', { name: 'Add France' }));

		expect(lastDraft(onChange).members).toEqual([countryMember('FR')]);
	});

	it('hands up every keystroke of the search', async () => {
		const { onChange } = renderPicker(makeDraft([]));

		await fireEvent.input(screen.getByLabelText('Search countries'), { target: { value: 'ger' } });

		expect(lastDraft(onChange).search).toBe('ger');
	});

	it('lists only the states a word of whose name starts with the search', () => {
		renderPicker(makeDraft([], 'king'));

		expect(screen.getByRole('button', { name: 'Add United Kingdom' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Add France' })).toBeNull();
	});

	it('offers to add what is typed as a member, saying when no state matches', async () => {
		const { onChange } = renderPicker(makeDraft([], 'Amnesty International'));

		const custom = screen.getByRole('button', { name: 'Add “Amnesty International” as a member' });

		expect(screen.getByText('No member state matches “Amnesty International”.')).toBeTruthy();
		expect(custom.getAttribute('formaction')).toBe('?/addCustom');

		await fireEvent.click(custom);

		expect(lastDraft(onChange).members).toEqual([memberFromName('Amnesty International')]);
		expect(lastDraft(onChange).search).toBe('');
	});

	it('adds a pasted list in the browser and empties the box', async () => {
		const { onChange } = renderPicker(makeDraft([]));
		const box = screen.getByLabelText('One delegation per line');

		await fireEvent.input(box, { target: { value: 'France\nWorld Bank' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add these' }));

		expect(lastDraft(onChange).members.map((member) => member.name)).toEqual([
			'France',
			'World Bank'
		]);
		expect((box as HTMLTextAreaElement).value).toBe('');
	});

	it('hands up the refusal of more than 300 pasted lines', async () => {
		const { onChange } = renderPicker(makeDraft([]));
		const lines = Array.from({ length: 301 }, (_, index) => `Member ${index}`).join('\n');

		await fireEvent.input(screen.getByLabelText('One delegation per line'), {
			target: { value: lines }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Add these' }));

		expect(onChange.mock.calls.at(-1)?.[0].errors).toEqual({
			paste: 'Please add at most 300 delegations at a time.'
		});
	});
});
