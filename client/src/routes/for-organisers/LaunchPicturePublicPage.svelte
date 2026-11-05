<script lang="ts">
	import { LANDING_DELEGATES_IMAGE_PATH } from '$lib/media';
	import { LAUNCH_COMMITTEES } from '$lib/organiser-start';
</script>

<!--
	The left half of the launch picture: a small public conference page, with
	the university photograph as its banner, the conference's name in the
	serif, who runs it, when and where, and its first committees. The banner is
	cut from the bottom of the photograph (`object-[50%_100%]`), where the
	building stands. Its `alt` is empty because the whole picture is hidden
	from screen readers and described in words beside it.

	Each committee's name is its own `{#each}` key, being different for every
	chip.
-->
<div class="flex min-w-0 flex-[1_1_13rem] flex-col bg-surface px-4 pt-4 pb-5">
	<span class="text-caption font-medium text-ink-600">Your public page</span>
	<img
		src={LANDING_DELEGATES_IMAGE_PATH}
		alt=""
		class="mt-2.5 aspect-[16/7] w-full rounded-lg object-cover object-[50%_100%]"
	/>
	<span class="mt-3 font-display text-[1.125rem]/[1.5rem] font-semibold">Northbridge MUN 2027</span>
	<span class="text-small text-ink-600">Northbridge MUN Society</span>
	<span class="mt-1 text-small text-ink-600">5 – 7 Mar 2027 · Northbridge University</span>

	<div class="mt-3 flex flex-wrap gap-1.5">
		{#each LAUNCH_COMMITTEES as committee (committee)}
			<span class="rounded-lg bg-brand-50 px-2 py-1 text-caption font-medium text-brand-700">
				{committee}
			</span>
		{/each}
		<span class="rounded-lg bg-neutral-100 px-2 py-1 text-caption font-medium text-ink-600">
			+5
		</span>
	</div>
</div>
