<script lang="ts">
	import ActionRow from '$lib/components/manage/ActionRow.svelte';
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import StatusDot from '$lib/components/manage/StatusDot.svelte';
	import type { MyQuickSession } from '$lib/my-quick-sessions';
	import { newQuickSessionUrl, signedInHomeUrl } from '$lib/urls';
	import ShowAllLink from './ShowAllLink.svelte';

	type Props = {
		/**
		 * The quick sessions drawn, most recently used first, as `quickSessionRows`
		 * in `$lib/home-rows.ts` cut them. The page leaves the section out when
		 * the reader has none.
		 */
		rows: MyQuickSession[];
		/** How many the limit left out; `0` once `?all=quick` has lifted it. */
		moreCount: number;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { rows, moreCount }: Props = $props();

	// "Show all 5" names the whole list: the rows drawn and the ones left out.
	// `$derived` works it out again whenever either changes.
	const totalCount = $derived(rows.length + moreCount);

	// The same page with every quick session: `load` reads `?all=quick` and
	// lifts the limit.
	const SHOW_ALL_HREF = signedInHomeUrl('quick');
</script>

<!--
	"Quick sessions" on `/home`: the practice committees the reader chairs, each
	with the way into its chair room, which opens on whatever the room is in:
	its lobby, the session in progress, or one that ended. "New quick session"
	is the way to another, so the page's title row offers none. The "In
	progress" dot follows `session.isInProgress`, which `toMyQuickSessions` in
	`$lib/my-quick-sessions.ts` decides from the session's status, the same way
	it words the line.
-->
<ManageSection
	title="Quick sessions"
	link={{ label: 'New quick session', href: newQuickSessionUrl() }}
>
	<ul>
		<!-- The `(session.committeeId)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each rows as session (session.committeeId)}
			<ActionRow title={session.committeeName} detail={session.statusLine}>
				{#if session.isInProgress}
					<StatusDot text="In progress" tone="brand" />
				{/if}
				<a
					href={session.href}
					class="inline-flex min-h-11 items-center text-dense font-medium text-link hover:underline"
					>Open chair room</a
				>
			</ActionRow>
		{/each}
	</ul>

	{#if moreCount > 0}
		<ShowAllLink count={totalCount} href={SHOW_ALL_HREF} />
	{/if}
</ManageSection>
