// Portable metadata only: browsing these entries never activates tools or commands.
import {EXPANDED_EXTENSIONS} from './extension-catalog-expansion.mjs';
const base = (id, title, description, kind, publisher, homepage, extras = {}) => ({
  id, title, description, summary: description, kind, source: 'recommended', publisher, homepage, tags: [kind],
  category: ['skills','plugins','hooks'].includes(kind) ? 'workflows' : 'developer-tools', icon: kind, popular: false,
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
// Provider documentation was checked on 2026-10-28. Recipes configure one reviewed
// endpoint; they do not establish sign-in, tool availability or client eligibility.
const addRemote = (id, name, title, url, homepage, summary, category, tags, setup, oauth = true) => {
  const entry = remote(name, title, url, homepage, oauth);
  Object.assign(entry, { id, description: summary, summary, category, tags, icon: name, setup });
  const index = CURATED_EXTENSIONS.findIndex(item => item.id === id);
  if (index < 0) CURATED_EXTENSIONS.push(entry); else CURATED_EXTENSIONS[index] = entry;
};
[
  ['setup:stripe','stripe','Stripe','https://mcp.stripe.com','https://docs.stripe.com/mcp','Work with Stripe payment and business data.','business',['payments','billing','customers'],'Requires a Stripe account and OAuth consent. Access follows your Stripe role and granted permissions; review available read and write tools before use.'],
  ['mcp:atlassian','atlassian','Atlassian','https://mcp.atlassian.com/v2/mcp','https://support.atlassian.com/atlassian-ai-gateway/docs/get-started-with-the-atlassian-remote-mcp-server/','Work across Jira, Confluence, Loom and Bitbucket.','productivity',['jira','confluence','loom','bitbucket'],'Requires an Atlassian account with access to the chosen apps. OAuth, administrator policies and Rovo usage limits apply.'],
  ['mcp:neon','neon','Neon','https://mcp.neon.tech/mcp','https://neon.com/docs/ai/connect-mcp-clients-to-neon','Inspect and manage Neon Postgres projects for development.','data',['postgres','database','sql'],'Requires a Neon account and OAuth. Neon recommends this server for development and testing, not production; review project access and tools before use.'],
  ['mcp:todoist','todoist','Todoist','https://ai.todoist.net/mcp','https://github.com/Doist/todoist-mcp','Organize Todoist tasks, projects and due dates.','productivity',['tasks','planning','reminders'],'Requires a Todoist account and the provider’s OAuth flow. Review permissions and task-changing tools before use.'],
  ['mcp:intercom','intercom','Intercom','https://mcp.intercom.com/mcp','https://developers.intercom.com/docs/guides/mcp','Work with Intercom customer conversations and support context.','business',['support','customers','conversations'],'Requires an eligible Intercom US-hosted workspace and OAuth authorization. Other workspace regions are not supported by this endpoint; account permissions apply.'],
  ['setup:cloudflare','cloudflare','Cloudflare','https://mcp.cloudflare.com/mcp','https://github.com/cloudflare/mcp-server-cloudflare','Use Cloudflare’s API tools to manage your infrastructure.','developer-tools',['cloud','workers','infrastructure'],'Requires a Cloudflare account and OAuth. Review the accounts and permissions granted; this API server can make infrastructure changes.'],
  ['mcp:cloudflare-docs','cloudflare-docs','Cloudflare Docs','https://docs.mcp.cloudflare.com/mcp','https://github.com/cloudflare/mcp-server-cloudflare','Search Cloudflare documentation for implementation guidance.','research',['cloudflare','documentation','workers'],'Public documentation endpoint; no Cloudflare sign-in is required. It supplies documentation, not access to your Cloudflare resources.',false],
  ['mcp:microsoft-learn','microsoft-learn','Microsoft Learn','https://learn.microsoft.com/api/mcp','https://learn.microsoft.com/en-us/training/support/mcp','Search Microsoft documentation and technical examples.','research',['microsoft','azure','dotnet','documentation'],'Public documentation endpoint using Streamable HTTP; no sign-in is required. It does not grant access to Microsoft 365 or Azure resources.',false],
  ['mcp:airtable','airtable','Airtable','https://mcp.airtable.com/mcp','https://support.airtable.com/articles/9897799762-using-the-airtable-mcp-server','Read and update records across your Airtable bases.','data',['database','tables','records'],'Requires an Airtable account and OAuth. Available on all plans, subject to administrator restrictions and the bases you authorize.'],
  ['mcp:webflow','webflow','Webflow','https://mcp.webflow.com/mcp','https://developers.webflow.com/mcp/reference/getting-started','Work with Webflow sites, CMS content and design tools.','design',['website','cms','design'],'Requires a Webflow account, an existing site and OAuth. Authorization installs Webflow’s MCP Bridge App; live Designer tools also need that app open in the Designer.'],
].forEach(args => addRemote(...args));

const addSetup = (id, title, summary, homepage, requirements, category, tags, icon = id.split(':').at(-1)) => CURATED_EXTENSIONS.push(base(id,title,summary,'connectors',title,homepage,{compatibility:'setup-required',setup:requirements,category,tags,icon}));
[
  ['gmail','Gmail','Read and organize email through Google Workspace tooling.',['email','inbox']],
  ['google-drive','Google Drive','Find files and work with Drive, Docs, Sheets and Slides.',['files','docs','sheets','slides']],
  ['google-calendar','Google Calendar','Find calendar events and coordinate scheduling workflows.',['calendar','scheduling']],
  ['google-contacts','Google Contacts','Find contacts for communication and scheduling workflows.',['contacts','people']],
].forEach(([id,title,summary,tags])=>addSetup(`connector:${id}`,title,summary,'https://developers.google.com/workspace/guides/configure-mcp-servers','Google Workspace MCP is in developer preview and requires enrollment, a Google Cloud project and a registered OAuth client ID/secret. MuseBench does not provision those prerequisites or reuse Codex’s Google connection.','productivity',tags));
[
  ['slack','Slack','Find conversations and work with team messages in Slack.','https://docs.slack.dev/ai/slack-mcp-server/','Slack MCP requires a registered Slack app and confidential OAuth client credentials; dynamic client registration is unsupported. Only eligible marketplace or internal apps can connect. MuseBench does not reuse Codex’s Slack connection.','productivity',['messages','team','communication']],
  ['outlook','Outlook Email','Explore email workflows for a Microsoft 365 account.','https://learn.microsoft.com/en-us/graph/overview','Requires a separately configured Microsoft Graph integration, an Entra application and approved OAuth scopes or administrator consent. No qualified email MCP recipe is bundled; Codex’s account connector is not portable.','productivity',['email','microsoft','office']],
  ['outlook-calendar','Outlook Calendar','Explore scheduling workflows for Microsoft 365 calendars.','https://learn.microsoft.com/en-us/graph/overview','Requires a separately configured Microsoft Graph integration, an Entra application and calendar permissions or administrator consent. MuseBench does not supply Codex’s Microsoft account connector.','productivity',['calendar','microsoft','scheduling']],
  ['teams','Microsoft Teams','Explore team communication and collaboration workflows.','https://learn.microsoft.com/en-us/graph/overview','Requires a separately configured Microsoft Graph integration, an Entra application and Teams permissions, including administrator consent where needed. No qualified automatic Teams server recipe is bundled.','productivity',['teams','microsoft','communication']],
  ['sharepoint','SharePoint','Explore document and site workflows in SharePoint.','https://learn.microsoft.com/en-us/graph/overview','Requires a separately configured Microsoft Graph integration with an Entra application and approved site permissions. No qualified automatic SharePoint server recipe is bundled; choose only the required sites and scopes.','documents',['documents','microsoft','sites']],
  ['canva','Canva','Create, find and edit designs through Canva’s developer tools.','https://www.canva.dev/blog/developers/canva-mcp-ga/','Canva MCP requires a registered app and client secret; client metadata discovery remains subject to provider availability. MuseBench does not provision that confidential OAuth client. Follow Canva’s supported integration setup.','design',['design','presentations','graphics']],
  ['hubspot','HubSpot','Explore customer, sales and CRM workflows with HubSpot.','https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server','HubSpot remote MCP requires your own registered connector client ID and secret. MuseBench does not provision this confidential OAuth client; follow HubSpot’s setup and account-permission requirements.','business',['crm','customers','sales']],
  ['asana','Asana','Explore projects, tasks and team planning in Asana.','https://developers.asana.com/docs/integrating-with-asanas-mcp-server','Asana’s v2 MCP integration requires a pre-registered OAuth client and client secret. MuseBench does not provision this confidential OAuth client; follow the provider’s integration instructions.','productivity',['tasks','projects','planning']],
].forEach(([id,...rest])=>addSetup(`connector:${id}`,...rest));

[
  ['frontend-design','Guide polished interface design and frontend implementation.','design'],
  ['code-simplifier','Simplify changed code while preserving its behavior.','workflows'],
  ['pr-review-toolkit','Apply focused review workflows to pull requests.','workflows'],
  ['claude-md-management','Review and maintain a project’s Claude instruction files.','workflows'],
  ['skill-creator','Create and iterate on reusable skill instructions.','workflows'],
  ['mcp-server-dev','Develop MCP tools and server integrations.','developer-tools'],
  ['playground','Build interactive explorations for explaining ideas.','design'],
].forEach(([name,description,category])=>CURATED_EXTENSIONS.push(base(`plugin:anthropics:${name}`,name,description,'plugins','Anthropic',`https://github.com/anthropics/claude-plugins-official/tree/main/plugins/${name}`,{category,icon:'workflow',tags:['anthropic','workflow',name],package:{repo:'anthropics/claude-plugins-official',ref:'main',path:`plugins/${name}`,kind:'plugin'},setup:'Download the public bundle for native Muse validation. Commands, agents, hooks and host-specific features may be unsupported; installation is offered only if validation succeeds.'})));
CURATED_EXTENSIONS.push(base('plugin:openai:developers','OpenAI Developers','Use OpenAI documentation and public developer workflows.','plugins','OpenAI','https://github.com/openai/openai-developers-for-claude',{category:'developer-tools',icon:'openai',popular:true,tags:['openai','api','documentation'],package:{repo:'openai/openai-developers-for-claude',ref:'main',path:'plugins/openai-developers',kind:'plugin'},setup:'Public Apache-2.0 plugin with docs MCP and skills, subject to native Muse validation. This is separate from Codex’s account-bound OpenAI Platform connector; it does not create or transfer API credentials.'}));
[
  ['grafana-observability','Explore Grafana observability workflows and diagnose service behavior.','developer-tools','activity',['grafana','monitoring']],
  ['reviewops-auditor-benchmark','Audit benchmark results with the public ReviewOps workflow.','research','chart',['benchmark','evaluation']],
  ['react-native-to-swiftui','Guide translation of React Native interfaces into SwiftUI.','developer-tools','code',['react-native','swiftui','ios']],
  ['autodesk-fusion','Explore Autodesk Fusion workflows through its application bridge.','design','box',['cad','fusion','3d']],
].forEach(([name,description,category,icon,tags])=>CURATED_EXTENSIONS.push(base(`plugin:openai-community:${name}`,name,description,'plugins','OpenAI community',`https://github.com/openai/community-plugins/tree/main/plugins/${name}`,{category,icon,tags,package:{repo:'openai/community-plugins',ref:'main',path:`plugins/${name}`,kind:'plugin'},setup:'Public community plugin; review its Apache-2.0 license, host tools, application bridges and account prerequisites. Native validation determines whether this exact package can be installed; no external application is bundled.'})));

[
  ['canvas-design','Create composed visual artwork using the bundled design workflow.','design','palette',['art','graphics','fonts']],
  ['theme-factory','Apply coordinated typography and colors to generated artifacts.','design','palette',['themes','typography','artifacts']],
  ['algorithmic-art','Create generative artwork with p5.js and editable parameters.','design','palette',['p5js','generative','art']],
  ['slack-gif-creator','Prepare animated GIFs sized for sharing in Slack.','design','image',['slack','gif','animation']],
  ['brand-guidelines','Apply Anthropic’s published brand colors and typography.','design','palette',['anthropic','branding','typography']],
  ['skill-creator','Draft and evaluate reusable skills with Anthropic’s authoring workflow.','workflows','book-open',['skills','evaluation','authoring']],
].forEach(([name,description,category,icon,tags])=>CURATED_EXTENSIONS.push({...skill('anthropics/skills',name,description),category,icon,tags,setup:name==='skill-creator'?'The evaluation runner depends on Claude and Python tooling. Review instruction authoring separately; installing this skill does not provide a native Muse evaluation runner.':name==='brand-guidelines'?'These are Anthropic’s brand rules, not MuseBench branding. Review permitted usage, the skill license and Poppins/Lora font requirements before use.':'Review the per-skill license and bundled helpers. Local Python, Node, browser, font or image dependencies may be required; Claude-only tools are not supplied by MuseBench.'}));
[
  ['systematic-debugging','Trace failures to their root cause before changing code.',['debugging','diagnosis']],
  ['test-driven-development','Develop changes through a focused failing-test-first workflow.',['testing','tdd']],
  ['writing-plans','Turn an approved design into concrete implementation steps.',['planning','implementation']],
  ['verification-before-completion','Check fresh execution evidence before claiming work is complete.',['verification','quality']],
].forEach(([name,description,tags])=>CURATED_EXTENSIONS.push({...skill('obra/superpowers',name,description),icon:'workflow',tags,setup:'Public MIT workflow instructions. Review the skill and adapt any host-specific tool names to the capabilities available in MuseBench.'}));
[
  ['jupyter-notebook','Create and organize Jupyter notebooks for experiments and analysis.','data','notebook',['jupyter','python','research'],'Upstream uses Bash exports and helper paths under CODEX_HOME. Adapt those paths and install notebook dependencies before using this workflow in MuseBench.',true],
  ['speech','Create speech audio through the OpenAI Audio API.','documents','audio',['speech','audio','python'],'Requires Python, the OpenAI SDK and your own OpenAI API key with billing. API usage may incur charges. No Codex or Muse subscription credentials are transferred.',false],
  ['transcribe','Transcribe audio files with optional speaker labeling.','documents','audio',['transcription','audio','python'],'Requires Python, the OpenAI SDK and your own OpenAI API key with billing. Check supported file types, request limits and helper dependencies before use.',false],
].forEach(([name,description,category,icon,tags,setup,blocked])=>CURATED_EXTENSIONS.push({...skill('openai/skills',name,description),category,icon,tags,setup,homepage:`https://github.com/openai/skills/tree/main/skills/.curated/${name}`,provenance:{source:'OpenAI public skills',url:`https://github.com/openai/skills/tree/main/skills/.curated/${name}`},compatibility:blocked?'setup-required':'unverified',...(blocked?{package:undefined}:{package:{repo:'openai/skills',ref:'main',path:`skills/.curated/${name}`,kind:'skill'}})}));

// Compact purposes and local icon slugs for the original stable entry IDs.
const presentation = {
  'gh-fix-ci':['Diagnose failing GitHub Actions checks and plan a focused fix.','developer-tools','github',['github','ci','pull requests']],
  'gh-address-comments':['Turn GitHub pull request feedback into concrete code changes.','developer-tools','github',['github','review','pull requests']],
  'security-best-practices':['Review supported languages for security weaknesses and safer defaults.','developer-tools','shield',['security','review']],
  'security-threat-model':['Map a repository’s trust boundaries, threats and mitigations.','developer-tools','shield',['security','architecture']],
  'security-ownership-map':['Analyze code ownership and security-sensitive changes.','developer-tools','shield',['security','git','ownership']],
  'playwright':['Automate and inspect browser interactions.','developer-tools','playwright',['browser','testing','automation']],
  'pdf':['Read, create and inspect PDF documents with local tools.','documents','file-text',['pdf','documents','python']],
  'aspnet-core':['Build and review ASP.NET Core web applications.','developer-tools','code',['dotnet','csharp','web']],
  'winui-app':['Build native Windows interfaces with WinUI.','developer-tools','monitor',['windows','winui','dotnet']],
  'frontend-design':['Create distinctive, polished interfaces for web applications.','design','layout',['frontend','design','web']],
  'webapp-testing':['Exercise local web apps and inspect browser behavior.','developer-tools','playwright',['browser','testing']],
  'mcp-builder':['Design and build Model Context Protocol servers.','developer-tools','server',['mcp','tools','api']],
  'doc-coauthoring':['Develop structured documents through an iterative writing workflow.','documents','file-text',['writing','documentation']],
  'docx':['Create and edit Word documents with formatting intact.','documents','file-text',['word','documents']],
  'pptx':['Create and edit presentation slides and layouts.','documents','presentation',['powerpoint','slides']],
  'xlsx':['Build and edit spreadsheets with formulas and formatting.','documents','table',['excel','spreadsheets']],
  'internal-comms':['Draft internal updates, announcements and team communications.','documents','messages',['communication','writing']],
  'react-best-practices':['Improve React and Next.js performance with practical review guidance.','developer-tools','code',['react','nextjs','frontend']],
  'composition-patterns':['Design flexible React components with clear composition patterns.','developer-tools','code',['react','components','frontend']],
  'react-native-skills':['Build performant React Native screens and interactions.','developer-tools','code',['react-native','mobile']],
  'web-design-guidelines':['Review web interfaces for accessibility and usability.','design','layout',['web','accessibility','review']],
  'code-review':['Review code changes for bugs, correctness and project conventions.','workflows','workflow',['review','quality']],
  'commit-commands':['Prepare Git commits and pull requests through a guided workflow.','workflows','git',['git','commits','pull requests']],
  'feature-dev':['Plan, implement and review a feature across its development stages.','workflows','workflow',['planning','implementation']],
  'plugin-dev':['Develop and validate reusable plugin bundles.','developer-tools','puzzle',['plugins','authoring']],
  'Superpowers':['Plan, test, debug and review changes with structured workflows.','workflows','workflow',['planning','debugging','testing']],
  'OpenAI Docs':['Search official OpenAI API documentation and examples.','research','openai',['openai','documentation','api']],
  'Context7':['Find current library documentation and code examples.','research','context7',['documentation','libraries','code']],
  'Linear':['Read Linear issues, projects and team context.','productivity','linear',['issues','projects','read-only']],
  'Figma':['Use Figma design context and assets in development work.','design','figma',['figma','design','assets']],
  'Notion':['Find and work with pages and databases in Notion.','productivity','notion',['notes','documents','wiki']],
  'Sentry':['Investigate errors and performance issues in Sentry.','developer-tools','sentry',['errors','monitoring','debugging']],
  'Playwright':['Automate and inspect a browser with Microsoft’s local MCP server.','developer-tools','playwright',['browser','testing','automation']],
  'GitHub':['Connect repository, issue and pull request workflows.','developer-tools','github',['git','pull requests','issues']],
  'Vercel':['Explore deployment, project and hosting tools for Vercel.','developer-tools','vercel',['deployment','hosting','web']],
  'Supabase':['Connect Supabase database and project workflows.','data','database',['postgres','database','sql']],
  'Unreal Engine':['Work with Unreal projects through an application-specific bridge.','design','box',['desktop','3d','unreal']],
  'Unity':['Connect Unity editor workflows through a qualified local bridge.','design','box',['desktop','3d','unity']],
  'Autodesk Fusion':['Connect CAD workflows through an Autodesk Fusion bridge.','design','box',['desktop','3d','cad']],
  'Run project checks':['Run your project test command when a Code task stops.','workflows','terminal',['testing','quality']],
  'Inspect Git changes':['Summarize the Git diff when a Code task stops.','workflows','terminal',['git','review']],
  'Check project context':['Read Git status when a new project prompt is submitted.','workflows','terminal',['git','context']],
};
const popularIds = new Set(['skill:openai/skills:gh-fix-ci','skill:anthropics/skills:frontend-design','skill:anthropics/skills:webapp-testing','skill:anthropics/skills:doc-coauthoring','skill:anthropics/skills:docx','skill:anthropics/skills:pptx','skill:anthropics/skills:xlsx','skill:vercel-labs/agent-skills:react-best-practices','skill:obra/superpowers:systematic-debugging','skill:obra/superpowers:test-driven-development','plugin:anthropics:code-review','plugin:anthropics:feature-dev','plugin:anthropics:frontend-design','plugin:obra:superpowers','plugin:openai:developers','mcp:openai-docs','mcp:context7','mcp:linear','mcp:notion','mcp:sentry','mcp:atlassian','mcp:playwright','setup:github','setup:stripe','connector:gmail','connector:google-drive','connector:google-calendar','connector:slack','connector:outlook']);
for (const entry of CURATED_EXTENSIONS) {
  const details = presentation[entry.title];
  if (details) [entry.summary,entry.category,entry.icon,entry.tags] = details;
  entry.description = entry.summary;
  entry.popular = popularIds.has(entry.id);
}
CURATED_EXTENSIONS.find(entry=>entry.id==='setup:github').setup='GitHub’s remote MCP host requires a registered GitHub/OAuth app or an authorization token header. MuseBench does not currently provision that client or collect token headers. The public GitHub CLI skills are a separate option.';
CURATED_EXTENSIONS.find(entry=>entry.id==='setup:github').homepage='https://github.com/github/github-mcp-server/blob/main/docs/host-integration.md';
CURATED_EXTENSIONS.find(entry=>entry.id==='setup:github').provenance.url='https://github.com/github/github-mcp-server/blob/main/docs/host-integration.md';
CURATED_EXTENSIONS.find(entry=>entry.id==='setup:vercel').setup='Vercel restricts remote MCP access to approved clients. MuseBench eligibility has not been established; follow Vercel’s current supported-client guidance. No automatic connection is offered.';
CURATED_EXTENSIONS.find(entry=>entry.id==='setup:supabase').setup='Use a project-scoped, preferably read-only connection according to Supabase’s instructions. Those endpoint query parameters are not yet supported by MuseBench’s server form; an unscoped recipe is not substituted.';

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
  const needle = String(query).slice(0, 200).trim().toLowerCase();
  const entries = CURATED_EXTENSIONS.filter(x => (!kind || x.kind === kind) && [x.title,x.description,x.summary,x.publisher,x.category,...x.tags].join(' ').toLowerCase().includes(needle));
  return { entries: structuredClone(entries.slice(offset, offset + 30)), nextCursor: entries.length > offset + 30 ? String(offset + 30) : null, stale: false, offline: false, fetchedAt: null, errors: [], disclosure: 'Popular is an editorial selection. Each integration’s setup and compatibility are shown in its details.' };
}
CURATED_EXTENSIONS.push(...EXPANDED_EXTENSIONS);
