import { describe, expect, it } from 'vitest';
import { createConferenceOwnedByMe } from './conference-fixtures';

// The five contact columns that
// supabase/migrations/20261010130000_conference_contact_channels.sql added to
// `conferences` (Trello Jjf34CcP): a phone number and the addresses of the
// conference on Facebook, LinkedIn, YouTube and TikTok, beside the email and
// the Instagram address it already had.
//
// The migration also made `conferences_with_organization` again, because a view
// keeps the list of columns it was made with and would otherwise not know about
// the new ones. Every read of a conference in the app goes through that view,
// so the test below reads the columns back through it rather than through the
// table: that is the half a plain `alter table` cannot prove about itself.

/** What an organiser types into "Contact and links", as the editor saves it. */
const CONTACT_CHANNELS = {
	contact_phone: '+31 6 1234 5678',
	facebook_url: 'https://www.facebook.com/fixturemun',
	linkedin_url: 'https://www.linkedin.com/company/fixturemun',
	youtube_url: 'https://www.youtube.com/@fixturemun',
	tiktok_url: 'https://www.tiktok.com/@fixturemun'
};

describe('conference contact channels', () => {
	it('starts every channel empty on a new conference', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		const { data, error } = await supabase
			.from('conferences_with_organization')
			.select('contact_phone, facebook_url, linkedin_url, youtube_url, tiktok_url')
			.eq('id', conferenceId)
			.single();

		expect(error).toBeNull();
		expect(data).toEqual({
			contact_phone: null,
			facebook_url: null,
			linkedin_url: null,
			youtube_url: null,
			tiktok_url: null
		});
	});

	it('lets the organiser save every channel and reads them back through the view', async () => {
		const { supabase, conferenceId } = await createConferenceOwnedByMe();

		const { error: updateError } = await supabase
			.from('conferences')
			.update(CONTACT_CHANNELS)
			.eq('id', conferenceId);

		expect(updateError).toBeNull();

		const { data, error } = await supabase
			.from('conferences_with_organization')
			.select('contact_phone, facebook_url, linkedin_url, youtube_url, tiktok_url')
			.eq('id', conferenceId)
			.single();

		expect(error).toBeNull();
		expect(data).toEqual(CONTACT_CHANNELS);
	});
});
