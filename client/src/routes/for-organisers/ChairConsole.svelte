<script lang="ts">
	import ChairConsoleFloor from './ChairConsoleFloor.svelte';
	import ChairConsoleHeader from './ChairConsoleHeader.svelte';
	import ChairConsoleList from './ChairConsoleList.svelte';
</script>

<!--
	A drawn chair's console in the Human Rights Council: the committee and the
	roll call along the top, the row of views, then the floor with its clock and
	buttons beside the speakers' list. It is a part of the committee room
	picture, whose parent hides it from screen readers and carries the sentence.

	The floor and the list share one row while there is room and wrap into two
	on a phone. The 1px gap between them shows the grey behind, which draws the
	hairline between them in either arrangement.
-->
<div class="overflow-hidden rounded-xl bg-surface text-small text-ink-900 shadow-card">
	<ChairConsoleHeader />

	<div class="flex flex-wrap gap-px bg-neutral-100">
		<ChairConsoleFloor />
		<ChairConsoleList />
	</div>
</div>
