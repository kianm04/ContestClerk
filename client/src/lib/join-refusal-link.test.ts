import { describe, expect, it } from 'vitest';
import { joinRefusalLink, unknownCodeLink, type JoinRefusalLinkFacts } from './join-refusal-link';

// `05-pages/delegation/join.md`, "Cannot join": every refusal in its link table
// gets the one link it names (T177).

/** The conference of the delegation behind the link, with nothing known about the reader. */
const FACTS: JoinRefusalLinkFacts = {
	conferenceName: 'Northbridge MUN',
	conferenceSlug: 'northbridge-mun',
	existing: null
};

const OTHER_DELEGATION_ID = '11111111-1111-4111-8111-111111111111';
const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';

describe('joinRefusalLink', () => {
	it('opens the other delegation the reader is already in', () => {
		const link = joinRefusalLink('in_other_delegation', {
			...FACTS,
			existing: {
				kind: 'delegation',
				delegationId: OTHER_DELEGATION_ID,
				delegationName: 'Northbridge High'
			}
		});

		expect(link).toEqual({
			label: 'Open Northbridge High',
			href: `/delegations/${OTHER_DELEGATION_ID}`
		});
	});

	it("opens the reader's own application, where it can be withdrawn", () => {
		const link = joinRefusalLink('already_applied', {
			...FACTS,
			existing: { kind: 'application', applicationId: APPLICATION_ID }
		});

		expect(link).toEqual({
			label: 'View your application',
			href: `/applications/${APPLICATION_ID}`
		});
	});

	it('goes back to the conference for a rejected, withdrawn or ended one, and for the team', () => {
		const backToConference = {
			label: 'Back to Northbridge MUN',
			href: '/conferences/northbridge-mun'
		};

		expect(joinRefusalLink('rejected', FACTS)).toEqual(backToConference);
		expect(joinRefusalLink('withdrawn', FACTS)).toEqual(backToConference);
		expect(joinRefusalLink('conference_over', FACTS)).toEqual(backToConference);
		// Somebody on the team runs the conference, so its page is where their work is.
		expect(joinRefusalLink('conference_staff', FACTS)).toEqual(backToConference);
	});

	it('browses conferences for a code nobody has', () => {
		const browseConferences = { label: 'Browse conferences', href: '/conferences' };

		expect(joinRefusalLink('unknown_code', FACTS)).toEqual(browseConferences);
		// The action asks for it on its own, with no delegation to take facts from.
		expect(unknownCodeLink()).toEqual(browseConferences);
	});

	it('goes back to the conference when the reader’s own route cannot be found', () => {
		const backToConference = {
			label: 'Back to Northbridge MUN',
			href: '/conferences/northbridge-mun'
		};

		expect(joinRefusalLink('in_other_delegation', FACTS)).toEqual(backToConference);
		expect(joinRefusalLink('already_applied', FACTS)).toEqual(backToConference);
	});

	it('draws no link for "already in this one", which redirects, or for an unknown failure', () => {
		expect(joinRefusalLink('already_in_this', FACTS)).toBeNull();
		expect(joinRefusalLink('unknown', FACTS)).toBeNull();
	});
});
