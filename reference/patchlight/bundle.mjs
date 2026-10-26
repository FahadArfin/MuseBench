import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
mkdirSync('artifacts',{recursive:true});
const html=readFileSync('index.html','utf8').replace('<link rel="stylesheet" href="styles.css">',()=>'<style>'+readFileSync('styles.css','utf8')+'</style>').replace('<script src="app.js"></script>',()=>'<script>'+readFileSync('app.js','utf8')+'</script>');
writeFileSync('artifacts/Patchlight-Interactive-Demo.html',html);
console.log('Built standalone offline HTML.');
