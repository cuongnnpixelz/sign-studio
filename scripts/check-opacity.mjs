import {connect} from './browser-qa.mjs';
import fs from 'node:fs/promises';
const c=await connect();
console.log(await c.evaluate(`(()=>{
const result=[];
signStudio.characterAvatar.model.traverse(n=>{
 if(!n.isMesh||!['Hair','Eyelashes'].includes(n.name))return;
 const m=n.material,im=m.map.image,canvas=document.createElement('canvas');
 canvas.width=im.width;canvas.height=im.height;
 const ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);
 const data=ctx.getImageData(0,0,im.width,im.height).data;
 const uv=n.geometry.attributes.uv, samples=[0,0];
 for(let i=0;i<uv.count;i++){const x=Math.min(im.width-1,Math.floor((uv.getX(i)%1+1)%1*im.width));
 const y=Math.min(im.height-1,Math.floor((uv.getY(i)%1+1)%1*im.height));
 samples[0]+=data[(y*im.width+x)*4+3];samples[1]+=data[((im.height-1-y)*im.width+x)*4+3];}
 result.push({name:n.name,opacity:m.opacity,flipY:m.map.flipY,uv:uv.count,average:samples.map(s=>s/uv.count),alpha:m.alphaTest});
});return result;
})()`));
await c.evaluate(`signStudio.characterAvatar.model.traverse(n=>{if(n.isMesh && ['Hair','Eyelashes'].includes(n.name)){n.material.opacity=1;n.material.alphaTest=.35;n.material.needsUpdate=true;}})`);
await new Promise(r=>setTimeout(r,500));
const shot=await c.send('Page.captureScreenshot');
await fs.writeFile('artifacts/hair-check.png',Buffer.from(shot.data,'base64'));
c.close();
