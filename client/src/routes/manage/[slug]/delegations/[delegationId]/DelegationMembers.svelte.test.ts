import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { NO_MEMBERS_YET_NOTICE } from '$lib/delegation-review';
import type { DelegationMember } from '$lib/delegations';
import DelegationMembers from './DelegationMembers.svelte';

/** The delegation's head, who registered it and holds no seat. */
const AMIRA_HEAD: DelegationMember = {
	userId: 'user-amira',
	fullName: 'Amira Haddad',
	avatarPath: null,
	institutionName: 'Lycée Français de La Haye',
	experienceLevel: 'advanced',
	role: 'head',
	joinedAt: '2026-09-01T09:00:00Z',
	seat: null,
	details: null
};

/** A member holding a seat, whose private details are visible to this reader. */
const LUIS_MEMBER: DelegationMember = {
	userId: 'user-luis',
	fullName: 'Luis Ortega',
	avatarPath: null,
	institutionName: 'Lycée Français de La Haye',
	experienceLevel: 'intermediate',
	role: 'member',
	joinedAt: '2026-09-04T09:00:00Z',
	seat: {
		seatName: 'France',
		countryCode: 'FR',
		committeeName: 'Security Council',
		committeeAbbreviation: 'UNSC'
	},
	details: {
		dateOfBirth: '2008-04-12',
		phone: '+31 6 1234 5678',
		dietaryRequirements: 'Vegetarian'
	}
};

/** A reader who holds both private-detail permissions. */
const EVERY_DETAIL = { contact: true, welfare: true };

/** The moment every test that reads an age pretends it is. */
const NOW = new Date('2026-09-22T12:00:00Z');

describe('DelegationMembers', () => {
	it('tells the organiser nobody has been invited when only the head is on the list', () => {
		render(DelegationMembers, { props: { members: [AMIRA_HEAD], now: NOW, access: EVERY_DETAIL } });

		expect(screen.getByText(NO_MEMBERS_YET_NOTICE)).toBeTruthy();
	});

	it('leaves the notice out once the head has invited somebody', () => {
		render(DelegationMembers, {
			props: { members: [AMIRA_HEAD, LUIS_MEMBER], now: NOW, access: EVERY_DETAIL }
		});

		expect(screen.queryByText(NO_MEMBERS_YET_NOTICE)).toBeNull();
	});

	it('names the seat a member holds under their committee', () => {
		render(DelegationMembers, {
			props: { members: [AMIRA_HEAD, LUIS_MEMBER], now: NOW, access: EVERY_DETAIL }
		});

		expect(screen.getByText('UNSC · France')).toBeTruthy();
	});

	it('shows the private details a reader is allowed to see', () => {
		render(DelegationMembers, {
			props: { members: [AMIRA_HEAD, LUIS_MEMBER], now: NOW, access: EVERY_DETAIL }
		});

		expect(screen.getByText('Dietary requirements')).toBeTruthy();
		expect(screen.getByText('Vegetarian')).toBeTruthy();
		expect(screen.getByText('+31 6 1234 5678')).toBeTruthy();
	});
});
