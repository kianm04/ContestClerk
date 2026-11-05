<script lang="ts">
	import Avatar from '$lib/components/Avatar.svelte';
	import type { TeamPerson } from '$lib/team';

	type Props = {
		/** The person whose picture and name these are. */
		person: TeamPerson;
		/** True on the reader's own row, which then says "You" under the name. */
		isViewer: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { person, isViewer }: Props = $props();
</script>

<!--
	The Name cell of the People table, and the top line of the same person's
	card on a phone: the picture (or initials), the name, and "You" under the
	reader's own name. `min-w-0` and `break-words` let a long name wrap rather
	than push the table or the card wider than the screen.
-->
<div class="flex min-w-0 items-center gap-3">
	<Avatar name={person.fullName} imagePath={person.avatarPath} size="sm" />

	<div class="min-w-0">
		<p class="font-medium break-words text-foreground">{person.fullName}</p>

		<!-- An owner or admin of the organisation holds no role here and is
			changed on the organisation's own page, which this line says. -->
		{#if isViewer}
			<p class="text-small text-muted-foreground">You</p>
		{:else if person.source === 'organization'}
			<p class="text-small text-muted-foreground">From the organisation</p>
		{/if}
	</div>
</div>
