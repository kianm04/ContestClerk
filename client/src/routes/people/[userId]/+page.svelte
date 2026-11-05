<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import KeyValueList, { type KeyValueItem } from '$lib/components/KeyValueList.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ParagraphText from '$lib/components/ParagraphText.svelte';
	import Section from '$lib/components/Section.svelte';
	import { countryName } from '$lib/countries';
	import { statusLabel } from '$lib/status';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned: one public profile.
	let { data }: PageProps = $props();

	// `$derived` works these out again whenever `data` changes. An empty field is
	// left out rather than shown as a blank row.
	const profile = $derived(data.profile);
	const metaLine = $derived(
		[profile.pronouns, profile.institutionName].filter(Boolean).join(' · ')
	);
	// `$derived.by` is `$derived` for a value that takes a few lines to work out.
	const facts = $derived.by(() => {
		const items: KeyValueItem[] = [];

		if (profile.countryCode !== '') {
			items.push({
				label: 'Country',
				value: countryName(profile.countryCode),
				countryCode: profile.countryCode
			});
		}

		if (profile.institutionName !== '') {
			items.push({ label: 'School', value: profile.institutionName });
		}

		items.push({
			label: 'Experience',
			value: statusLabel('experience_level', profile.experienceLevel)
		});

		return items;
	});
</script>

<svelte:head>
	<title>{profile.fullName} · MUNMeet</title>
</svelte:head>

<div class="mx-auto flex max-w-2xl flex-col gap-6">
	<div class="flex items-start gap-4">
		<Avatar name={profile.fullName} imagePath={profile.avatarPath} size="lg" />
		<div class="min-w-0 flex-1">
			<PageHeader title={profile.fullName} subtitle={metaLine || undefined} />
		</div>
	</div>

	<Section title="Profile">
		<KeyValueList items={facts} />
	</Section>

	{#if profile.bio !== ''}
		<Section title="About">
			<ParagraphText text={profile.bio} />
		</Section>
	{/if}
</div>
