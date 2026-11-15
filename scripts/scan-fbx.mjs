import fs from 'node:fs';
const buffer=fs.readFileSync(process.argv[2] || 'artifacts/character-source.fbx');
const strings=buffer.toString('latin1').match(/[\x20-\x7e]{6,180}/g)||[];
console.log([...new Set(strings.filter(s=>/\.(png|jpg|jpeg|tga|bmp)|mixamorig|Bip01|Bip001|RightHand|LeftHand/i.test(s)))].slice(0,100));
