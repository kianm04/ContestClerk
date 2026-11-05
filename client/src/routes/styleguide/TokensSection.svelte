<script lang="ts">
	import Calendar from '@lucide/svelte/icons/calendar';
	import {
		COLOUR_TOKENS,
		ICON_SIZES,
		SHAPE_TOKENS,
		SPACING_TOKENS,
		TYPE_SCALE
	} from '$lib/styleguide-tokens';
	import Example from './Example.svelte';
	import Group from './Group.svelte';
</script>

<Group id="tokens" title="Tokens">
	<Example name="Colour" props="--color-* in src/routes/layout.css">
		<ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			<!-- Keyed by the token name, which is unique and never changes. -->
			{#each COLOUR_TOKENS as token (token.name)}
				<li class="flex items-center gap-3">
					<span class="h-10 w-10 shrink-0 rounded-control border border-line {token.swatchClass}"
					></span>
					<span class="min-w-0">
						<code class="block text-small text-ink-900">{token.name}</code>
						<span class="block text-small text-ink-600">{token.hex} · {token.use}</span>
					</span>
				</li>
			{/each}
		</ul>
	</Example>

	<Example name="Type scale" props="--text-* in src/routes/layout.css">
		<ul class="grid gap-4">
			{#each TYPE_SCALE as style (style.name)}
				<li>
					<span class={style.className}>{style.name} · Riverside MUN 2027</span>
					<span class="block text-small text-ink-600">
						<code>{style.className}</code> · {style.size} · {style.use}
					</span>
				</li>
			{/each}
		</ul>
	</Example>

	<Example name="Spacing" props="Base unit 4px">
		<ul class="grid gap-3">
			{#each SPACING_TOKENS as token (token.name)}
				<li class="flex items-center gap-3">
					<span class="shrink-0 bg-brand-500 {token.boxClass}"></span>
					<span class="text-small text-ink-600">{token.name} · {token.note}</span>
				</li>
			{/each}
		</ul>
	</Example>

	<Example name="Radius and shadow" props="rounded-2xl, rounded-control, shadow-card">
		<ul class="flex flex-wrap gap-6">
			{#each SHAPE_TOKENS as token (token.name)}
				<li class="text-small text-ink-600">
					<span class="block border border-line {token.boxClass}"></span>
					<span class="mt-2 block text-ink-900">{token.name}</span>
					<span class="block">{token.note}</span>
				</li>
			{/each}
		</ul>
	</Example>

	<Example name="Icons" props="@lucide/svelte, strokeWidth 1.75">
		<ul class="flex flex-wrap items-end gap-6">
			{#each ICON_SIZES as icon (icon.pixels)}
				<li class="text-small text-ink-600">
					<Calendar size={icon.pixels} strokeWidth={1.75} aria-hidden="true" />
					<span class="mt-2 block">{icon.pixels}px · {icon.use}</span>
				</li>
			{/each}

			<li class="text-small text-ink-600">
				<!-- `h-9 w-9` is the 36px square a section title's icon sits in. -->
				<span class="flex h-9 w-9 items-center justify-center rounded-control bg-brand-50">
					<Calendar size={20} strokeWidth={1.75} aria-hidden="true" />
				</span>
				<span class="mt-2 block">36px chip · Behind a section title's 20px icon</span>
			</li>
		</ul>
	</Example>
</Group>
