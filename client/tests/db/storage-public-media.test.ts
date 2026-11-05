import { describe, expect, it } from 'vitest';
import { createConferenceOwnedByMe } from './conference-fixtures';
import {
	createServiceRoleClient,
	createSignedInClient,
	createVisitorClient
} from './supabase-test-client';

// The `public-media` bucket and its four policies on `storage.objects`. Each
// test states one rule from specs/02-architecture/storage.md and checks it
// against the real local Storage, once for somebody who is allowed and once for
// somebody who is not.
//
// The uploads are real: a few bytes with the right content type, which is all
// the bucket's type limit looks at.
//
// A visitor reads a picture the way a browser does, by fetching its public
// address. Storage's `download()` goes through the signed route, which asks
// the select policy, and since migration 20261022133000 (security review L60)
// there is no select policy for a visitor: that is what keeps the bucket from
// being listed. tests/db/security-storage.test.ts covers the listing.

/** The bucket every test here uploads to. */
const BUCKET = 'public-media';

/** Fetches a file at its public address, with no session, the way an `<img>` does. */
async function fetchAsVisitor(path: string): Promise<Response> {
	const { publicUrl } = createVisitorClient().storage.from(BUCKET).getPublicUrl(path).data;

	return fetch(publicUrl);
}

/** A tiny file that counts as a JPEG, so the bucket's type limit lets it through. */
function tinyImage(): Blob {
	return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], { type: 'image/jpeg' });
}

/** The path the app gives an avatar: `avatars/<user id>/<uuid>.jpg`. */
function avatarPath(userId: string): string {
	return `avatars/${userId}/${crypto.randomUUID()}.jpg`;
}

describe('the bucket itself', () => {
	it('is public, so anybody may read a file without signing in', async () => {
		const { supabase, userId } = await createSignedInClient();
		const path = avatarPath(userId);

		const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, tinyImage());
		expect(uploadError).toBeNull();

		// A visitor with no session at all, which is what a browser loading the
		// picture on a public conference page is.
		const response = await fetchAsVisitor(path);

		expect(response.status).toBe(200);
		expect((await response.arrayBuffer()).byteLength).toBe(4);
	});

	it('refuses a file that is not one of the three image types', async () => {
		const { supabase, userId } = await createSignedInClient();
		const pdf = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: 'application/pdf' });

		const { error } = await supabase.storage
			.from(BUCKET)
			.upload(`avatars/${userId}/${crypto.randomUUID()}.pdf`, pdf);

		expect(error).not.toBeNull();
	});
});

describe('avatars', () => {
	it('lets somebody upload into their own folder', async () => {
		const { supabase, userId } = await createSignedInClient();

		const { error } = await supabase.storage.from(BUCKET).upload(avatarPath(userId), tinyImage());

		expect(error).toBeNull();
	});

	it("refuses somebody uploading into another person's folder", async () => {
		const stranger = await createSignedInClient();
		const owner = await createSignedInClient();

		const { error } = await stranger.supabase.storage
			.from(BUCKET)
			.upload(avatarPath(owner.userId), tinyImage());

		expect(error).not.toBeNull();
	});

	it('refuses a signed-out visitor uploading anything', async () => {
		const visitor = createVisitorClient();

		const { error } = await visitor.storage
			.from(BUCKET)
			.upload(avatarPath(crypto.randomUUID()), tinyImage());

		expect(error).not.toBeNull();
	});

	it('lets somebody delete their own picture and refuses a stranger', async () => {
		const owner = await createSignedInClient();
		const stranger = await createSignedInClient();
		const path = avatarPath(owner.userId);

		await owner.supabase.storage.from(BUCKET).upload(path, tinyImage());

		// The stranger's delete removes nothing. Storage answers a delete that
		// matched no row with an empty list rather than an error.
		const { data: strangerRemoved } = await stranger.supabase.storage.from(BUCKET).remove([path]);
		expect(strangerRemoved).toEqual([]);

		const { data: ownerRemoved } = await owner.supabase.storage.from(BUCKET).remove([path]);
		expect(ownerRemoved).toHaveLength(1);
	});
});

