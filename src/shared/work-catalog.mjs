export const WORK_TEAMS = Object.freeze([
  { id: 'finance', label: 'Finance', description: 'Understand the numbers' },
  { id: 'operations', label: 'Operations', description: 'Keep work moving' },
  { id: 'marketing', label: 'Marketing', description: 'Make your story land' },
  { id: 'sales', label: 'Sales', description: 'Move conversations forward' },
  { id: 'analytics', label: 'Analytics', description: 'Find the useful signal' },
  { id: 'engineering', label: 'Engineering', description: 'Explain what you build' },
].map(Object.freeze));

export const WORK_KINDS = Object.freeze([
  { id: 'dashboard', label: 'Dashboard', plural: 'Dashboards', description: 'Turn source data into a clear, interactive view.' },
  { id: 'motion', label: 'Motion', plural: 'Motion', description: 'Explain an idea with a short animated story.' },
  { id: 'document', label: 'Document', plural: 'Documents', description: 'Shape your notes into a useful, structured brief.' },
  { id: 'slides', label: 'Slides', plural: 'Slides', description: 'Build a focused narrative for your next presentation.' },
].map(Object.freeze));

const sourceRule = ' Use only the attached sources and information I provide. Identify missing inputs, label assumptions, and cite the sources for claims and calculations. Do not invent business results.';
const entries = [
  ['finance', 'dashboard', 'Cash flow at a glance', 'Track cash in, cash out, and runway.', 'Build a cash flow dashboard from my attached monthly finance data. Show opening and closing cash, inflows, outflows, and net movement by month. Explain each calculation and flag any missing periods. Include a monthly table and a concise summary of the main drivers.'],
  ['finance', 'motion', 'Explain the quarter', 'Make the financial story easy to follow.', 'Create a 45-second animated explanation of our quarterly financial performance using the provided finance notes. Structure it as context, revenue and cost drivers, cash impact, and decisions for next quarter. Use short captions and make each scene understandable without narration.'],
  ['finance', 'document', 'Budget variance brief', 'Turn actuals versus plan into decisions.', 'Prepare a budget variance brief from the attached actuals and budget. Separate timing differences from persistent changes, show absolute and percentage variances with formulas, and summarize decisions, owners, and open questions.'],
  ['finance', 'slides', 'Board finance update', 'A concise narrative for the board.', 'Draft a six-slide board finance update from the provided source data: executive summary, revenue, margin, cash, risks, and decisions requested. Keep each slide focused on one takeaway and make uncertainty explicit.'],
  ['operations', 'dashboard', 'Delivery health', 'See throughput, delays, and bottlenecks.', 'Build an operations dashboard from my delivery data. Show completed work, on-time delivery, backlog, and cycle time by period. Document the definition and denominator of each metric, surface bottlenecks, and include a table of exceptions.'],
  ['operations', 'motion', 'Show the process', 'Explain a workflow one step at a time.', 'Turn my attached process notes into a short animated walkthrough for a new teammate. Explain the trigger, major steps, owners, handoffs, and what to do when a step fails. Keep the sequence under 60 seconds and distinguish documented steps from open questions.'],
  ['operations', 'document', 'Operating playbook', 'Make repeatable work easier to hand off.', 'Create an operating playbook from the attached notes. Include purpose, scope, roles, prerequisites, numbered steps, exception handling, escalation, and a completion checklist. Highlight missing ownership or service targets for review.'],
  ['operations', 'slides', 'Weekly operations review', 'Bring progress, risks, and next steps together.', 'Create a weekly operations review from the provided status notes and delivery data. Cover outcomes, backlog, incidents, capacity, risks, and the next seven days. Group actions by owner and explain which decisions need leadership input.'],
  ['marketing', 'dashboard', 'Campaign performance', 'Compare spend, reach, and conversion.', 'Build a campaign performance dashboard from the attached campaign export. Compare spend, impressions, clicks, conversions, and cost per conversion by campaign and period. State attribution windows and conversion definitions where supplied, and flag comparisons that are not like-for-like.'],
  ['marketing', 'motion', 'Product launch story', 'Introduce a product in a memorable minute.', 'Create a 45-second animated product launch story using the attached positioning notes. Begin with the audience problem, introduce the product, explain three supported benefits, and end with the provided call to action. Use crisp captions and do not invent customer quotes or performance claims.'],
  ['marketing', 'document', 'Campaign brief', 'Align the audience, message, and measurement.', 'Create a campaign brief from the provided strategy notes. Include objective, audience, insight, core message, deliverables, channel plan, timeline, measurement, and unresolved questions. Separate confirmed facts from proposed creative ideas.'],
  ['marketing', 'slides', 'Launch plan', 'Put the launch story and execution in order.', 'Create a six-slide launch plan using the attached product and marketing notes. Cover audience, positioning, message, channels, rollout timeline, and measurement. Call out owners, dependencies, and any unconfirmed launch dates.'],
  ['sales', 'dashboard', 'Pipeline overview', 'Understand coverage and where deals stall.', 'Create a sales pipeline dashboard from the attached deal export. Show pipeline value and deal count by stage, expected close period, and owner. Explain any weighted-pipeline calculation using supplied stage probabilities and highlight aging deals without inventing forecast certainty.'],
  ['sales', 'motion', 'Customer value story', 'Bring the buyer’s problem and outcome to life.', 'Build a short animated customer value story from my attached account and product notes. Introduce the buyer problem, show the proposed workflow, explain supported benefits, and end with a next step. Label hypothetical outcomes and do not imply a customer endorsement.'],
  ['sales', 'document', 'Account plan', 'Prepare a clear, actionable account strategy.', 'Create an account plan from the provided account notes. Summarize priorities, stakeholders, current situation, opportunities, risks, open questions, and next actions with owners. Distinguish verified customer statements from our hypotheses.'],
  ['sales', 'slides', 'Proposal narrative', 'Connect customer needs to a practical next step.', 'Build a sales proposal deck from the attached customer discovery and product notes. Cover the customer challenge, desired outcomes, proposed approach, scope, timeline, success criteria, and next steps. Leave pricing and terms unspecified unless they are present in the sources.'],
  ['analytics', 'dashboard', 'Product metrics', 'Follow adoption, engagement, and retention.', 'Create a product analytics dashboard from the attached usage data. Show active users, activation, feature adoption, and retention only where the data supports those measures. Specify event definitions, time windows, denominators, and cohort rules, and include a data-quality summary.'],
  ['analytics', 'motion', 'Explain the finding', 'Turn an analysis into a clear visual story.', 'Turn the attached analysis notes into a 45-second animated explanation for a nontechnical audience. Present the question, evidence, main finding, limitations, and recommended next step. Distinguish correlation from causation and show uncertainty where reported.'],
  ['analytics', 'document', 'Experiment readout', 'Document what changed and what you learned.', 'Write an experiment readout from the attached results and design notes. Include hypothesis, assignment, sample size, primary metric, results, uncertainty, guardrails, limitations, and recommendation. Do not calculate significance without the necessary inputs or infer causation from observational data.'],
  ['analytics', 'slides', 'Insight to action', 'Make the evidence useful to decision makers.', 'Create a concise decision deck from the provided analysis. Organize it around the question, data and method, findings, caveats, options, and recommended next steps. Tie each recommendation to evidence and identify where more data is needed.'],
  ['engineering', 'dashboard', 'Release health', 'Track delivery and reliability together.', 'Build a release health dashboard from the attached delivery and incident exports. Show release volume, lead time, deployment failures, and restoration time only where supported. Define each metric, show trends by period, and flag missing or inconsistent timestamps.'],
  ['engineering', 'motion', 'Architecture explainer', 'Show how the pieces work together.', 'Create a short animated architecture explanation from my attached system notes. Walk through the user request, main components, data flow, failure handling, and boundaries. Use plain labels and call out any behavior the source notes do not establish.'],
  ['engineering', 'document', 'Technical decision brief', 'Make tradeoffs and the decision easy to review.', 'Write a technical decision brief from the provided requirements and design notes. Include context, constraints, options, tradeoffs, recommendation, risks, rollout, and validation. Mark assumptions and unresolved questions explicitly.'],
  ['engineering', 'slides', 'Project review', 'Share progress, evidence, and technical decisions.', 'Create an engineering project review deck from the attached project notes. Cover the problem, current design, completed milestones, validation evidence, open risks, next milestones, and decisions needed. Separate planned capabilities from implemented and tested behavior.'],
];

