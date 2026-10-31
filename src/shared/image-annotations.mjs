export const MARK_COLORS=['#ef4444','#3b82f6','#eab308'];
export function imageMarks(value){
 if(!Array.isArray(value)||value.length>40)throw Error('Use up to 40 image annotations.');
 let points=0;
 const point=p=>{if(!p||![p.x,p.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw Error('Invalid annotation position.');return{x:p.x,y:p.y};};
 return value.map(mark=>{
  if(mark?.kind==='comment'){
   if(typeof mark.text!=='string'||!mark.text.trim()||mark.text.length>1000||mark.text.includes('\0'))throw Error('Write an annotation comment up to 1,000 characters.');
   return{kind:'comment',...point(mark),text:mark.text.trim()};
  }
  if(!['pen','arrow','rect'].includes(mark?.kind)||!MARK_COLORS.includes(mark.color)||!Array.isArray(mark.points)||mark.points.length<2||mark.points.length>500||(mark.kind!=='pen'&&mark.points.length!==2)||(points+=mark.points.length)>4000)throw Error('Invalid annotation drawing.');
  return{kind:mark.kind,color:mark.color,points:mark.points.map(point)};
 });
}
export function imageAnnotationNotes(images=[]){
 return images.flatMap((image,index)=>{
  let number=0;const comments=(image.annotation?.marks??[]).filter(mark=>mark.kind==='comment').map(mark=>`${++number}. (x: ${(mark.x*100).toFixed(1)}%, y: ${(mark.y*100).toFixed(1)}%) ${mark.text}`);
  return comments.length?[`Image ${index+1} annotation comments (numbered markers on the attached image):\n${comments.join('\n')}`]:[];
 }).join('\n\n');
}
