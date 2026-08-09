import * as THREE from "/vendor/three.module.js";
import { installAtlas3DBridge } from "/page-adapter.mjs";

const scene = new THREE.Scene();
scene.name = "reference-root";
scene.background = new THREE.Color(0x101820);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(devicePixelRatio);
document.body.appendChild(renderer.domElement);

const joint = new THREE.Group(); joint.name = "pivot-joint";
const visual = new THREE.Group(); visual.name = "joint-visual";
const cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial({ color: 0x35c46a })); cube.name = "reference-cube";
const socket = new THREE.Object3D(); socket.name = "tool-socket"; socket.position.set(1.5, 0, 0);
const attachment = new THREE.Object3D(); attachment.name = "attached-tool"; attachment.position.set(0.25, 0, 0);
scene.add(joint); joint.add(visual); visual.add(cube, socket); socket.add(attachment);

function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
resize();
installAtlas3DBridge({ THREE, scene, camera, renderer, cube, joint, visual, socket, attachment });
