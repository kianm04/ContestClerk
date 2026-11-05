<script lang="ts">
	import FieldError from '$lib/components/FieldError.svelte';
	import type { QuickSessionMember } from '$lib/quick-session';
	import {
		QUICK_COLUMN_CLASSES,
		QUICK_LIST_CLASSES,
		QUICK_QUIET_CLASSES
	} from '$lib/quick-session-classes';
	import MemberRow from './MemberRow.svelte';

	type Props = {
		/** The committee's members, in alphabetical order. */
		members: QuickSessionMember[];
		/** The members' own message, such as "Add at least two members to start." */
		error?: string;
		/** Called with a member's value when its "×" is pressed with JavaScript. */
		onRemove: (value: string) => void;
		/** Called when "Clear all" is pressed with JavaScript. */
		onClear: () => void;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { members, error, onRemove, onClear }: Props = $props();

	// `$derived` works this out again whenever the members change.
	const countText = $derived(members.length === 1 ? '1 member' : `${members.length} members`);

	/*
		Without JavaScript "Clear all" posts the whole form to `?/clearMembers`.
		With it the click is stopped here and the list empties in the browser.
	*/
	function handleClear(event: MouseEvent) {
		event.preventDefault();
		onClear();
	}
</script>

<!--
	The right-hand column: the committee as it stands, every member in the
	alphabetical order a chair calls them in, with "Clear all" under the list.
	The list scrolls inside the column, so the footer stays on screen.
-->
<section
	aria-labelledby="committee-members-heading"
	class="{QUICK_COLUMN_CLASSES} max-md:border-t max-md:border-line md:border-l md:border-line"
>
	<div class="flex items-baseline justify-between gap-3">
		<h2 id="committee-members-heading" class="text-body font-semibold">Your committee</h2>
		<span class="text-small text-ink-600 tabular-nums">{countText}</span>
	</div>

	<div class={QUICK_LIST_CLASSES}>
		{#if members.length === 0}
			<p class="py-2.5 text-ink-600">
				Nobody yet. Start from a ready-made list, or add delegations one by one.
			</p>
		{/if}
		<!-- The `(member.value)` key lets Svelte keep each row when others come and go. -->
		{#each members as member (member.value)}
			<MemberRow {member} {onRemove} />
		{/each}
	</div>

	<FieldError id="committee-members-error" message={error ?? null} />

	{#if members.length > 0}
		<p>
			<button
				type="submit"
				formaction="?/clearMembers"
				onclick={handleClear}
				class="text-small {QUICK_QUIET_CLASSES}"
			>
				Clear all
			</button>
		</p>
	{/if}
</section>