describe('conference and organisation folders', () => {
	it('lets the organiser upload a banner for their own conference', async () => {
		const fixture = await createConferenceOwnedByMe();

		const { error } = await fixture.supabase.storage
			.from(BUCKET)
			.upload(`conferences/${fixture.conferenceId}/banner-${crypto.randomUUID()}.jpg`, tinyImage());

		expect(error).toBeNull();
	});

	it('refuses somebody with nothing to do with that conference', async () => {
		const fixture = await createConferenceOwnedByMe();
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase.storage
			.from(BUCKET)
			.upload(`conferences/${fixture.conferenceId}/banner-${crypto.randomUUID()}.jpg`, tinyImage());

		expect(error).not.toBeNull();
	});

	it('lets an owner upload a logo for their own organisation', async () => {
		const fixture = await createConferenceOwnedByMe();

		const { error } = await fixture.supabase.storage
			.from(BUCKET)
			.upload(
				`organizations/${fixture.organizationId}/logo-${crypto.randomUUID()}.jpg`,
				tinyImage()
			);

		expect(error).toBeNull();
	});

	it('refuses somebody who is not a member of that organisation', async () => {
		const fixture = await createConferenceOwnedByMe();
		const stranger = await createSignedInClient();

		const { error } = await stranger.supabase.storage
			.from(BUCKET)
			.upload(
				`organizations/${fixture.organizationId}/logo-${crypto.randomUUID()}.jpg`,
				tinyImage()
			);

		expect(error).not.toBeNull();
	});
});

describe('replacing a file that is already there', () => {
	// Replacing is an update of the `storage.objects` row rather than an insert,
	// so it is the update policy that decides, and that policy has two halves:
	// `using` picks the rows that may be changed at all, and `with check` says
	// what they may be changed into.

	it('lets somebody replace their own picture', async () => {
		const { supabase, userId } = await createSignedInClient();
		const path = avatarPath(userId);

		await supabase.storage.from(BUCKET).upload(path, tinyImage());

		// `upsert` on a path that already holds a file is the replacement the
		// avatar form makes when somebody picks a new picture.
		const { error } = await supabase.storage
			.from(BUCKET)
			.upload(path, tinyImage(), { upsert: true });

		expect(error).toBeNull();
	});

	it("refuses a stranger replacing somebody else's picture", async () => {
		const owner = await createSignedInClient();
		const stranger = await createSignedInClient();
		const path = avatarPath(owner.userId);

		await owner.supabase.storage.from(BUCKET).upload(path, tinyImage());

		const { error } = await stranger.supabase.storage
			.from(BUCKET)
			.upload(path, tinyImage(), { upsert: true });

		expect(error).not.toBeNull();
	});

	it("refuses moving a file into somebody else's folder", async () => {
		const owner = await createSignedInClient();
		const stranger = await createSignedInClient();
		const path = avatarPath(owner.userId);

		await owner.supabase.storage.from(BUCKET).upload(path, tinyImage());

		// A move changes the row's `name`, which is the half `with check` guards:
		// the owner may change this row, but not into a path they do not own.
		const { error } = await owner.supabase.storage
			.from(BUCKET)
			.move(path, avatarPath(stranger.userId));

		expect(error).not.toBeNull();
	});
});

describe('a path that belongs to nobody', () => {
	it('refuses a folder the bucket has never heard of', async () => {
		const { supabase } = await createSignedInClient();

		const { error } = await supabase.storage
			.from(BUCKET)
			.upload(`somewhere-else/${crypto.randomUUID()}/picture.jpg`, tinyImage());

		expect(error).not.toBeNull();
	});

	it('refuses a path whose second folder is not an id at all', async () => {
		const { supabase } = await createSignedInClient();

		const { error } = await supabase.storage
			.from(BUCKET)
			.upload('avatars/not-a-user-id/picture.jpg', tinyImage());

		expect(error).not.toBeNull();
	});

	it('refuses a file dropped straight in the bucket with no folder', async () => {
		const { supabase } = await createSignedInClient();

		const { error } = await supabase.storage.from(BUCKET).upload('picture.jpg', tinyImage());

		expect(error).not.toBeNull();
	});
});

// The sample pictures below are put in the bucket by the seeding, not by
// anybody signed in: the Supabase CLI uploads everything under
// `supabase/media/public-media/` at the end of every `pnpm db:reset`, as
// `postgres`, so `may_write_public_media` never sees them. Nothing here says
// anybody may write to those paths through the app, and nobody may:
// `avatars/sample/` and `marketing/sample/` are refused for everybody, which
// the tests above already prove.

/**
 * Every made-up organisation the three seed files add (`seed.sql`,
 * `demo-seed.sql`, `walkthrough-seed.sql`), and the logo each row names. Each
 * logo is an invented crest drawn in `supabase/media/drawn/` (T149).
 */
const SEEDED_ORGANIZATION_LOGOS = [
	{
		id: '10000000-0000-4000-8000-000000000001',
		logoPath:
			'organizations/10000000-0000-4000-8000-000000000001/logo-b1000000-0000-4000-8000-000000000001.png'
	},
	{
		id: '10000000-0000-4000-8000-000000000002',
		logoPath:
			'organizations/10000000-0000-4000-8000-000000000002/logo-b1000000-0000-4000-8000-000000000002.png'
	},
	{
		id: '10000000-0000-4000-8000-000000000003',
		logoPath:
			'organizations/10000000-0000-4000-8000-000000000003/logo-b1000000-0000-4000-8000-000000000003.png'
	},
	{
		id: 'd1000000-0000-4000-8000-000000000001',
		logoPath:
			'organizations/d1000000-0000-4000-8000-000000000001/logo-b1000000-0000-4000-8000-000000000001.png'
	},
	{
		id: 'f1000000-0000-4000-8000-000000000001',
		logoPath:
			'organizations/f1000000-0000-4000-8000-000000000001/logo-b1000000-0000-4000-8000-000000000001.png'
	}
];

