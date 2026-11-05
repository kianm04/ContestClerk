<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import FieldError from '$lib/components/FieldError.svelte';

	type Props = {
		/** What is typed in the search box, trimmed; the row is drawn only while there is some. */
		typed: string;
		/** Whether no member state matched it, which says so above the button. */
		hasNoMatch: boolean;
		/** Why the last name was refused, such as being over 80 characters. */
		error?: string;
		/** Called when the button is pressed with JavaScript. */
		onAdd: () => void;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { typed, hasNoMatch, error, onAdd }: Props = $props();

	/*
		Without JavaScript the button posts the whole form to `?/addCustom`,
		which adds what is in the search box. With it the click is stopped here
		and the member is added in the browser.
	*/
	function handleAdd(event: MouseEvent) {
		event.preventDefault();
		onAdd();
	}
</script>

<!--
	The last row of the list while something is typed: a member that is not a
	state, such as "Amnesty International" or "Secretary-General". When no
	state matches, a line says so first.
-->
{#if hasNoMatch}
	<p class="py-2.5 text-small text-ink-600">No member state matches “{typed}”.</p>
{/if}
<button
	type="submit"
	formaction="?/addCustom"
	onclick={handleAdd}
	class="flex min-h-10 w-full cursor-pointer items-center gap-2 text-left font-medium text-brand-700 hover:underline max-md:min-h-11"
>
	<Plus size={18} aria-hidden="true" class="shrink-0" />
	<span class="min-w-0 break-words">Add “{typed}” as a member</span>
</button>
<FieldError id="custom-member-error" message={error ?? null} />
