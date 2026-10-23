import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist',{recursive:true});
for (const file of ['index.html','form.js','painel.html','painel.js','painel.css','logo.png']) await copyFile(file,`dist/${file}`);
