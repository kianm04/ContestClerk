import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { countryMember, memberFromName, type QuickSessionMember } from '$lib/quick-session';
import CommitteeMembers from './CommitteeMembers.svelte';

const AMNESTY = memberFromName('Amnesty International') as QuickSessionMember;
const MEMBERS = [AMNESTY, countryMember('BR'), countryMember('FR')];

/** Draw the column with these members, its two callbacks spies. */
function renderMembers(members: QuickSessionMember[], error?: string) {
	const onRemove = vi.fn<(value: string) => void>();
	const onClear = vi.fn<() => void>();

	render(CommitteeMembers, { props: { members, error, onRemove, onClear } });

	return { onRemove, onClear };
}

describe('CommitteeMembers', () => {
	it('titles the column with its count and lists every member with its hidden field', () => {
		const { container } = render(CommitteeMembers, {
			props: { members: MEMBERS, onRemove: vi.fn(), onClear: vi.fn() }
		});

		const hiddenValues = [...container.querySelectorAll('input[type="hidden"][name="member"]')].map(
			(input) => input.getAttribute('value')
		);

		expect(screen.getByRole('heading', { level: 2, name: 'Your committee' })).toBeTruthy();
		expect(screen.getByText('3 members')).toBeTruthy();
		expect(hiddenValues).toEqual(['name:Amnesty International', 'country:BR', 'country:FR']);
	});

	it('shows a flag for a country and the initials of any other member', () => {
		const { container } = render(CommitteeMembers, {
			props: { members: MEMBERS, onRemove: vi.fn(), onClear: vi.fn() }
		});

		expect(screen.getByText('AI')).toBeTruthy();
		expect(container.querySelectorAll('img')).toHaveLength(2);
	});

	it('removes one member with "×" in the browser, posting `remove` without JavaScript', async () => {
		const { onRemove } = renderMembers(MEMBERS);
		const remove = screen.getByRole('button', { name: 'Remove Brazil' });

		expect(remove.getAttribute('formaction')).toBe('?/removeMember');
		expect(remove.getAttribute('name')).toBe('remove');
		expect(remove.getAttribute('value')).toBe('country:BR');

		await fireEvent.click(remove);

		expect(onRemove).toHaveBeenCalledWith('country:BR');
	});

	it('removes every member with "Clear all"', async () => {
		const { onClear } = renderMembers(MEMBERS);
		const clear = screen.getByRole('button', { name: 'Clear all' });

		expect(clear.getAttribute('formaction')).toBe('?/clearMembers');

		await fireEvent.click(clear);

		expect(onClear).toHaveBeenCalledOnce();
	});

	it('says how to begin while the committee is empty, with no "Clear all"', () => {
		renderMembers([]);

		expect(
			screen.getByText('Nobody yet. Start from a ready-made list, or add delegations one by one.')
		).toBeTruthy();
		expect(screen.getByText('0 members')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
	});

	it("shows the members' own message under the list", () => {
		renderMembers([countryMember('FR')], 'Add at least two members to start.');

		expect(screen.getByText('1 member')).toBeTruthy();
		expect(screen.getByText('Add at least two members to start.')).toBeTruthy();
	});
});
