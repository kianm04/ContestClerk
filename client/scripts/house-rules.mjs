// `node scripts/house-rules.mjs`, run by `pnpm verify` as the "House rules" step.
//
// It is the mechanical half of a code review: the rules in AGENTS.md that a
// script can decide on its own, such as "runes only", "no component over 150
// lines" and "a new migration comes with database tests". Found here they cost
// a second, and a human review is left for the things only a reader can judge.
//
// Rules come in two scopes:
//   - The whole tree, for rules about how a file is written. The codebase
//     already follows them, so nothing may drift.
//   - What this branch changed, worked out against the integration branch, for
//     rules about new work such as "this function needs a test". An older gap
//     is somebody else's task and must not block this one.
//
// A `note` is printed and changes nothing. A `FAIL` fails the check.

import { pathToFileURL } from 'node:url';
import {
	exists,
	gitOutput,
	integrationBranch,
	listChangedFiles,
	listFiles,
	read,
	reportRules
} from './repo-files.mjs';

// A component over this many lines has to be split (AGENTS.md).
const SVELTE_HARD_LINE_LIMIT = 150;
// Over this many lines it is only worth a mention.
const SVELTE_SOFT_LINE_LIMIT = 100;
// A template that stacks this many {#if} / {#each} blocks has its inner part
// pulled into a component of its own (AGENTS.md).
const TEMPLATE_NESTING_LIMIT = 3;

/** True for a line that only talks about code, so that a comment about `<slot />` is not a finding. */
function isComment(line) {
	return /^\s*(\*|\/\/|<!--)/.test(line);
}

/** Every line of a file that matches, as "path:line text", ready to print. */
function linesMatching(path, pattern) {
	const found = [];
	read(path)
		.split('\n')
		.forEach((line, index) => {
			if (!isComment(line) && pattern.test(line)) {
				found.push(`${path}:${index + 1}  ${line.trim().slice(0, 90)}`);
			}
		});
	return found;
}

/** The number of lines in a file, for the size limits. */
function lineCount(path) {
	return read(path).split('\n').length;
}

/** Replaces every match with the same number of spaces, so line numbers still line up. */
function blankOut(text, pattern) {
	return text.replace(pattern, (match) => match.replace(/[^\n]/g, ' '));
}

/**
 * The markup of a component with its <script>, its <style> and its comments
 * blanked out, so a rule reads only what is really rendered. Without this the
 * sentence "{#each} inside {#if} inside {#each}", written in a comment to
 * explain why a component was split, counts as the nesting it is warning about.
 */
function markupOnly(text) {
	const withoutScript = blankOut(text, /<script[\s\S]*?<\/script>/g);
	const withoutStyle = blankOut(withoutScript, /<style[\s\S]*?<\/style>/g);
	return blankOut(withoutStyle, /<!--[\s\S]*?-->/g);
}

/**
 * The deepest stack of {#if}, {#each}, {#await} and {#key} blocks in a
 * component's markup, and the line where that depth is first reached.
 * `{:else if ...}` carries on a block rather than opening one, so it does not
 * count, and neither does `{#snippet}`, which starts a scope of its own.
 */
