import type {CSSProperties} from 'react';
import {
  Activity, AppWindow, AudioLines, BookOpen, Bot, Box, BriefcaseBusiness, CalendarDays,
  ChartNoAxesCombined, Cloud, CodeXml, CreditCard, Database, FileText,
  Files, FolderOpen, GitBranch, Globe, GraduationCap, Hash, Image,
  Layers, LayoutTemplate, Mail, MapPin, MessageCircle, MessagesSquare, Monitor, NotebookPen, Palette, Plug, Presentation,
  Puzzle, Search, Server, Shapes, ShieldCheck, Sparkles, Table2,
  Terminal, TestTubeDiagonal, Users, Workflow, Wrench,
} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import type {ExtensionKind} from '../shared/extension-catalog-types';

type IconStyle = {glyph: LucideIcon; color: string};
// Inline even larger marks so masks also render reliably from packaged file: pages.
const brandAssets = import.meta.glob<string>('./assets/extension-icons/*.svg', {eager: true, query: '?url&inline', import: 'default'});
const brandMatchers: Array<[RegExp, string, string]> = [
  [/\bgithub\b/, 'github', 'var(--text, #ececec)'],
  [/\bgitlab\b/, 'gitlab', '#FC6D26'],
  [/\bgmail\b/, 'gmail', '#EA4335'],
  [/google ?calendar/, 'googlecalendar', '#4285F4'],
  [/google ?drive/, 'googledrive', '#4285F4'],
  [/google ?docs/, 'googledocs', '#4285F4'],
  [/google ?sheets/, 'googlesheets', '#34A853'],
  [/google ?slides/, 'googleslides', '#FBBC04'],
  [/\bfigma\b/, 'figma', '#F24E1E'],
  [/\bnotion\b/, 'notion', 'var(--text, #ececec)'],
  [/\bdropbox\b/, 'dropbox', '#0061FF'],
  [/\bbox\b/, 'box', '#0061D5'],
  [/\blinear\b/, 'linear', '#5E6AD2'],
  [/\bstripe\b/, 'stripe', '#635BFF'],
  [/\bhubspot\b/, 'hubspot', '#FF7A59'],
  [/\bsupabase\b/, 'supabase', '#3FCF8E'],
  [/\bsentry\b/, 'sentry', 'var(--text, #ececec)'],
  [/\bvercel\b/, 'vercel', 'var(--text, #ececec)'],
  [/\bnetlify\b/, 'netlify', '#00C7B7'],
  [/\bpostgres(?:ql)?\b/, 'postgresql', '#4169E1'],
  [/\bmongodb\b/, 'mongodb', '#47A248'],
  [/\bredis\b/, 'redis', '#FF4438'],
  [/\bbrave\b/, 'brave', '#FB542B'],
  [/hugging ?face/, 'huggingface', '#FFD21E'],
  [/\basana\b/, 'asana', '#F06A6A'],
  [/\batlassian\b/, 'atlassian', '#0052CC'],
  [/\bjira\b/, 'jira', '#0052CC'],
  [/\btodoist\b/, 'todoist', '#E44332'],
  [/\bobsidian\b/, 'obsidian', '#7C3AED'],
  [/\bcloudflare\b/, 'cloudflare', '#F38020'],
];
const styles: Record<string, IconStyle> = {
  code: {glyph: CodeXml, color: '#78a9ee'},
  git: {glyph: GitBranch, color: '#b4b8c5'},
  mail: {glyph: Mail, color: '#e58d87'},
  calendar: {glyph: CalendarDays, color: '#7ba8eb'},
  files: {glyph: Files, color: '#8abf94'},
  folder: {glyph: FolderOpen, color: '#86abe8'},
  chat: {glyph: MessageCircle, color: '#9ba6e5'},
  channels: {glyph: Hash, color: '#bd98d5'},
  design: {glyph: Shapes, color: '#d89aaf'},
  image: {glyph: Image, color: '#b298da'},
  audio: {glyph: AudioLines, color: '#c2a3db'},
  search: {glyph: Search, color: '#87b8ce'},
  web: {glyph: Globe, color: '#7eb8ca'},
  notebook: {glyph: NotebookPen, color: '#bdaf98'},
  docs: {glyph: BookOpen, color: '#8cabe0'},
  document: {glyph: FileText, color: '#83a9e0'},
  spreadsheet: {glyph: Table2, color: '#88bc99'},
  slides: {glyph: Presentation, color: '#d8ad75'},
  tasks: {glyph: Layers, color: '#aaa0df'},
  team: {glyph: Users, color: '#dcab85'},
  business: {glyph: BriefcaseBusiness, color: '#9bb8d0'},
  billing: {glyph: CreditCard, color: '#ab9bdd'},
  database: {glyph: Database, color: '#83b7ad'},
  cloud: {glyph: Cloud, color: '#89b3db'},
  security: {glyph: ShieldCheck, color: '#8ab3cf'},
  test: {glyph: TestTubeDiagonal, color: '#91bd9d'},
  workflow: {glyph: Workflow, color: '#c0a4d6'},
  terminal: {glyph: Terminal, color: '#9db9a1'},
  analytics: {glyph: ChartNoAxesCombined, color: '#d1ad80'},
  travel: {glyph: MapPin, color: '#d7ad72'},
  learning: {glyph: GraduationCap, color: '#9da8d8'},
  assistant: {glyph: Bot, color: '#82b6ce'},
  app: {glyph: AppWindow, color: '#9dabc7'},
  skills: {glyph: Sparkles, color: '#d5b078'},
  plugins: {glyph: Puzzle, color: '#ac9cd5'},
  connectors: {glyph: Plug, color: '#84b6ad'},
  mcp: {glyph: Server, color: '#85aee0'},
  hooks: {glyph: Workflow, color: '#c0a4d6'},
  tools: {glyph: Wrench, color: '#a6b0c4'},
  layout: {glyph: LayoutTemplate, color: '#d89aaf'},
  'file-text': {glyph: FileText, color: '#83a9e0'},
  presentation: {glyph: Presentation, color: '#d8ad75'},
  table: {glyph: Table2, color: '#88bc99'},
  messages: {glyph: MessagesSquare, color: '#9ba6e5'},
  server: {glyph: Server, color: '#85aee0'},
  puzzle: {glyph: Puzzle, color: '#ac9cd5'},
  box: {glyph: Box, color: '#9db0c8'},
  shield: {glyph: ShieldCheck, color: '#8ab3cf'},
  monitor: {glyph: Monitor, color: '#89b3db'},
  palette: {glyph: Palette, color: '#d89aaf'},
  'book-open': {glyph: BookOpen, color: '#8cabe0'},
  activity: {glyph: Activity, color: '#8abf94'},
  chart: {glyph: ChartNoAxesCombined, color: '#d1ad80'},
};

