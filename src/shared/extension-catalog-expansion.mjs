// Public package paths verified against upstream GitHub trees/manifests on 2026-10-28.
// These are reviewable packages and setup guides, not compatibility certifications.
const bundle=(repo,path,title,description,kind,category,icon)=>({
 id:`${kind==='skills'?'skill':'plugin'}:${repo}:${path}`,title,description,summary:description,kind,source:'recommended',publisher:repo.split('/')[0],
 homepage:`https://github.com/${repo}/tree/main/${path}`,tags:[category,title],category,icon,popular:false,
 compatibility:'unverified',setup:'Review the selected package, license, host-specific tools and dependencies. MuseBench validates the downloaded files before offering installation.',
 package:{repo,ref:'main',path,kind:kind==='skills'?'skill':'plugin'},provenance:{source:repo,url:`https://github.com/${repo}/tree/main/${path}`},
});
const skills=[
 ['accessibility-compliance/skills/screen-reader-testing','Screen reader testing','Check interfaces with assistive technology.','quality','test'],
 ['accessibility-compliance/skills/wcag-audit-patterns','Accessibility audits','Review accessibility issues and remediation patterns.','quality','layout'],
 ['backend-development/skills/api-design-principles','API design','Design clear, consistent service interfaces.','developer-tools','code'],
 ['backend-development/skills/architecture-patterns','Architecture patterns','Organize backend boundaries and responsibilities.','developer-tools','code'],
 ['backend-development/skills/microservices-patterns','Microservices patterns','Plan service boundaries and distributed communication.','cloud','cloud'],
 ['backend-development/skills/event-store-design','Event store design','Structure event history and replayable data.','data','database'],
 ['backend-development/skills/temporal-python-testing','Temporal workflow testing','Test durable Python workflows and failure scenarios.','quality','test'],
 ['api-scaffolding/skills/fastapi-templates','FastAPI templates','Build Python APIs from reusable project patterns.','developer-tools','code'],
 ['agent-teams/skills/task-coordination-strategies','Task coordination','Plan dependencies and responsibilities across agents.','ai','assistant'],
 ['agent-teams/skills/multi-reviewer-patterns','Multiple reviewer patterns','Organize independent reviews and reconcile findings.','quality','workflow'],
];
const plugins=[
 ['debugging-toolkit','Debugging toolkit','Investigate errors with structured debugging workflows.','quality','test'],
 ['unit-testing','Unit testing','Create and improve focused regression tests.','quality','test'],
 ['data-engineering','Data engineering','Develop pipelines, transformations and data workflows.','data','database'],
 ['observability-monitoring','Observability','Work with monitoring, diagnostics and service health.','cloud','analytics'],
 ['kubernetes-operations','Kubernetes operations','Plan and troubleshoot container orchestration.','cloud','cloud'],
 ['cicd-automation','CI/CD automation','Build and refine continuous delivery workflows.','cloud','workflow'],
 ['code-refactoring','Code refactoring','Restructure code while preserving behavior.','developer-tools','code'],
 ['dependency-management','Dependency management','Review and maintain project dependencies.','developer-tools','box'],
 ['llm-application-dev','AI application development','Build retrieval, model and agent application workflows.','ai','assistant'],
 ['code-documentation','Code documentation','Explain code and develop technical documentation.','documents','docs'],
];
const services=[
 ['chrome-devtools','Chrome DevTools','Inspect browser performance, network activity and page behavior.','https://github.com/ChromeDevTools/chrome-devtools-mcp','quality','web'],
 ['neo4j','Neo4j','Explore graph schemas and query connected data.','https://github.com/neo4j/mcp','data','database'],
 ['grafana','Grafana','Explore dashboards, metrics and operational context.','https://github.com/grafana/mcp-grafana','cloud','analytics'],
 ['firecrawl','Firecrawl','Search and extract useful content from websites.','https://github.com/firecrawl/firecrawl-mcp-server','research','search'],
 ['posthog','PostHog','Work with product analytics, experiments and feature flags.','https://github.com/PostHog/posthog/blob/master/services/mcp/README.md','business','analytics'],
];
export const EXPANDED_EXTENSIONS=[
 ...skills.map(([path,title,description,category,icon])=>bundle('wshobson/agents',`plugins/${path}`,title,description,'skills',category,icon)),
 ...[
  ['acquire-codebase-knowledge','Codebase exploration','Map an unfamiliar repository and its architecture.','developer-tools','code'],
  ['documentation-writer','Documentation writer','Draft and refine technical documentation.','documents','docs'],
  ['devops-rollout-plan','Deployment planning','Prepare deployment stages and recovery plans.','cloud','cloud'],
  ['javascript-typescript-jest','JavaScript testing','Develop Jest tests for JavaScript and TypeScript.','quality','test'],
  ['python-mcp-server-generator','Python MCP development','Create MCP servers using Python tooling.','ai','server'],
 ].map(([path,title,description,category,icon])=>bundle('github/awesome-copilot',`skills/${path}`,title,description,'skills',category,icon)),
 ...plugins.map(([path,title,description,category,icon])=>bundle('wshobson/agents',`plugins/${path}`,title,description,'plugins',category,icon)),
 ...services.flatMap(([id,title,description,homepage,category,icon])=>['mcp','connectors'].map(kind=>({
  id:`${kind}:guide:${id}`,title,description,summary:description,kind,source:'recommended',publisher:title,homepage,tags:[category,title],category,icon,popular:false,
  compatibility:'setup-required',setup:'Follow the publisher’s current setup instructions. Runtime dependencies, credentials and permissions must be configured for MuseBench; no automatic connection is claimed.',provenance:{source:`${title} documentation`,url:homepage},
 }))),
 ...[
  ['whitespace','Check whitespace','git diff --check','Catch whitespace errors in the current changes.','quality'],
  ['staged-check','Check staged changes','git diff --cached --check','Check staged changes before creating a commit.','quality'],
  ['changed-files','List changed files','git diff --name-only','Review which tracked files changed during the task.','workflows'],
  ['change-size','Summarize change size','git diff --numstat','Inspect added and removed lines across tracked files.','workflows'],
  ['branch-context','Check branch context','git branch --show-current','Read the current branch before starting a task.','workflows'],
  ['last-commit','Review latest commit','git log -1 --oneline','Read the latest commit for repository context.','workflows'],
 ].map(([id,title,command,description,category])=>({
  id:`hook:${id}`,title,description,summary:description,kind:'hooks',source:'recommended',publisher:'MuseBench',homepage:'https://github.com/FahadArfin/MuseBench',tags:['git',category],category,icon:'git',popular:false,compatibility:'template',setup:'Requires Git and a Git project. Adds an editable draft; nothing runs until you review and save it.',hook:{event:id==='branch-context'||id==='last-commit'?'UserPromptSubmit':'Stop',command},provenance:{source:'MuseBench templates',url:'https://github.com/FahadArfin/MuseBench'},
 })),
];
