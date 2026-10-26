// The renderer can select a saved ID, never a filesystem path or executable HTML.
export function artifactId(value){
 try{
  const url=new URL(value);
  if(url.protocol!=='musebench-artifact:'||url.hostname!=='preview'||url.port||url.username||url.password||!/^\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(url.pathname))return null;
  return url.pathname.slice(1);
 }catch{return null;}
}
export function createArtifactHandler({getArtifact,render,getTheme=()=> 'dark'}){
 return async request=>{
  if(request.method!=='GET')return new Response('Method not allowed',{status:405});
  const id=artifactId(request.url);if(!id)return new Response('Preview not found',{status:404});
  try{
   const artifact=await getArtifact(id);if(!artifact)return new Response('This work does not have a preview yet.',{status:404});
   const query=new URL(request.url).searchParams,theme=query.get('theme'),revision=query.get('rev');
   return new Response(render(artifact,{theme:['light','dark'].includes(theme)?theme:getTheme(),updatedAt:revision&&revision.length<40&&Number.isFinite(Date.parse(revision))?new Date(revision).toISOString():undefined}),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
  }catch{return new Response('This preview could not be loaded. Refresh the work to try again.',{status:500});}
 };
}
