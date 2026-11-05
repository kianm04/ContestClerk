<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import SeatFlag from '$lib/components/room/floor/SeatFlag.svelte';
	import { countryName } from '$lib/countries';
	import { countryMember } from '$lib/quick-session';
	import { QUICK_ICON_BUTTON_CLASSES, QUICK_ROW_CLASSES } from '$lib/quick-session-classes';

	type Props = {
		/** The member state's two-letter code, such as `FR`. */
		code: string;
		/** Whether the committee already has it, which shows "added" in place of "+". */
		isAdded: boolean;
		/** Called with the member's value, `country:FR`, when "+" is pressed with JavaScript. */
		onAdd: (value: string) => void;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { code, isAdded, onAdd }: Props = $props();

	// `$derived` works these out again whenever `code` changes.
	const name = $derived(countryName(code));
	const value = $derived(countryMember(code).value);

	/*
		Without JavaScript "+" posts the whole form to `?/addMember`, carrying
		`add=country:FR`. With it the click is stopped here, before the form is
		sent, and the committee changes in the browser instead.
	*/
	function handleAdd(event: MouseEvent) {
		event.preventDefault();
		onAdd(value);
	}
</script>

<!-- One member state the search lets through: its flag, its name, and "+" or "added". -->
<div class="{QUICK_ROW_CLASSES} {isAdded ? 'text-ink-400' : ''}">
	<span class={isAdded ? 'opacity-40' : ''}>
		<SeatFlag seat={{ id: code, name, countryCode: code }} size="row" />
	</span>
	<span class="min-w-0 truncate">{name}</span>
	{#if isAdded}
		<span class="ml-auto text-small text-ink-600">added</span>
	{:else}
		<button
			type="submit"
			formaction="?/addMember"
			name="add"
			{value}
			aria-label="Add {name}"
			onclick={handleAdd}
			class={QUICK_ICON_BUTTON_CLASSES}
		>
			<Plus size={18} aria-hidden="true" />
		</button>
	{/if}
</div>
