export const MAX_IMAGE_BYTES=8*1024*1024,MAX_IMAGES=4;
export function imageReferences(value=[]){
 if(!Array.isArray(value)||value.length>MAX_IMAGES)throw Error('Attach up to four screenshots.');
 const seen=new Set();return value.map(ref=>{
  if(!ref||typeof ref.id!=='string'||!/^[a-f0-9]{64}$/.test(ref.id)||!['image/png','image/jpeg','image/webp'].includes(ref.mime)||typeof ref.name!=='string'||!ref.name||ref.name.length>160||!Number.isInteger(ref.bytes)||ref.bytes<1||ref.bytes>MAX_IMAGE_BYTES||seen.has(ref.id))throw Error('Invalid screenshot reference.');
  seen.add(ref.id);return{id:ref.id,name:ref.name,mime:ref.mime,bytes:ref.bytes};
 });
}
