<script lang="ts">
	import type { DelegationPreview } from '$lib/delegations';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import DateRange from '$lib/components/DateRange.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { countryName } from '$lib/countries';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import type { JoinRefusalLink } from '$lib/join-refusal-link';

	type Props = {
		/** The delegation as `preview_delegation` describes it to somebody holding the code. */
		preview: DelegationPreview;
		/** The reader, for the "You will join as" line. */
		me: { fullName: string; avatarPath: string | null };
		/**
		 * Why they may not join, or `null` when they may. With a reason the card
		 * shows that sentence instead of the button, so nobody can press a button
		 * that cannot work.
		 */
		reason: string | null;
		/** The one link under the reason that helps, or `null` when there is none. */
		reasonLink: JoinRefusalLink | null;
		/** The code the hidden field posts back, as it stands in the address. */
		joinCode: string;
	};

	let { preview, me, reason, reasonLink, joinCode }: Props = $props();

	/* `$derived` works each of these out again on its own whenever `preview`
	   changes. */

	// "Netherlands" rather than "NL", which is what the line under the dates says.
	const conferenceCountry = $derived(countryName(preview.conferenceCountryCode));

	// "1 member" rather than "1 members".
	const memberCountText = $derived(
		preview.memberCount === 1 ? '1 member' : `${preview.memberCount} members`
	);

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	const inPlaceForm = createInPlaceForm();
</script>

<Card>
	<h2 class="font-display text-h2 text-brand-900">{preview.name}</h2>
	<p class="text-body text-ink-600">{preview.institutionName}</p>

	<p class="mt-3 text-body">
		{preview.conferenceName}
		<span aria-hidden="true">·</span>
		<DateRange startDate={preview.conferenceStartDate} endDate={preview.conferenceEndDate} />
	</p>

	<!-- The flag and the place names sit on one row, middles lined up. -->
	<p class="mt-1 flex items-center gap-1.5 text-small text-ink-600">
		<Flag countryCode={preview.conferenceCountryCode} size="sm" />
		<span>{preview.conferenceCity}, {conferenceCountry}</span>
	</p>

	<!--
		A head's name is a plain string with no id of its own, so its place in the
		list is the key, the way `KeyValueList` and `Timeline` do it. The check
		inside puts a separator between two names and not in front of the first.
	-->
	<p class="mt-3 text-small text-ink-600">
		Heads:
		{#each preview.headNames as headName, index (index)}
			{#if index > 0}<span aria-hidden="true">·</span>{/if}
			{headName}
		{/each}
		<span aria-hidden="true">·</span>
		{memberCountText}
	</p>

	<div class="mt-4 flex flex-wrap items-center gap-2">
		<span class="text-small text-ink-600">You will join as:</span>
		<Avatar name={me.fullName} imagePath={me.avatarPath} size="sm" />
		<span class="text-body">{me.fullName}</span>
	</div>

	{#if reason}
		<!--
			Every reason is a rule saying no rather than something broken, whether
			it was the page's own check or the one `join_delegation` made, so they
			all share the one quieter tone.
		-->
		<div class="mt-4">
			<Notice tone="warning">{reason}</Notice>
		</div>

		<!-- The one way on from the refusal, as the card's only button (T177). -->
		{#if reasonLink}
			<div class="mt-4">
				<Button
					label={reasonLink.label}
					variant="primary"
					href={reasonLink.href}
					isFullWidth={true}
				/>
			</div>
		{/if}
	{:else}
		<div class="mt-4">
			<Notice tone="info">
				The heads can see your phone number and dietary requirements. The organisers can see your
				profile details.
			</Notice>
		</div>

		<!--
			An ordinary HTML form with no action named, so it posts to this page's
			one `default` action and works even if the JavaScript never loads.
		-->
		<form method="post" class="mt-4" use:enhance={inPlaceForm.submit}>
			<input type="hidden" name="joinCode" value={joinCode} />
			<Button
				label="Join delegation"
				variant="primary"
				isFullWidth={true}
				isLoading={inPlaceForm.isBusy}
			/>
		</form>
	{/if}

	<p class="mt-4 text-small text-ink-600">Not your group? Ask your teacher for the right link.</p>
</Card>
