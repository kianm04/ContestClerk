<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import VoteView from '$lib/components/room/vote/VoteView.svelte';
	import { chairRoomUrl } from '$lib/urls';
	// `PageProps` is the type of this page's props, which SvelteKit writes into
	// `./$types` for this folder from what the `load` functions return.
	import type { PageProps } from './$types';

	// `data` holds what the chair layout's `load` returned and what this page's
	// `load` added in `+page.server.ts`: the Vote view's data, `voteView`. Both
	// run again after every press and whenever realtime reports a change in the
	// room. `form` is what a refused "Open vote" sent back, so the set-up keeps
	// what was typed.
	let { data, form }: PageProps = $props();
</script>

<!--
	The Vote view. The live room (`chair`) draws the same `VoteView` while the
	room is voting, so the two pages cannot drift apart. With no session
	running there is nothing to vote in, so no set-up either (P4: a neutral
	state, not a fault).
-->
{#if data.voteView}
	<VoteView
		view={data.voteView}
		frame={data}
		refusedValues={form?.values ?? null}
		refusedErrors={form?.errors ?? {}}
		page="voting"
	/>
{:else}
	<div class="max-w-[760px] p-8 max-md:p-4">
		<Notice tone="info">
			<p>
				No session is running.
				<a
					href={chairRoomUrl(data.conference.slug, data.committee.slug)}
					class="font-medium underline"
				>
					Open the chair room
				</a>
			</p>
		</Notice>
	</div>
{/if}
