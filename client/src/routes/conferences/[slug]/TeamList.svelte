<script lang="ts">
	import IdCard from '@lucide/svelte/icons/id-card';
	import PersonRow from '$lib/components/PersonRow.svelte';
	import Section from '$lib/components/Section.svelte';

	/**
	 * One member of the conference's team, exactly as `getConferencePage`
	 * returned it. The shape is written out here rather than imported from
	 * `$lib/server/team.ts`, because everything under `$lib/server` only runs on
	 * the server and a component may not import from it at all, not even a type.
	 */
	type TeamMember = {
		userId: string;
		fullName: string;
		/** Where their picture sits in the `public-media` bucket, or `null` for initials. */
		avatarPath: string | null;
		/** The name of the public role they hold, such as "Organiser" or "Chair". */
		roleName: string;
		/** What the organisers call them, such as "Secretary-General", or `null`. */
		title: string | null;
	};

	type Props = {
		team: TeamMember[];
	};

	let { team }: Props = $props();

	/**
	 * The quiet line under a name: their title when they have one, their role
	 * otherwise. The role is named as the conference named it, because a
	 * conference's roles are its own (`docs/roles-and-permissions.md`).
	 */
	function subtitleFor(member: TeamMember): string {
		return member.title ?? member.roleName;
	}
</script>

<!--
	Nothing at all when there is nobody to show, because
	`05-pages/public/conference.md` says an empty team hides the section. The list
	holds the people in the roles the conference marks as public, and it is
	empty for anybody the `conference_role_members` select policy does not let
	read them.
-->
{#if team.length > 0}
	<Section title="Team" icon={IdCard}>
		<ul>
			<!-- The `(member.userId)` key lets Svelte reuse rows instead of rebuilding them. -->
			{#each team as member (member.userId)}
				<li>
					<PersonRow
						name={member.fullName}
						subtitle={subtitleFor(member)}
						imagePath={member.avatarPath}
					/>
				</li>
			{/each}
		</ul>
	</Section>
{/if}
