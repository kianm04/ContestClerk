<script lang="ts">
	import { SCHOOL_STEPS } from '$lib/for-organisers';
</script>

<!--
	What a school does, in three numbered steps, under the seat grid's facts.
	It has an id of its own, `schools`, because the ledger's "Delegations"
	row links straight here. An `<ol>` already says to a screen reader that the
	steps are numbered, so the drawn numbers are hidden from it.
-->
<div id="schools" class="mt-14 scroll-mt-20 border-t border-line pt-8">
	<h3 class="text-h3 text-ink-900">What a school does</h3>

	<ol class="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))] gap-x-10 gap-y-5">
		{#each SCHOOL_STEPS as step, index (step.title)}
			<li class="flex gap-3.5">
				<span
					aria-hidden="true"
					class="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-small font-semibold text-brand-900 tabular-nums"
				>
					{index + 1}
				</span>
				<div class="min-w-0 pt-1">
					<h4 class="text-h3 text-ink-900">{step.title}</h4>
					<p class="mt-0.5 text-small text-ink-600">{step.detail}</p>
				</div>
			</li>
		{/each}
	</ol>
</div>
