// Browser adapter for the shared, offline-capable retargeter.
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createBaker} from './bake-core.mjs';
async function load(url){if(url.endsWith('.fbx'))return new FBXLoader().loadAsync(url);const g=await new GLTFLoader().loadAsync(url);g.scene.animations=g.animations;return g.scene;}
window.bake=createBaker(THREE,load);
window.ready=true;
