import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

export type InstallTarget = 'openclaw' | 'hermes';

export type InstallOptions = {
  workspace?: string;
  global?: boolean;
  force?: boolean;
  dryRun?: boolean;
};

export type InstallResult = {
  target: InstallTarget;
  skillDir: string;
  files: string[];
  dryRun: boolean;
};

const SKILL_NAME = 'openclaw-browser-bridge';

function parseOptionValue(args: string[], name: string) {
  const inline = args.find(arg => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}

export function parseInstallArgs(args: string[]) {
  const targets = args.filter(arg => !arg.startsWith('--')) as InstallTarget[];
  const target = targets[0];
  const validTargets = new Set(['openclaw', 'hermes', 'all']);
  if (!target || !validTargets.has(target)) {
    throw new Error('Usage: install <openclaw|hermes|all> [--global] [--workspace <path>] [--force] [--dry-run]');
  }
  return {
    target,
    options: {
      workspace: parseOptionValue(args, '--workspace'),
      global: args.includes('--global'),
      force: args.includes('--force'),
      dryRun: args.includes('--dry-run'),
    } satisfies InstallOptions,
  };
}

function skillDirFor(target: InstallTarget, options: InstallOptions) {
  if (options.workspace) {
    const workspace = resolve(options.workspace);
    return target === 'openclaw'
      ? join(workspace, 'skills', SKILL_NAME)
      : join(workspace, '.hermes', 'skills', SKILL_NAME);
  }

  if (target === 'openclaw') {
    return options.global
      ? join(homedir(), '.openclaw', 'skills', SKILL_NAME)
      : join(process.cwd(), 'skills', SKILL_NAME);
  }

  return join(homedir(), '.hermes', 'skills', SKILL_NAME);
}

function skillContent(target: InstallTarget) {
  const metadata = target === 'hermes'
    ? `metadata:
  hermes:
    tags: [browser, automation, cli, openclaw]
    category: browser-automation
    requires_toolsets: [terminal]`
    : `metadata: {"openclaw":{"tags":["browser","automation","cli"],"requires":{"bins":["node"]},"homepage":"https://github.com/alexandre-leng/openclaw-browser-bridge"}}`;

  return `---
name: ${SKILL_NAME}
description: Control a local browser through OpenClaw Browser Bridge using CLI scripts, numerical page refs, and DOM-first extraction.
version: 1.0.0
platforms: [linux, macos, windows]
${metadata}
---

# OpenClaw Browser Bridge

Use this skill when the task needs reliable browser control from an agent shell: navigate, inspect a page, click numbered refs, type into fields, extract structured data, or run a repeatable browser script.

## Requirements

- The bridge package must be installed or available through \`npx openclaw-browser-bridge\`.
- Start the bridge before issuing browser commands:

\`\`\`bash
npx openclaw-browser-bridge start
\`\`\`

- The default endpoint is \`ws://localhost:8080/ws/browser-bridge\`. Override it with \`BRIDGE_URL\` when needed.

## Fast CLI Loop

Prefer compact batched commands:

\`\`\`bash
npx openclaw-browser-bridge run "navigate https://example.com" "annotate" "click 3" "summary"
\`\`\`

Use a script file for reusable workflows:

\`\`\`bash
npx openclaw-browser-bridge script ./openclaw-script.json
\`\`\`

Valid script shape:

\`\`\`json
{
  "steps": [
    { "type": "navigate", "url": "https://example.com" },
    { "type": "annotate" },
    { "type": "click", "ref": 3 },
    { "type": "summary" }
  ]
}
\`\`\`

## Operating Pattern

1. Use \`annotate\` on unknown pages.
2. Choose an element from the returned numbered refs.
3. Use \`click <ref>\`, \`type <ref> <text>\`, \`press Enter\`, or \`scroll <amount>\`.
4. Verify with \`summary\` or a fresh \`annotate\`.

Refs can go stale after navigation or dynamic page updates. Re-annotate before risky actions.

## Useful Commands

- \`navigate <url>\`: open a page.
- \`search <query>\`: search the web in the active browser.
- \`annotate\`: screenshot metadata plus numbered interactive elements.
- \`click <ref>\`: click a numbered element.
- \`type <ref> <text>\`: clear and type into a numbered input.
- \`visible-text --filter-any=a,b --filter-lines\`: extract matching visible lines.
- \`extract article|table|form|search-results|listings\`: structured extraction.
- \`click-text <text>\`: find visible text and click it with fallback behavior.
- \`timing set consultSpeed=1.5\`: slow browsing cadence for sensitive sites.
- \`antispam\`: check whether the page is warning about rapid automation.

## Safety

Do not use this skill to bypass login, CAPTCHA, rate limits, anti-abuse systems, or site access controls. If \`antispam\` reports a block or the page asks for human verification, pause and ask the user to take over in the live viewer.
`;
}

function promptsContent() {
  return `# OpenClaw Browser Bridge Prompts

## Browser task

Use OpenClaw Browser Bridge to complete this browser task. Start by annotating the page, use numbered refs for interactions, batch related actions, and verify the final state.

## Data extraction

Use OpenClaw Browser Bridge to navigate to the target page and extract structured data. Prefer \`extract table\`, \`extract article\`, \`extract form\`, or \`visible-text\` over raw HTML parsing.

## Script authoring

Create an OpenClaw script JSON file with a \`steps\` array. Each step should use simple CLI command types such as \`navigate\`, \`annotate\`, \`click\`, \`type\`, \`press\`, \`wait\`, \`extract\`, or \`summary\`.
`;
}

export function installForTarget(target: InstallTarget, options: InstallOptions = {}): InstallResult {
  const skillDir = skillDirFor(target, options);
  const files = [
    join(skillDir, 'SKILL.md'),
    join(skillDir, 'PROMPTS.md'),
  ];

  if (!options.dryRun) {
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(files[0], skillContent(target), 'utf8');
    writeFileSync(files[1], promptsContent(), 'utf8');
  }

  return { target, skillDir, files, dryRun: Boolean(options.dryRun) };
}

export function installTargets(target: InstallTarget | 'all', options: InstallOptions = {}) {
  const targets: InstallTarget[] = target === 'all' ? ['openclaw', 'hermes'] : [target];
  return targets.map(t => installForTarget(t, options));
}
