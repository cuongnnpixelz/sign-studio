import fs from 'node:fs/promises';
import { connect } from './browser-qa.mjs';
const c = await connect();
await c.send('Runtime.enable');
const data = await c.evaluate(`(async()=>{
  const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const THREE=await import('/node_modules/three/build/three.module.js');
  const asset=await new GLTFLoader().loadAsync('/character.glb');
  const model=asset.scene;
  model.animations=asset.animations;
  window.inspectedFbx=model;
  const bones=[], meshes=[], materials=[];
  model.updateMatrixWorld(true);
  model.traverse(n=>{
    if(n.isBone) bones.push({name:n.name,parent:n.parent.name,position:n.getWorldPosition(new THREE.Vector3()).toArray(),quaternion:n.quaternion.toArray()});
    if(n.isMesh) {
      meshes.push({name:n.name,skin:n.isSkinnedMesh,vertices:n.geometry.attributes.position.count,morphs:n.morphTargetDictionary});
      for(const m of (Array.isArray(n.material)?n.material:[n.material])) materials.push({name:m.name,color:m.color?.getHexString(),map:!!m.map,image:m.map?.image?.width});
    }
  });
  const box=new THREE.Box3().setFromObject(model);
  return {bones,meshes,materials,animations:model.animations.map(c=>({name:c.name,duration:c.duration})),bounds:{min:box.min.toArray(),max:box.max.toArray()}};
})()`);
await fs.writeFile('artifacts/fbx-inspection.json', JSON.stringify(data,null,2));
console.log(JSON.stringify(data,null,2));
await c.evaluate(`(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  signStudio.switchPose('Idle');
  signStudio.avatar.root.visible=false;
  const model=window.inspectedFbx;
  const wrapper=new THREE.Group();wrapper.add(model);
  const box=new THREE.Box3().setFromObject(model);
  const scale=1.9/(box.max.y-box.min.y), center=box.getCenter(new THREE.Vector3());
  wrapper.scale.setScalar(scale);
  wrapper.position.set(-center.x*scale,-.4-box.min.y*scale,-center.z*scale);
  signStudio.scene.add(wrapper);
  window.fbxPreview=wrapper;
})()`);
await new Promise(r=>setTimeout(r,1500));
const shot=await c.send('Page.captureScreenshot');
await fs.writeFile('artifacts/fbx-original.png',Buffer.from(shot.data,'base64'));
console.log('Browser errors:',c.errors);
c.close();