function deepestTemplateBlock(text) {
	let depth = 0;
	let deepest = 0;
	let deepestLine = 0;

	markupOnly(text)
		.split('\n')
		.forEach((line, index) => {
			// A real block always has a space after its name: `{#if ready}`. The
			// `{#each}` somebody typed in prose has a brace there instead.
			for (const tag of line.match(/\{[#/](?:if|each|await|key)[\s}]/g) ?? []) {
				depth += tag[1] === '#' ? 1 : -1;
				if (depth > deepest) {
					deepest = depth;
					deepestLine = index + 1;
				}
			}
		});

	return { depth: deepest, line: deepestLine };
}

/**
 * How deep the same component nested on the integration branch. A file this
 * branch added has nothing to compare against, so it counts as flat. A task
 * owes a flat template for what it wrote, not for what it found.
 */
function nestingBefore(path) {
	const before = gitOutput(['show', `${integrationBranch()}:${path}`]);
	return before === null ? 0 : deepestTemplateBlock(before).depth;
}

/** Every component whose markup reaches the nesting limit, deepest first. */
function deeplyNested(paths) {
	return paths
		.filter(isSvelte)
		.map((path) => ({ path, ...deepestTemplateBlock(read(path)) }))
		.filter((found) => found.depth >= TEMPLATE_NESTING_LIMIT)
		.sort((left, right) => right.depth - left.depth);
}

/**
 * A TypeScript file with its comments blanked out, line structure kept, so a
 * rule reads only the code. A doc comment that quotes `.channel(` or
 * `.on('broadcast'` to explain a design is not a channel.
 */
function codeOnly(text) {
	const withoutBlockComments = blankOut(text, /\/\*[\s\S]*?\*\//g);
	return withoutBlockComments
		.split('\n')
		.map((line) => (isComment(line) ? '' : line))
		.join('\n');
}

/**
 * Every `.channel(` call in a file as `{ line, text }`, the text being the
 * call's arguments with the parentheses balanced, so that a call written over
 * several lines is read whole and an option on its second line still counts.
 */
export function channelCalls(text) {
	const code = codeOnly(text);
	const calls = [];
	for (const match of code.matchAll(/\.channel\(/g)) {
		const start = match.index + match[0].length;
		let depth = 1;
		let end = start;
		while (end < code.length && depth > 0) {
			if (code[end] === '(') depth += 1;
			if (code[end] === ')') depth -= 1;
			end += 1;
		}
		calls.push({
			line: code.slice(0, match.index).split('\n').length,
			text: code
				.slice(start, end - 1)
				.replace(/\s+/g, ' ')
				.trim()
		});
	}
	return calls;
}

/**
 * The `.channel(` calls in a file that uses Realtime broadcast or presence but
 * does not open the channel as private, as `{ line, text }`.
 *
 * Realtime checks `postgres_changes` against Row Level Security on any channel,
 * but on a public channel anybody who knows the topic hears every broadcast and
 * presence message and may send their own. Only `config: { private: true }`
 * makes Realtime ask the policies on `realtime.messages` who may join, hear and
 * speak, which is how `paper-live-channel.ts` works. So a file that listens for
 * broadcast or presence, sends a broadcast or tracks presence must open every
 * channel it opens as private; a file that only hears `postgres_changes` may
 * stay public, since the row policies already decide what it hears.
 */
export function publicChannelsCarryingBroadcastOrPresence(text) {
	const code = codeOnly(text);
	const usesBroadcastOrPresence =
		/\.on(?:<[^>]*>)?\(\s*['"](?:broadcast|presence)['"]|type:\s*['"]broadcast['"]|\.track\(/.test(
			code
		);
	if (!usesBroadcastOrPresence) {
		return [];
	}
	return channelCalls(text).filter((call) => !/\bprivate:\s*true\b/.test(call.text));
}

/** The names of the functions a TypeScript file exports. */
function exportedFunctionNames(text) {
	return [...text.matchAll(/export (?:async )?function (\w+)/g)].map((match) => match[1]);
}

/**
 * The functions a file exports now and did not export on the integration
 * branch. A task owes a test for what it wrote, not for what it found.
 */
function newlyExportedFunctions(path) {
	const before = gitOutput(['show', `${integrationBranch()}:${path}`]) ?? '';
	const alreadyThere = new Set(exportedFunctionNames(before));
	return exportedFunctionNames(read(path)).filter((name) => !alreadyThere.has(name));
}

const allFiles = listFiles();
const changedFiles = listChangedFiles().filter(exists);

// `client/src/lib/components/ui/` and `client/src/lib/utils.ts` are written by the
// shadcn-svelte CLI and never by hand (AGENTS.md), so they are not held to the
// rules about how we write our own files.
const isGenerated = (path) =>
	path.startsWith('client/src/lib/components/ui/') || path === 'client/src/lib/utils.ts';

const isSvelte = (path) =>
	path.startsWith('client/src/') && path.endsWith('.svelte') && !isGenerated(path);
const isSource = (path) =>
	path.startsWith('client/src/') &&
	(path.endsWith('.ts') || path.endsWith('.svelte')) &&
	!isGenerated(path);

// The only application file allowed to import `createServiceRoleClient`: the
// sweep that removes files whose `documents` row is gone (T96). The Stripe
// webhook that would also need it (T32) has not been written; when it is, add
// it here and say in the module itself why it needs a client that ignores Row
// Level Security. A name on this list must be a file that exists, or the rule
// is a promise nobody checks.
const SERVICE_ROLE_CLIENT_USERS = ['client/src/lib/server/orphaned-document-files.ts'];

// Each rule returns the lines it wants to report. A rule that returns nothing passes.
const RULES = [
	{
		name: 'Runes only, no legacy Svelte syntax',
		run: () =>
			allFiles
				.filter(isSvelte)
				.flatMap((path) =>
					linesMatching(
						path,
						/\bexport let\b|^\s*\$:|\son:[a-z]+=|<slot[\s/>]|createEventDispatcher/
					)
				)
	},
	{
		name: 'No `any`',
		run: () =>
			allFiles.filter(isSource).flatMap((path) => linesMatching(path, /:\s*any\b|\bas any\b/))
	},
	{
		name: 'Tokens only, no raw colours',
		run: () =>
			allFiles
				.filter(isSvelte)
				.flatMap((path) =>
					linesMatching(path, /(class|style)=[^>]*(#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\()/)
				)
	},
	{
		name: 'The service role key stays in service-role.ts',
		run: () =>
			allFiles
				.filter(
					(path) =>
						isSource(path) &&
						path !== 'client/src/lib/server/service-role.ts' &&
						path !== 'client/src/lib/server/service-role.test.ts' &&
						!path.startsWith('client/tests/')
				)
				.flatMap((path) => linesMatching(path, /SUPABASE_SERVICE_ROLE_KEY/))
	},
	{
		// A client that ignores Row Level Security is for jobs nobody signed in
		// may do. A new one is a decision to take on purpose, so add it to this list
		// and say why in the module itself.
		name: 'Only the listed modules use the service role client',
		run: () =>
			allFiles
				.filter(
					(path) =>
						isSource(path) &&
						!SERVICE_ROLE_CLIENT_USERS.includes(path) &&
						!path.endsWith('.test.ts')
				)
				.flatMap((path) => linesMatching(path, /from '(\.\/|\$lib\/server\/)service-role'/))
	},
	{
		// See `publicChannelsCarryingBroadcastOrPresence`: a public channel is
		// safe only while it carries `postgres_changes` alone.
		name: 'A Realtime channel that carries broadcast or presence is private',
		run: () =>
			allFiles
				.filter((path) => isSource(path) && !path.endsWith('.test.ts'))
				.flatMap((path) =>
					publicChannelsCarryingBroadcastOrPresence(read(path)).map(
						(call) =>
							`${path}:${call.line}  .channel(${call.text.slice(0, 60)})  opens a public channel in a file that uses broadcast or presence; pass { config: { private: true } }`
					)
				)
	},
	{
		name: 'Server-only code is imported only by server files',
		run: () =>
			allFiles
				.filter(
					(path) => isSvelte(path) || path.endsWith('/+page.ts') || path.endsWith('/+layout.ts')
				)
				.flatMap((path) => linesMatching(path, /from '\$lib\/server/))
	},
	{
		name: `No component over ${SVELTE_HARD_LINE_LIMIT} lines`,
		run: () =>
			allFiles
				.filter(isSvelte)
				.filter((path) => lineCount(path) > SVELTE_HARD_LINE_LIMIT)
				.map((path) => `${path}  ${lineCount(path)} lines, split it`)
	},
	{
		name: `Components this branch touched that are over ${SVELTE_SOFT_LINE_LIMIT} lines`,
		isNote: true,
		run: () =>
			changedFiles
				.filter(isSvelte)
				.filter(
					(path) =>
						lineCount(path) > SVELTE_SOFT_LINE_LIMIT && lineCount(path) <= SVELTE_HARD_LINE_LIMIT
				)
				.map((path) => `${path}  ${lineCount(path)} lines, getting long`)
	},
	{
		name: '<style> blocks this branch touched, which need a reason in a comment',
		isNote: true,
		run: () => changedFiles.filter(isSvelte).flatMap((path) => linesMatching(path, /<style[\s>]/))
	},
	{
		name: `No template this branch nests ${TEMPLATE_NESTING_LIMIT} levels deep`,
		run: () =>
			deeplyNested(changedFiles)
				.filter((found) => found.depth > nestingBefore(found.path))
				.map(
					(found) =>
						`${found.path}:${found.line}  ${found.depth} levels of {#if}/{#each}, pull the inner part into a component`
				)
	},
	{
		name: `Templates that were already ${TEMPLATE_NESTING_LIMIT} levels deep`,
		isNote: true,
		run: () =>
			deeplyNested(allFiles)
				.filter((found) => found.depth <= nestingBefore(found.path))
				.map(
					(found) => `${found.path}:${found.line}  ${found.depth} levels, worth splitting one day`
				)
	},
	{
		name: 'Every exported function this branch adds has a test next to it',
		run: () =>
			changedFiles
				.filter(
					(path) =>
						path.startsWith('client/src/lib/') &&
						path.endsWith('.ts') &&
						!path.endsWith('.test.ts') &&
						!path.endsWith('database.types.ts')
				)
				.flatMap((path) => {
					const testPath = path.replace(/\.ts$/, '.test.ts');
					const names = newlyExportedFunctions(path);
					if (names.length === 0) {
						return [];
					}
					if (!exists(testPath)) {
						return [`${path}  exports ${names.join(', ')} but ${testPath} does not exist`];
					}
					const testText = read(testPath);
					return names
						.filter((name) => !testText.includes(name))
						.map((name) => `${path}  ${name} is never named in ${testPath}`);
				})
	},
	{
		name: 'A new migration comes with database tests',
		run: () => {
			const migrations = changedFiles.filter((path) => path.startsWith('supabase/migrations/'));
			const tests = changedFiles.filter((path) => path.startsWith('client/tests/db/'));
			if (migrations.length === 0 || tests.length > 0) {
				return [];
			}
			return [
				`${migrations.join(', ')}  nothing under client/tests/db/ was added or changed with it`
			];
		}
	},
	{
		name: 'Every SQL function and trigger this branch adds is named in a database test',
		run: () => {
			const written = allFiles
				.filter((path) => path.startsWith('client/tests/db/') && exists(path))
				.map(read)
				.join('\n');
			return changedFiles
				.filter((path) => path.startsWith('supabase/migrations/'))
				.flatMap((path) => {
					const sql = read(path);
					const names = [
						...[...sql.matchAll(/create (?:or replace )?function (?:public\.)?(\w+)/gi)],
						...[...sql.matchAll(/create trigger (\w+)/gi)]
					].map((match) => match[1]);
					return [...new Set(names)]
						.filter((name) => !written.includes(name))
						.map((name) => `${path}  ${name} is in no database test`);
				});
		}
	}
];

// Only when run as a script. The test next to this file imports the rule
// helpers above and must not set off every rule, or end the process, by doing so.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	if (reportRules(RULES)) {
		console.error('\nHouse rules: see AGENTS.md.');
		process.exit(1);
	}
}