export const WORK_TEMPLATES = Object.freeze(entries.map(([team, kind, title, description, brief]) => Object.freeze({
  id: `${team}-${kind}`, team, kind, title, description, brief: brief + sourceRule, sample: false,
})));

export const WORK_EXAMPLES = Object.freeze([
  { id: 'sample-dashboard', team: 'analytics', kind: 'dashboard', title: 'A clearer view of growth', description: 'Metrics, trends, and the detail behind them.' },
  { id: 'sample-motion', team: 'marketing', kind: 'motion', title: 'From idea to launch', description: 'A short story, told one scene at a time.' },
  { id: 'sample-document', team: 'operations', kind: 'document', title: 'A brief that gets to the point', description: 'Context, decisions, and concrete next steps.' },
  { id: 'sample-slides', team: 'engineering', kind: 'slides', title: 'The next project chapter', description: 'A focused presentation with room to explore.' },
].map(item => Object.freeze({ ...item, sample: true, brief: `Adapt this illustrative ${item.kind} sample for my work. Keep sample data clearly labeled until I attach my own source files. Ask for missing context before making business claims.` })));

export function filterWorkTemplates({ team = 'all', kind = 'all', query = '' } = {}) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return WORK_TEMPLATES.filter(item => (team === 'all' || item.team === team) && (kind === 'all' || item.kind === kind) && terms.every(term => `${item.title} ${item.description} ${item.team} ${item.kind} ${item.brief}`.toLocaleLowerCase().includes(term)));
}

export function createWorkDraft(template, runOptions) {
  return { type: 'create', team: template.team, kind: template.kind, title: template.title, brief: template.brief, ...(runOptions ? { runOptions: { ...runOptions } } : {}), demo: template.sample === true };
}

export function workExportOptions(artifact, capabilities = { mp4: false }) {
  const available = Boolean(artifact);
  return [
    { format: 'html', label: 'Interactive HTML', enabled: available, reason: 'Create an artifact first.' },
    { format: 'json', label: 'Artifact JSON', enabled: available, reason: 'Create an artifact first.' },
    { format: 'md', label: 'Markdown', enabled: available, reason: 'Create an artifact first.' },
    { format: 'csv', label: 'Table CSV', enabled: available && Boolean(artifact?.table?.columns?.length), reason: 'This artifact needs a data table.' },
    { format: 'pdf', label: 'PDF', enabled: available, reason: 'Create an artifact first.' },
    { format: 'mp4', label: 'Motion MP4', enabled: available && artifact?.kind === 'motion' && capabilities.mp4 === true, reason: artifact?.kind !== 'motion' ? 'Available for Motion artifacts.' : 'FFmpeg must be installed to export MP4.' },
  ];
}
