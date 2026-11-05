<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ParagraphText from '$lib/components/ParagraphText.svelte';
	import type { PublicOrganization } from '$lib/organizations';
	import { organizationSettingsUrl } from '$lib/urls';

	type Props = {
		organization: PublicOrganization;
		/**
		 * Whether this reader is an owner or an admin of the organisation, which
		 * is the only thing the "Edit organisation" button below depends on. It
		 * is worked out on the server by `getOrganizationPage`, which asks the
		 * database's own `is_organization_admin`, so the button and the change it
		 * leads to cannot disagree.
		 */
		isAdmin: boolean;
	};

	let { organization, isAdmin }: Props = $props();
</script>

<div class="flex flex-col gap-4">
	<!-- The logo sits beside the name rather than above it, so the two read as one
		heading. `Avatar` falls back to the organisation's initials when there is no
		picture, which is the ordinary case until somebody uploads one. -->
	<div class="flex items-start gap-4">
		<Avatar name={organization.name} imagePath={organization.logoPath} size="lg" />

		<!-- `min-w-0` lets a long name wrap instead of pushing the row off a phone screen. -->
		<div class="min-w-0 flex-1">
			<PageHeader eyebrow="Organisation" title={organization.name}>
				{#if isAdmin}
					<Button
						label="Edit organisation"
						variant="secondary"
						href={organizationSettingsUrl(organization.slug)}
					/>
				{/if}
			</PageHeader>
		</div>
	</div>

	<!-- The country and the website, on one line that wraps onto as many as a phone needs. -->
	<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-small text-ink-600">
		{#if organization.countryCode && organization.countryName}
			<span class="flex items-center gap-1.5">
				<Flag countryCode={organization.countryCode} size="sm" />
				{organization.countryName}
			</span>
		{/if}

		{#if organization.websiteUrl}
			<!-- `rel="external"` tells SvelteKit, and the lint rule that checks our
				links, that the address belongs to somebody else rather than to one of
				our own pages. The address itself was checked on the server, so a
				`javascript:` line typed into the database never reaches this `href`. -->
			<a href={organization.websiteUrl} rel="external" class="text-brand-700">Website</a>
		{/if}
	</div>

	{#if organization.description}
		<div class="max-w-prose text-ink-600">
			<ParagraphText text={organization.description} />
		</div>
	{/if}
</div>