/**
 * Every conference the three seed files add, and the banner and logo each row
 * names: the walkthrough, demo and sample conferences, drafts included. The
 * banners are the photographs `supabase/media/CREDITS.md` lists. Amsterdam
 * kept the banner file name it had before T149; only the photograph changed.
 */
const SEEDED_CONFERENCE_PICTURES = [
	{
		slug: 'hagueimun-2026',
		bannerPath:
			'conferences/20000000-0000-4000-8000-000000000001/banner-b2000000-0000-4000-8000-000000000001.jpg',
		logoPath:
			'conferences/20000000-0000-4000-8000-000000000001/logo-b1000000-0000-4000-8000-000000000001.png'
	},
	{
		slug: 'bermun-2026',
		bannerPath:
			'conferences/20000000-0000-4000-8000-000000000003/banner-b2000000-0000-4000-8000-000000000003.jpg',
		logoPath:
			'conferences/20000000-0000-4000-8000-000000000003/logo-b1000000-0000-4000-8000-000000000003.png'
	},
	{
		slug: 'brusselsmun-2027',
		bannerPath:
			'conferences/20000000-0000-4000-8000-000000000004/banner-b2000000-0000-4000-8000-000000000004.jpg',
		logoPath:
			'conferences/20000000-0000-4000-8000-000000000004/logo-b1000000-0000-4000-8000-000000000004.png'
	},
	{
		slug: 'hmun-2027',
		bannerPath:
			'conferences/20000000-0000-4000-8000-000000000005/banner-b2000000-0000-4000-8000-000000000005.jpg',
		logoPath:
			'conferences/20000000-0000-4000-8000-000000000005/logo-b1000000-0000-4000-8000-000000000005.png'
	},
	{
		slug: 'tokyomun-2027',
		bannerPath:
			'conferences/20000000-0000-4000-8000-000000000007/banner-b2000000-0000-4000-8000-000000000007.jpg',
		logoPath:
			'conferences/20000000-0000-4000-8000-000000000007/logo-b1000000-0000-4000-8000-000000000007.png'
	},
	{
		slug: 'draft-conference-2027',
		bannerPath:
			'conferences/20000000-0000-4000-8000-000000000008/banner-b2000000-0000-4000-8000-000000000008.jpg',
		logoPath:
			'conferences/20000000-0000-4000-8000-000000000008/logo-b1000000-0000-4000-8000-000000000008.png'
	},
	{
		slug: 'amsterdammun-2027',
		bannerPath:
			'conferences/20000000-0000-4000-8000-000000000009/banner-40000000-0000-4000-8000-000000000009.jpg',
		logoPath:
			'conferences/20000000-0000-4000-8000-000000000009/logo-b1000000-0000-4000-8000-000000000009.png'
	},
	{
		slug: 'viennamun-2027',
		bannerPath:
			'conferences/20000000-0000-4000-8000-000000000010/banner-b2000000-0000-4000-8000-000000000010.jpg',
		logoPath:
			'conferences/20000000-0000-4000-8000-000000000010/logo-b1000000-0000-4000-8000-000000000010.png'
	},
	{
		slug: 'copenhagenmun-2027',
		bannerPath:
			'conferences/20000000-0000-4000-8000-000000000011/banner-b2000000-0000-4000-8000-000000000011.jpg',
		logoPath:
			'conferences/20000000-0000-4000-8000-000000000011/logo-b1000000-0000-4000-8000-000000000011.png'
	},
	{
		slug: 'madridmun-2027',
		bannerPath:
			'conferences/20000000-0000-4000-8000-000000000012/banner-b2000000-0000-4000-8000-000000000012.jpg',
		logoPath:
			'conferences/20000000-0000-4000-8000-000000000012/logo-b1000000-0000-4000-8000-000000000012.png'
	},
	{
		slug: 'rotterdammun-2026',
		bannerPath:
			'conferences/20000000-0000-4000-8000-000000000016/banner-b2000000-0000-4000-8000-000000000016.jpg',
		logoPath:
			'conferences/20000000-0000-4000-8000-000000000016/logo-b1000000-0000-4000-8000-000000000016.png'
	},
	{
		slug: 'first-year-mun-2027',
		bannerPath:
			'conferences/20000000-0000-4000-8000-000000000017/banner-b2000000-0000-4000-8000-000000000017.jpg',
		logoPath:
			'conferences/20000000-0000-4000-8000-000000000017/logo-b1000000-0000-4000-8000-000000000017.png'
	},
	{
		slug: 'lisbon-atlantic-mun',
		bannerPath:
			'conferences/d2000000-0000-4000-8000-000000000001/banner-b2000000-0000-4000-8000-000000000001.jpg',
		logoPath:
			'conferences/d2000000-0000-4000-8000-000000000001/logo-b1000000-0000-4000-8000-000000000001.png'
	},
	{
		slug: 'northbridge-draft',
		bannerPath:
			'conferences/f2000000-0000-4000-8000-000000000001/banner-b2000000-0000-4000-8000-000000000001.jpg',
		logoPath:
			'conferences/f2000000-0000-4000-8000-000000000001/logo-b1000000-0000-4000-8000-000000000001.png'
	},
	{
		slug: 'northbridge-opening-soon',
		bannerPath:
			'conferences/f2000000-0000-4000-8000-000000000002/banner-b2000000-0000-4000-8000-000000000002.jpg',
		logoPath:
			'conferences/f2000000-0000-4000-8000-000000000002/logo-b1000000-0000-4000-8000-000000000002.png'
	},
	{
		slug: 'northbridge-applications-open',
		bannerPath:
			'conferences/f2000000-0000-4000-8000-000000000003/banner-b2000000-0000-4000-8000-000000000003.jpg',
		logoPath:
			'conferences/f2000000-0000-4000-8000-000000000003/logo-b1000000-0000-4000-8000-000000000003.png'
	},
	{
		slug: 'northbridge-about-to-start',
		bannerPath:
			'conferences/f2000000-0000-4000-8000-000000000004/banner-b2000000-0000-4000-8000-000000000004.jpg',
		logoPath:
			'conferences/f2000000-0000-4000-8000-000000000004/logo-b1000000-0000-4000-8000-000000000004.png'
	},
	{
		slug: 'northbridge-running-today',
		bannerPath:
			'conferences/f2000000-0000-4000-8000-000000000005/banner-b2000000-0000-4000-8000-000000000005.jpg',
		logoPath:
			'conferences/f2000000-0000-4000-8000-000000000005/logo-b1000000-0000-4000-8000-000000000005.png'
	}
];

