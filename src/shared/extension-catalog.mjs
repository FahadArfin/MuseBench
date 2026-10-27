// Portable metadata only: browsing these entries never activates tools or commands.
const base = (id, title, description, kind, publisher, homepage, extras = {}) => ({
  id, title, description, kind, source: 'recommended', publisher, homepage, tags: [],
  compatibility: 'unverified', setup: 'Review the exact downloaded package and its dependencies before installation.',
  provenance: { source: publisher, url: homepage }, ...extras,
});
const skill = (repo, name, description) => base(`skill:${repo}:${name}`, name, description, 'skills', repo.split('/')[0], `https://github.com/${repo}/tree/main/skills/${name}`, {
  package: { repo, ref: 'main', path: `skills/${name}`, kind: 'skill' },
});
const remote = (name, title, url, homepage, oauth = true) => base(`mcp:${name}`, title, `${title} tools through the provider's remote MCP service.`, 'mcp', title, homepage, {
  compatibility: 'recipe', setup: oauth ? 'Requires a provider account. Add the reviewed server, then sign in; tool readiness requires verification.' : 'Add the reviewed HTTPS server. Service availability and limits apply.',
  recipe: { name, transport: 'http', url, oauth },
});
export const CURATED_EXTENSIONS = [
  ...[
    ['gh-fix-ci', 'Diagnose failing GitHub Actions checks; requires authenticated GitHub CLI and Python scripts.'],
    ['gh-address-comments', 'Address GitHub pull request review comments; requires authenticated GitHub CLI and Python scripts.'],
    ['security-best-practices', 'Security guidance for supported languages and frameworks.'],
    ['security-threat-model', 'Develop repository-grounded security threat models.'],
    ['security-ownership-map', 'Analyze repository ownership and security exposure; helper dependencies require review.'],
    ['playwright', 'Automate a browser with Playwright; requires the documented browser and runtime prerequisites.'],
    ['pdf', 'Read and create PDFs; requires Python reportlab, pdfplumber, pypdf and Poppler.'],
    ['aspnet-core', 'Build and review ASP.NET Core applications; requires the .NET SDK.'],
    ['winui-app', 'Build Windows applications with WinUI; requires the Windows development toolchain.'],
  ].map(([name, description]) => ({ ...skill('openai/skills', name, description), homepage: `https://github.com/openai/skills/tree/main/skills/.curated/${name}`, provenance: { source: 'OpenAI public skills', url: `https://github.com/openai/skills/tree/main/skills/.curated/${name}` }, package: { repo: 'openai/skills', ref: 'main', path: `skills/.curated/${name}`, kind: 'skill' }, setup: 'Public instructions only. Requires the tools and dependencies named by the skill; Codex-specific capabilities are not supplied by MuseBench.' })),
  ...['hatch-pet', 'define-goal', 'migrate-to-codex'].map(name => base(`setup:openai:${name}`, name, 'Codex-specific workflow requiring host capabilities beyond portable skill instructions.', 'skills', 'OpenAI', 'https://github.com/openai/skills', { compatibility: 'setup-required', setup: 'Requires Codex-specific tools or account features. View upstream instructions; automatic installation is unavailable.' })),
  ...[
    ['frontend-design', 'Create distinctive frontend interfaces.'], ['webapp-testing', 'Test local web applications using browser automation.'],
    ['mcp-builder', 'Build Model Context Protocol servers.'], ['doc-coauthoring', 'Collaboratively draft and refine documents.'],
    ['pdf', 'Work with PDF documents; inspect licensing and helper dependencies.'], ['docx', 'Create and edit Word documents; inspect licensing and dependencies.'],
    ['pptx', 'Create and edit presentations; inspect licensing and dependencies.'], ['xlsx', 'Work with spreadsheets; inspect licensing and dependencies.'],
    ['internal-comms', 'Draft internal updates and communications.'],
  ].map(([name, description]) => skill('anthropics/skills', name, description)),
  ...[
    ['react-best-practices', 'React and Next.js performance guidance.'], ['composition-patterns', 'Composable React component patterns.'],
    ['react-native-skills', 'React Native application guidance.'], ['web-design-guidelines', 'Review websites against interface guidelines.'],
  ].map(([name, description]) => skill('vercel-labs/agent-skills', name, description)),
  ...['code-review', 'commit-commands', 'feature-dev', 'plugin-dev'].map(name => base(`plugin:anthropics:${name}`, name, 'Workflow plugin. Host-specific commands, agents and capabilities require validation.', 'plugins', 'Anthropic', `https://github.com/anthropics/claude-plugins-official/tree/main/plugins/${name}`, { package: { repo: 'anthropics/claude-plugins-official', ref: 'main', path: `plugins/${name}`, kind: 'plugin' } })),
  base('plugin:obra:superpowers', 'Superpowers', 'Development workflow skills and automation; validate host compatibility.', 'plugins', 'obra', 'https://github.com/obra/superpowers', { package: { repo: 'obra/superpowers', ref: 'main', path: '', kind: 'plugin' } }),
  remote('openai-docs', 'OpenAI Docs', 'https://developers.openai.com/mcp', 'https://developers.openai.com/resources/docs-mcp', false),
  remote('context7', 'Context7', 'https://mcp.context7.com/mcp', 'https://context7.com/docs', true),
  remote('linear', 'Linear', 'https://mcp.linear.app/mcp/readonly', 'https://linear.app/docs/mcp'),
  remote('figma', 'Figma', 'https://mcp.figma.com/mcp', 'https://developers.figma.com/docs/figma-mcp-server/'),
  remote('notion', 'Notion', 'https://mcp.notion.com/mcp', 'https://developers.notion.com/docs/mcp'),
  remote('sentry', 'Sentry', 'https://mcp.sentry.dev/mcp', 'https://docs.sentry.io/product/sentry-mcp/'),
  base('mcp:playwright', 'Playwright', 'Browser automation through Microsoft’s local MCP server.', 'mcp', 'Microsoft', 'https://github.com/microsoft/playwright-mcp', {compatibility:'recipe',setup:'Requires Node.js 18+ with npm and a supported browser. First use downloads @playwright/mcp@0.0.83 with npm install scripts disabled, then runs its server as your Windows account. Browser and runtime readiness are not verified by adding it.',recipe:{name:'playwright',transport:'npm',package:'@playwright/mcp',version:'0.0.83'}}),
  ...[
    ['github', 'GitHub', 'https://docs.github.com/en/copilot/customizing-copilot/extending-the-capabilities-of-github-copilot-in-your-organization/using-mcp-servers-in-copilot'],
    ['vercel', 'Vercel', 'https://vercel.com/docs/mcp'], ['cloudflare', 'Cloudflare', 'https://developers.cloudflare.com/agents/model-context-protocol/'],
    ['supabase', 'Supabase', 'https://supabase.com/docs/guides/getting-started/mcp'], ['stripe', 'Stripe', 'https://docs.stripe.com/mcp'],
    ['unreal', 'Unreal Engine', 'https://dev.epicgames.com/documentation/en-us/unreal-engine'],
    ['unity', 'Unity', 'https://docs.unity.com/'], ['fusion', 'Autodesk Fusion', 'https://help.autodesk.com/view/fusion360/ENU/'],
  ].map(([id, title, homepage]) => base(`setup:${id}`, title, `${title} integration setup and compatibility information.`, 'mcp', title, homepage, { compatibility: 'setup-required', setup: 'Requires provider-specific setup or an application bridge. No qualified automatic installation recipe is bundled.' })),
  ...[
    ['project-checks', 'Run project checks', 'Stop', 'npm.cmd test'],
    ['git-changes', 'Inspect Git changes', 'Stop', 'git diff --stat'],
    ['prompt-context', 'Check project context', 'UserPromptSubmit', 'git status --short'],
  ].map(([id, title, event, command]) => base(`hook:${id}`, title, 'Editable project hook draft. Review its command before saving.', 'hooks', 'MuseBench', 'https://github.com/FahadArfin/MuseBench', { compatibility: 'template', setup: 'Adds an unapproved project draft; does not execute or activate a global hook.', hook: { event, command } })),
];
// Account integrations use the same explicit server recipe, never another client's tokens.
const openaiPlaywright = CURATED_EXTENSIONS.find(e => e.id === 'skill:openai/skills:playwright');
openaiPlaywright.compatibility = 'setup-required';
openaiPlaywright.setup = 'Upstream requires Bash and a CODEX_HOME skill wrapper path. Adapt and validate these prerequisites for MuseBench before use.';
delete openaiPlaywright.package;
const figma = CURATED_EXTENSIONS.find(e => e.id === 'mcp:figma');
figma.compatibility = 'setup-required';
figma.setup = 'Figma restricts remote access to approved clients. MuseBench eligibility has not been established; see provider instructions.';
delete figma.recipe;
CURATED_EXTENSIONS.push({ ...figma, id: 'connector:figma', kind: 'connectors' });
CURATED_EXTENSIONS.push(...CURATED_EXTENSIONS.filter(x => x.recipe?.oauth).map(x => ({ ...x, id: `connector:${x.recipe.name}`, kind: 'connectors' })));
export function searchCuratedExtensions({ kind, query = '', cursor } = {}) {
  const offset = cursor ? Number(cursor) : 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000) throw Error('Invalid catalog cursor');
  const needle = String(query).slice(0, 200).toLowerCase();
  const entries = CURATED_EXTENSIONS.filter(x => (!kind || x.kind === kind) && `${x.title} ${x.description} ${x.publisher}`.toLowerCase().includes(needle));
  return { entries: structuredClone(entries.slice(offset, offset + 30)), nextCursor: entries.length > offset + 30 ? String(offset + 30) : null, stale: false, offline: false, fetchedAt: null, errors: [], disclosure: 'Bundled recommendations. Compatibility and account access require validation.' };
}
