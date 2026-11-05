<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import SeatFlag from '$lib/components/room/floor/SeatFlag.svelte';
	import type { QuickSessionMember } from '$lib/quick-session';
	import { QUICK_ICON_BUTTON_CLASSES, QUICK_ROW_CLASSES } from '$lib/quick-session-classes';

	type Props = {
		/** The member this row shows and carries. */
		member: QuickSessionMember;
		/** Called with the member's value when "×" is pressed with JavaScript. */
		onRemove: (value: string) => void;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { member, onRemove }: Props = $props();

	/*
		Without JavaScript "×" posts the whole form to `?/removeMember`, carrying
		`remove=<the member's value>`. With it the click is stopped here and the
		member leaves the committee in the browser instead.
	*/
	function handleRemove(event: MouseEvent) {
		event.preventDefault();
		onRemove(member.value);
	}
</script>

<!--
	One member of the committee: its flag, or the initials of a member that is
	not a country ("AI" for Amnesty International), its name and "×". The
	hidden field is what carries the member when the form is sent: the draft is
	the form, and nothing is saved until "Start session".
-->
<div class={QUICK_ROW_CLASSES}>
	<input type="hidden" name="member" value={member.value} />
	<SeatFlag
		seat={{ id: member.value, name: member.name, countryCode: member.countryCode }}
		size="row"
	/>
	<span class="min-w-0 truncate">{member.name}</span>
	<button
		type="submit"
		formaction="?/removeMember"
		name="remove"
		value={member.value}
		aria-label="Remove {member.name}"
		onclick={handleRemove}
		class={QUICK_ICON_BUTTON_CLASSES}
	>
		<X size={18} aria-hidden="true" />
	</button>
</div>
