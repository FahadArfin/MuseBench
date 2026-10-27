export function lessonBlock(lesson){return `\n\n<!-- MuseBench lesson ${lesson.id} -->\n${lesson.title} (${lesson.applicability})\n${lesson.text}\n<!-- End MuseBench lesson ${lesson.id} -->`;}
export function proposeLesson(project,input){
 for(const [key,limit] of [['id',100],['title',100],['text',1500],['applicability',200]])if(typeof input[key]!=='string'||!input[key].trim()||input[key].length>limit)throw Error('Add a concise lesson, title and applicability.');
 const lessons=project.lessons??=[];if(lessons.length>=50)throw Error('This project has reached its 50-lesson limit.');if(lessons.some(l=>['proposed','accepted'].includes(l.status)&&l.text.trim()===input.text.trim()))throw Error('Duplicate lesson; review the existing entry.');
 const lesson={...input,title:input.title.trim(),text:input.text.trim(),applicability:input.applicability.trim(),base:project.instructions??'',status:'proposed',createdAt:new Date().toISOString()};lessons.push(lesson);return lesson;
}
export function decideLesson(project,id,decision){
 const lesson=project.lessons?.find(l=>l.id===id);if(!lesson)throw Error('Lesson not found.');
 if(decision==='reject'&&lesson.status==='proposed'){lesson.status='rejected';return;}
 if(decision==='accept'&&lesson.status==='proposed'){if((project.instructions??'')!==lesson.base)throw Error('Project instructions changed. Reject and propose this lesson again against current guidance.');const next=lesson.base+lessonBlock(lesson);if(next.length>4000)throw Error('Project instructions would exceed 4,000 characters.');project.instructions=next;lesson.status='accepted';lesson.acceptedAt=new Date().toISOString();return;}
 if(decision==='revoke'&&lesson.status==='accepted'){const block=lessonBlock(lesson);if(!project.instructions?.includes(block))throw Error('The accepted lesson was edited. Review project instructions before removing it.');project.instructions=project.instructions.replace(block,'');lesson.status='revoked';return;}
 throw Error('Lesson status changed. Refresh before reviewing.');
}
