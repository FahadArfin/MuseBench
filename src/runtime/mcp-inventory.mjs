// Configuration and authorization facts only. A row never proves tool health.
export function projectMcpInventory(value,sessionId){
 if(!value||!Array.isArray(value.servers))throw Error('Invalid MCP inventory');
 const servers=value.servers.slice(0,200).map(row=>{
  if(!row||typeof row.name!=='string'||!row.name.trim()||row.name.length>200||['source','transport','oauth'].some(key=>typeof row[key]!=='string'))throw Error('Invalid MCP server row');
  return{name:row.name.replace(/[\u0000-\u001f\u007f]/g,' '),source:['settings','plugin','session'].includes(row.source)?row.source:'unknown',transport:['stdio','streamableHttp'].includes(row.transport)?row.transport:'unknown',oauth:['loggedIn','loggedOut','notSupported'].includes(row.oauth)?row.oauth:'unknown'};
 });
 return{sessionId,readAt:new Date().toISOString(),servers,omitted:value.servers.length-servers.length};
}
