<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import ActionRow from '$lib/components/manage/ActionRow.svelte';
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import type { StaffConference } from '$lib/manage';
	import { staffConferenceRow } from '$lib/manage-list';

	type Props = {
		/** Conferences the reader helps with. Never empty: the page leaves the section out. */
		staffConferences: StaffConference[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { staffConferences }: Props = $props();

	// `$derived` works the rows out again whenever the list changes.
	const rows = $derived(staffConferences.map(staffConferenceRow));
</script>

<ManageSection title="Conferences you help with">
	<ul>
		<!--
			The key lets Svelte reuse list items instead of rebuilding them.
			`staffConferenceRow` sends an organiser to the management area and
			everybody else to the conference's public page.
		-->
		{#each rows as row (row.id)}
			<ActionRow title={row.name} detail={row.detail}>
				<Button label={row.actionLabel} variant="secondary" size="dense-sm" href={row.href} />
			</ActionRow>
		{/each}
	</ul>
</ManageSection>
