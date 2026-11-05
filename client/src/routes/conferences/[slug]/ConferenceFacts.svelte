<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import KeyValueList from '$lib/components/KeyValueList.svelte';
	import { phoneLinkAddress } from '$lib/conference-details';
	import { conferenceHoursLine, conferenceVenueLine, type Conference } from '$lib/conferences';
	import { formatDateRange } from '$lib/dates';
	import { manageConferenceUrl } from '$lib/urls';

	type Props = {
		conference: Conference;
		/**
		 * Whether this reader may run the conference, which is
		 * `has_permission(id, 'administrator')` in the database. Only they are offered the way
		 * into the management area below; a chair or a volunteer would be met
		 * with a 404 there.
		 */
		canManage: boolean;
	};

	let { conference, canManage }: Props = $props();

	/** "14–18", "From 14", "Up to 18", or '' when the organisers gave no ages. */
	function ageRange(minAge: number | null, maxAge: number | null): string {
		if (minAge !== null && maxAge !== null) {
			return `${minAge}–${maxAge}`;
		}
		if (minAge !== null) {
			return `From ${minAge}`;
		}
		if (maxAge !== null) {
			return `Up to ${maxAge}`;
		}
		return '';
	}

	// The facts, in the order `05-pages/public/conference.md` lists them. A fact the
	// organisers did not fill in is '', and the filter drops it, so no empty row is
	// ever shown. `$derived` builds the list again whenever the conference changes.
	//
	// The venue is the exception: one still to be decided says "Venue to be
	// announced" rather than vanishing, so a reader knows there will be one. Only
	// an online conference, which has none, leaves the row out. The address is
	// shown only beside a venue that is really known.
	//
	// The level, the language and the expected number of delegates are not here,
	// although the conference carries all three: `ConferenceHero` already shows
	// them at the top of the page, and a fact said twice reads as two facts.
	const isVenueKnown = $derived(
		conference.locationMode !== 'online' && conference.venueStatus === 'known'
	);

	const facts = $derived(
		[
			{ label: 'Venue', value: conferenceVenueLine(conference) ?? '' },
			{ label: 'Address', value: isVenueKnown ? (conference.venueAddress ?? '') : '' },
			{ label: 'Dates', value: formatDateRange(conference.startDate, conference.endDate) },
			// "10:00 – 17:00 each day", or nothing while the times are to be announced.
			{ label: 'Times', value: conferenceHoursLine(conference) ?? '' },
			{ label: 'Timezone', value: conference.timezone },
			// Ages are the one fact the hero has no room for, and `data-model.md` calls
			// them informational, so this is the only place a reader can find them.
			{ label: 'Ages', value: ageRange(conference.minAge, conference.maxAge) }
		].filter((fact) => fact.value !== '')
	);

	// The links under the facts, dropped the same way when there is nothing to
	// link to. None of them is a page of ours, so they are plain strings rather
	// than the addresses `resolve()` builds and checks.
	//
	// The phone number is the one link that shows its own value: a reader on a
	// laptop cannot tap a `tel:` address, but they can read the number off the
	// page. `phoneLinkAddress` answers `null` for a number that cannot be
	// dialled, and the filter then drops the row like any other empty one.
	const links = $derived(
		[
			{ label: 'Conference website', href: conference.websiteUrl ?? '' },
			{ label: 'Instagram', href: conference.instagramUrl ?? '' },
			{ label: 'Facebook', href: conference.facebookUrl ?? '' },
			{ label: 'LinkedIn', href: conference.linkedinUrl ?? '' },
			{ label: 'YouTube', href: conference.youtubeUrl ?? '' },
			{ label: 'TikTok', href: conference.tiktokUrl ?? '' },
			{
				label: 'Email the organisers',
				href: conference.contactEmail === null ? '' : `mailto:${conference.contactEmail}`
			},
			{
				label: `Call ${conference.contactPhone ?? ''}`,
				href: phoneLinkAddress(conference.contactPhone) ?? ''
			}
		].filter((link) => link.href !== '')
	);
</script>

<div class="flex flex-col gap-4">
	<KeyValueList items={facts} />

	{#if links.length > 0}
		<ul class="flex flex-col gap-1 text-small">
			<!--
				Links have no id of their own and no two of them can read the same, so
				the address is the key. `rel="external"` tells SvelteKit, and the lint
				rule that checks our links, that the address belongs to somebody else
				rather than to one of our own pages.
			-->
			{#each links as link (link.href)}
				<li><a href={link.href} rel="external" class="text-brand-700">{link.label}</a></li>
			{/each}
		</ul>
	{/if}

	{#if canManage}
		<!-- The wireframe in `05-pages/public/conference.md` puts this under the
			facts, so an organiser looking at their own public page can step straight
			into the management area rather than going round by `/manage`. -->
		<Button
			label="Manage this conference"
			variant="secondary"
			href={manageConferenceUrl(conference.slug)}
			isFullWidth
		/>
	{/if}
</div>
