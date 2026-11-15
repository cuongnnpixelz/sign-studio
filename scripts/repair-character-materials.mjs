import fs from 'node:fs/promises';
import { connect } from './browser-qa.mjs';

// Restore FBX opacity channels omitted by FBX2glTF's material conversion.
// Pack each opacity map into glTF's base-color alpha, so exported GLBs stay portable.
const c = await connect();
try {
  try { await fs.access('artifacts/character-before-material-repair.glb'); }
  catch { await fs.copyFile('public/character.glb', 'artifacts/character-before-material-repair.glb'); }
  const result = await c.evaluate(`(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const {GLTFExporter}=await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
    const gltf=await new GLTFLoader().loadAsync('/artifacts/character-before-material-repair.glb');
    const repairs=[['Hairmat','hair-opacity.png'],['Eyelashmat','eyelashes-opacity.png']];
    for(const [name,file] of repairs){
      const mask=await new THREE.TextureLoader().loadAsync('/character-textures/'+file);
      const materials=new Set();
      gltf.scene.traverse(n=>{
        if(n.isMesh) for(const mat of (Array.isArray(n.material)?n.material:[n.material]))
          if(mat.name===name) materials.add(mat);
      });
      if(materials.size!==1) throw new Error('Expected one material: '+name);
      for(const material of materials){
        const source=material.map.image;
        const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});
        ctx.drawImage(source,0,0);
        const color=ctx.getImageData(0,0,canvas.width,canvas.height);
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(mask.image,0,0,canvas.width,canvas.height);
        const opacity=ctx.getImageData(0,0,canvas.width,canvas.height);
        for(let i=0;i<color.data.length;i+=4) color.data[i+3]=opacity.data[i+1];
        ctx.putImageData(color,0,0);
        const texture=material.map.clone();
        texture.source=new THREE.Source(canvas);
        texture.needsUpdate=true;
        material.map=texture;
        material.transparent=false;
        material.opacity=1;
        material.alphaTest=.35;
        material.side=THREE.DoubleSide;
        material.needsUpdate=true;
      }
      mask.dispose();
    }
    const binary=await new GLTFExporter().parseAsync(gltf.scene,{binary:true,animations:gltf.animations});
    const data=await new Promise(resolve=>{
      const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(new Blob([binary]));
    });
    return {bytes:binary.byteLength,data};
  })()`);
  await fs.writeFile('public/character.glb', Buffer.from(result.data, 'base64'));
  console.log(`Repaired hair and eyelashes; wrote ${result.bytes} bytes with embedded opacity.`);
} finally {
  c.close();
}