/**
 * The three pictures no database row points at. They belong to `/styleguide`,
 * which never reads the database and names them in its own sample data.
 */
const STYLEGUIDE_PICTURE_PATHS = [
	'avatars/sample/portrait.jpg',
	'marketing/sample/delegates.jpg',
	'conferences/11111111-1111-4111-8111-111111111111/banner.jpg'
];

/** Every sample picture `pnpm db:reset` should have uploaded. See supabase/media/README.md. */
const SEEDED_PICTURE_PATHS = [
	...STYLEGUIDE_PICTURE_PATHS,
	...SEEDED_ORGANIZATION_LOGOS.map((organization) => organization.logoPath),
	...SEEDED_CONFERENCE_PICTURES.map((conference) => conference.bannerPath),
	...SEEDED_CONFERENCE_PICTURES.map((conference) => conference.logoPath)
];

describe('the sample pictures the seeding uploads', () => {
	// One test per picture, so a file somebody renamed or a folder the CLI
	// stopped uploading is named in the failure rather than hidden inside a loop.
	// Without these, every picture in the app would quietly become a broken
	// image and nothing else in `pnpm verify` would notice.
	for (const path of SEEDED_PICTURE_PATHS) {
		it(`lets a visitor with no session download ${path}`, async () => {
			const response = await fetchAsVisitor(path);

			expect(response.status).toBe(200);
			// A path that holds an empty file downloads without an error, so the size
			// is what says a real picture is there.
			expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
		});
	}

	it('gives each sample organisation the logo path its file really sits at', async () => {
		const visitor = createVisitorClient();

		for (const organization of SEEDED_ORGANIZATION_LOGOS) {
			const { data, error } = await visitor
				.from('organizations')
				.select('logo_path')
				.eq('id', organization.id)
				.single();

			expect(error).toBeNull();
			expect(data?.logo_path).toBe(organization.logoPath);
		}
	});

	// The service role reads the rows because two of the conferences are drafts,
	// which a visitor is not allowed to see at all.
	for (const conference of SEEDED_CONFERENCE_PICTURES) {
		it(`gives ${conference.slug} the banner and logo paths its files really sit at`, async () => {
			const service = createServiceRoleClient();

			const { data, error } = await service
				.from('conferences')
				.select('banner_path, logo_path')
				.eq('slug', conference.slug)
				.single();

			expect(error).toBeNull();
			expect(data?.banner_path).toBe(conference.bannerPath);
			expect(data?.logo_path).toBe(conference.logoPath);
		});
	}
});