// Category fallbacks are not imitations of publisher logos. Brand SVGs above
// are bundled from a pinned Simple Icons revision; provenance is beside them.
const matchers: Array<[RegExp, string]> = [
  [/github|gitlab|bitbucket|\bgit\b|pull request/, 'git'],
  [/gmail|outlook email|icloud mail|\bemail\b|\bmail\b/, 'mail'],
  [/calendar|scheduled/, 'calendar'],
  [/google drive|\bdrive\b|sharepoint|onedrive/, 'files'],
  [/dropbox|\bbox\b|filesystem|file system/, 'folder'],
  [/slack|discord/, 'channels'],
  [/teams|telegram|whatsapp|chat/, 'chat'],
  [/figma|canva|design|diagram|shapes/, 'design'],
  [/image|photo|artwork/, 'image'],
  [/audio|music|sonos|speech|voice/, 'audio'],
  [/notion|obsidian|evernote|notebook|memory/, 'notebook'],
  [/google sheets|spreadsheet|excel/, 'spreadsheet'],
  [/google slides|presentation|powerpoint/, 'slides'],
  [/google docs|document|\bpdf\b|\bword\b/, 'document'],
  [/context7|documentation|\bdocs\b|reference/, 'docs'],
  [/linear|jira|trello|asana|todo|task/, 'tasks'],
  [/contacts|hubspot|salesforce|crm|gusto|people/, 'team'],
  [/stripe|paypal|quickbooks|payment|billing|accounting/, 'billing'],
  [/supabase|postgres|sqlite|mysql|mongodb|redis|database/, 'database'],
  [/cloud|aws|azure|vercel|netlify|deploy/, 'cloud'],
  [/security|snyk|audit|threat|vulnerability/, 'security'],
  [/playwright|testing|\btest\b/, 'test'],
  [/browser|website|\bweb\b|sites/, 'web'],
  [/search|research|brave|tavily|exa/, 'search'],
  [/sentry|analytics|monitoring|metrics/, 'analytics'],
  [/expedia|tripsy|travel|maps/, 'travel'],
  [/learning|education|course/, 'learning'],
  [/superpowers|automation|workflow|hooks/, 'workflow'],
  [/terminal|shell|command/, 'terminal'],
  [/openai|developer|coding|\bcode\b/, 'code'],
  [/hugging face|agent|assistant/, 'assistant'],
  [/business/, 'business'],
];

function resolveStyle(icon: string | undefined, title: string | undefined, kind: ExtensionKind): IconStyle {
  const key = icon?.trim().toLowerCase();
  if (key && Object.hasOwn(styles, key)) return styles[key];
  const label = `${key ?? ''} ${title ?? ''}`.toLowerCase().replace(/[-_]/g, ' ');
  const match = matchers.find(([pattern]) => pattern.test(label));
  return styles[match?.[1] ?? kind] ?? styles.plugins;
}

export function ExtensionIcon({icon, title, kind = 'plugins', size = 20, className = ''}: {
  icon?: string;
  title?: string;
  kind?: ExtensionKind;
  size?: number;
  className?: string;
}) {
  const label = `${icon ?? ''} ${title ?? ''}`.toLowerCase().replace(/[-_]/g, ' ');
  // "box" is also the catalog's generic 3D-model glyph. Only an actual Box
  // service title may select that brand, never the generic metadata key alone.
  const isBoxService = /^box(?:$|(?:\s|[-:(])+(?:mcp|connector|integration|content|cloud|official)\b)/i.test(title?.trim() ?? '');
  const brand = brandMatchers.find(([pattern, slug]) => slug === 'box' ? isBoxService : pattern.test(label));
  const asset = brand && brandAssets[`./assets/extension-icons/${brand[1]}.svg`];
  const {glyph: Glyph, color} = resolveStyle(icon, title, kind);
  return <span className={`extension-brand-icon${className ? ` ${className}` : ''}`} aria-hidden="true" style={{'--extension-icon-color': asset ? brand![2] : color} as CSSProperties}>
    {asset ? <span className="extension-brand-symbol" style={{width: size, height: size, display: 'block', backgroundColor: 'currentColor', mask: `url("${asset}") center / contain no-repeat`, WebkitMask: `url("${asset}") center / contain no-repeat`}}/> : <Glyph size={size} strokeWidth={1.7}/>}
  </span>;
}
