const command=(id,label,description,icon,kind='action',aliases=[],detail='')=>({id,label,description,icon,kind,aliases,detail});
export const COMMANDS=Object.freeze([
 command('tools','Workspace tools','Find tools and inspect their input/result contracts','Wrench'),
 command('fast','Fast','Use lower reasoning for quicker replies','Zap'),
 command('feedback','Feedback','Prepare a local feedback report','MessageSquare', 'action',['bug']),
 command('goal','Goal','Keep an objective with this chat','Target'),
 command('mcp','MCP','Configure external tool servers','Cable'),
 command('memories','Memories','Instructions to remember across requests','Brain','action',['memory']),
 command('model','Model','Muse provider default','Box','submenu'),
 command('pet','Pet','Desktop companions','CircleUserRound','info',['pets'],'Codex desktop pets are a Codex service. MuseBench does not have a connected pet service; this command does not wake or install one.'),
 command('plan','Plan mode','Turn plan mode on','Lightbulb'),
 command('reasoning','Reasoning','Choose how deeply Muse thinks','Brain','submenu',['effort']),
 command('side','New side chat','Start fresh context linked to the main chat','CirclePlus','action',['btw']),
 command('fork','Fork chat','Carry conversation context into an independent chat','GitBranch','action',['branch']),
 command('sketch','Sketch','Drawing attachments','Pencil','info',[],'This Muse connection accepts text requests. Sketch/image attachment transport is not implemented here. Describe the design in your message or use the official Muse interface for images.'),
 command('status','Status','Chat, connection and sandbox details','Gauge','action',['pwd','cwd','debug-config','warnings']),
 command('context','Project context','Files, instructions and what Muse receives','FileText','action',['files','instructions']),
 command('usage','Usage & billing','Account allowance and billing settings','Gauge','action',['cost','billing','stats','upgrade']),
 command('approval','Approval access','Choose how Muse actions are approved','ShieldCheck','submenu',['permissions','approvals']),
 command('skills','Skills','Browse your installed Muse skills','BookOpen','submenu'),
 command('new','New chat','Start fresh in this project','SquarePen','action',['clear','reset']),
 command('resume','Resume','Find a saved chat','History','action',['search']),
 command('rename','Rename','Give this chat a recognizable name','Pencil'),
 command('review','Review changes','Open the project review','Files','action',['diff']),
 command('preview','Preview','Open the local project preview','PanelRight'),
 command('checks','Checks','Choose a project test or build','CheckCheck','action',['test']),
 command('checkpoints','Checkpoints','View saved revision checkpoints','History'),
 command('copy','Copy response','Copy the last Muse reply','Copy'),
 command('export','Export chat','Save this conversation as Markdown','Download'),
 command('recap','Recap','Draft a request to summarize this chat','ListChecks','action',['compact']),
 command('init','Project instructions','Draft a request for project guidance','FileText'),
 command('settings','Settings','Customize MuseBench','Settings2','action',['config']),
 command('theme','Theme','System, light or dark','SunMoon','submenu'),
 command('connect','Muse connection','Check setup or reconnect','Terminal','action',['login','doctor','debug','setup-default-sandbox','sandbox']),
 command('disconnect','Disconnect','Stop and disconnect Muse','Unplug'),
 command('stop','Stop','Cancel the current Muse request','Square'),
 command('project','Choose project','Open a project folder','FolderOpen','action',['cd']),
 command('tasks','Project overview','Browse this project and its chats','Folder','action',['ps']),
 command('help','Help','Browse commands and keyboard shortcuts','CircleHelp'),
 command('plugins','Plugins','Install and manage Muse plugins','Blocks','action',['apps','connectors']),
 command('customize','Customize','Skills, connectors, plugins and MCP','Settings2'),
 command('hooks','Hooks','Lifecycle hook configuration','Blocks','info',[],'Configure lifecycle hooks in the official Muse CLI. MuseBench disables settings hooks in its sandboxed Code runs.'),
 command('agents','Agents','Workflow and child-agent visibility','Bot','info',['subagents','agent','batch','background','bg','subtask'],'Open Threads to inspect each request and its native tools or workflows. MuseBench follows supported background workflow handoffs inside the supervised request. The Windows CLI does not expose individual child-agent updates or transcripts; those are not inferred from the model reply.'),
 command('logout','Sign out','Manage the official CLI sign-in','LogOut','info',[],'Muse CLI credentials are managed by the official Muse CLI. Run muse logout in your terminal when you want to sign out. Website sign-in is separate. This command preserves both logins.'),
 command('rewind','Rewind','Review saved checkpoints','History','info',['restore'],'Checkpoints preserve reviewed source revisions. Automatic file rollback is not implemented; use /checkpoints to inspect saved revisions. No files or history have been changed.'),
 command('worktree','Worktree','Isolated Git checkout support','GitBranch','info',[],'Create or select a Git worktree with your Git tools, then open its folder in MuseBench. MuseBench does not create or delete Git worktrees from this menu.'),
 command('approve','Approve denial','Interactive approval support','ShieldCheck','info',[],'The native Windows transport stops on unsupported interactive approval requests. Review the connection details and any partial changes; this command never approves or retries an action automatically.'),
 command('voice','Voice','Use on-device dictation','Mic'),
 command('mention','Mention file','Add a file path to your request','FileText'),
 command('exit','Close window','Close MuseBench after saving its state','LogOut','action',['quit']),
]);
function commandLines(value){
 if(typeof value!=='string')return [];
 const lines=value.split('\n'),found=[];let fence=null;
 for(let i=0;i<lines.length;i++){
  const marker=/^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(lines[i]);
  if(marker){if(!fence)fence=marker[1];else if(marker[1][0]===fence[0]&&marker[1].length>=fence.length&&!marker[2].trim())fence=null;continue;}
  if(fence)continue;
  const match=/^\/([a-zA-Z0-9:-]*)(?:[ \t]+(.*))?$/.exec(lines[i].trim());
  if(match)found.push({index:i,name:match[1].toLowerCase(),args:(match[2]??'').trim(),prefix:lines.slice(0,i).join('\n').trimEnd()});
 }
 return found;
}
export function parseSlashInput(value){
 const row=commandLines(value).find(row=>row.index===value.split('\n').length-1);
 return row?{name:row.name,args:row.args,prefix:row.prefix}:null;
}
export function parseSlashSubmission(value){
 const row=commandLines(value)[0];
 return row?{name:row.name,args:[row.args,...value.split('\n').slice(row.index+1)].filter(Boolean).join('\n').trim(),prefix:row.prefix}:null;
}
export function findCommand(name){return COMMANDS.find(item=>item.id===name||item.aliases.includes(name));}
export function filterCommands(query='',skills=[]){
 const q=query.toLowerCase().replace(/^\//,'').trim();
 const core=COMMANDS.filter(c=>`${c.id} ${c.label} ${c.description} ${c.aliases.join(' ')}`.toLowerCase().includes(q));
 const entries=skills.filter(s=>s.available!==false).filter(s=>`${s.name} ${s.title} ${s.description}`.toLowerCase().includes(q)).map(skill=>({id:`skill:${skill.id}`,label:skill.title,description:skill.description,icon:'BookOpen',kind:'skill',aliases:[skill.name],skill}));
 if(!q)return [...core.slice(0,13),...entries,...core.slice(13)];
 return [...core,...entries].sort((a,b)=>Number(b.id===q||b.aliases.includes(q))-Number(a.id===q||a.aliases.includes(q)));
}
export function skillPrompt(skill,draft=''){
 if(skill?.available===false)throw Error(skill.unavailableReason||'This skill is unavailable.');
 if(!skill||typeof skill.id!=='string'||!/^[-\w:./]+$/.test(skill.id)||skill.id.length>200)throw Error('Invalid Muse skill.');
 return `Use the Muse skill \`${skill.id}\` for this request.\n\n${draft}`;
}
