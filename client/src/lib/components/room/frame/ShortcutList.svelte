<script lang="ts">
	import { KEY_LIST } from '$lib/console-keys';
</script>

<!--
	Every key of the chair console, as a list of terms: the key, what it does
	and where it works (`$lib/console-keys.ts`, the table under "Keys" in
	`05-pages/chair/committee-room.md`). The committee menu shows it, and "?"
	opens the menu at it.
-->
<dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 px-3 py-2 text-small">
	<!-- Each row's keys are unique in the list, so they key their own row. -->
	{#each KEY_LIST as row (row.keys)}
		<dt>
			<kbd
				class="inline-block rounded border border-line bg-neutral-100 px-1.5 py-0.5 font-sans leading-none font-medium whitespace-nowrap text-ink-600"
			>
				{row.keys}
			</kbd>
		</dt>
		<dd class="text-ink-900">
			{row.does}
			<span class="text-ink-600">· {row.where}</span>
		</dd>
	{/each}
</dl>
