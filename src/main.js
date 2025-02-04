import * as THREE from 'three';
import * as TWEEN from 'three/addons/libs/tween.module.js'
import {OrbitControls} from "three/addons";

let tensorShape = [5, 4, 3];
let shardShape = [1, 1, 3];
let coreGrid = [2, 3];
let scene;
let is_paused = false;
let pending_animations = 0;
let animating_shard = -1;
let cubes = [];

const colors = [
    "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF", "#FFA500", "#800080", "#008000", "#800000",
    "#008080", "#000080", "#808000", "#FF4500", "#DA70D6", "#EEE8AA", "#98FB98", "#AFEEEE", "#DB7093", "#FFEFD5",
    "#FFDAB9", "#CD853F", "#FFC0CB", "#DDA0DD", "#B0E0E6", "#800080", "#FF6347", "#40E0D0", "#EE82EE", "#F5DEB3",
    "#F4A460", "#2E8B57", "#DAA520", "#D2691E", "#5F9EA0", "#1E90FF", "#FF69B4", "#8A2BE2", "#A52A2A", "#DEB887",
    "#7FFF00", "#D2B48C", "#FF7F50", "#6495ED", "#DC143C", "#00FFFF", "#00008B", "#008B8B", "#B8860B", "#A9A9A9",
    "#006400", "#BDB76B", "#8B008B", "#556B2F", "#FF8C00", "#9932CC", "#8B0000", "#E9967A", "#8FBC8F", "#483D8B",
    "#2F4F4F", "#00CED1", "#9400D3", "#FF1493", "#00BFFF", "#696969", "#1E90FF", "#B22222", "#228B22", "#FFFAF0",
    "#20B2AA", "#87CEEB", "#778899", "#B0C4DE", "#FFFFE0", "#00FF00", "#32CD32", "#FAF0E6", "#800000", "#66CDAA",
    "#0000CD", "#BA55D3", "#9370DB", "#3CB371", "#7B68EE", "#00FA9A", "#48D1CC", "#C71585", "#191970", "#F5FFFA",
    "#FFE4E1", "#FFE4B5", "#FFDEAD", "#000080", "#FDF5E6", "#808080", "#6A5ACD", "#7CFC00", "#FFFACD", "#ADD8E6",
    "#F08080", "#E0FFFF", "#FAFAD2", "#D3D3D3", "#90EE90", "#FFB6C1", "#FFA07A", "#20B2AA", "#87CEFA", "#778899"
];

function getNumShards() {
    let result = 1;
    for (let i = 0; i < tensorShape.length; i++) {
        result *= Math.ceil(tensorShape[i] / shardShape[i]);
    }
    return result;
}

function getPaddedTensorShape() {
    let result = [];
    for (let i = 0; i < tensorShape.length; i++) {
        result.push(Math.ceil(tensorShape[i] / shardShape[i]) * shardShape[i]);
    }
    return result;
}

function shardShapeTo2D() {
    let volume = 1;
    let W = 1;
    for (let i = 0; i < shardShape.length; i++) {
        volume *= shardShape[i];
        if(W === 1) {
            W = shardShape[i];
        }
    }
    const H = volume / W;
    return [H, W];
}

function cubeToShardCoord(tensorCoord) {
    const shardShape2D = shardShapeTo2D();
    let shardCoord = [
        tensorCoord[0] % shardShape[0],
        tensorCoord[1] % shardShape[1],
        tensorCoord[2] % shardShape[2],
    ];
    let index = shardCoord[0] + shardCoord[1] * shardShape[0] + shardCoord[2] * shardShape[0] * shardShape[1];
    return [index % shardShape2D[1], Math.floor(index / shardShape2D[1])];
}

function getFinalPosition(coreCoord, shardCoord, shardId) {
    const corePos = getCorePosition(coreCoord[0], coreCoord[1]);
    const shardShape2D = shardShapeTo2D();
    const cubePos = getCubePosition([shardShape2D[1], shardShape2D[0], 1], shardCoord[0], shardCoord[1], 1);
    const numInCore = Math.floor(shardId / (coreGrid[0] * coreGrid[1]));
    return new THREE.Vector3(
        corePos.x + cubePos.x,
        corePos.y + cubePos.y,
        corePos.z + cubeSize / 2 + 1 + numInCore * cubePaddedSize
    );
}

function getShardIdx(x, y, z) {
    const sizeX = Math.ceil(tensorShape[0] / shardShape[0]);
    const sizeY = Math.ceil(tensorShape[1] / shardShape[1]);
    const pX = Math.floor(x / shardShape[0]);
    const pY = Math.floor(y / shardShape[1]);
    const pZ = Math.floor(z / shardShape[2]);
    return pX + pY * sizeX + pZ * sizeX * sizeY;
}

function shardIdToCore(shardId) {
    const cores = coreGrid[0] * coreGrid[1];
    const coreIdx = shardId % cores;
    return [coreIdx % coreGrid[0], Math.floor(coreIdx / coreGrid[0])];
}

const cubeSize = 5;
const cubePadding = 1;
const cubePaddedSize = cubeSize + cubePadding;
function getCubePosition(tensorShape, x, y, z) {
    return new THREE.Vector3(
        (x - tensorShape[0] / 2 + 0.5) * cubePaddedSize,
        (tensorShape[1] / 2 - y - 0.5) * cubePaddedSize,
        (tensorShape[2] / 2 - z - 0.5) * cubePaddedSize
    );
}

const coreWidth = 40;
const coreHeight = 30;
const coreDepth = 1;
const corePadding = 5;
const corePaddedWidth = coreWidth + corePadding;
const corePaddedHeight = coreHeight + corePadding;
function getCorePosition(x, y) {
    return new THREE.Vector3(
        (x - coreGrid[0] / 2 + 0.5) * corePaddedWidth,
        (coreGrid[1] / 2 - y - 0.5) * corePaddedHeight,
        (-tensorShape[2] / 2 - 3.5) * cubePaddedSize,
    );
}

function createCoreGrid() {
    const coreGeometry = new THREE.BoxGeometry(coreWidth, coreHeight, coreDepth);
    const material = new THREE.MeshStandardMaterial({color: 0xfcfcfc});
    for (let x = 0; x < coreGrid[0]; x++) {
        for (let y = 0; y < coreGrid[1]; y++) {
            const core = new THREE.Mesh(coreGeometry, material);
            const pos = getCorePosition(x, y);
            core.position.set(pos.x, pos.y, pos.z);
            scene.add(core);
            const geo = new THREE.EdgesGeometry(coreGeometry);
            const mat = new THREE.LineBasicMaterial({color: 0x000000});
            const wireframe = new THREE.LineSegments(geo, mat);
            core.add(wireframe);
        }
    }
}

function createCubes() {
    const boxGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
    const paddedShape = getPaddedTensorShape();
    cubes = []
    for (let idx = 0; idx < paddedShape[0]; idx++) {
        cubes.push([]);
        for (let idy = 0; idy < paddedShape[1]; idy++) {
            cubes[idx].push([]);
            for (let idz = 0; idz < paddedShape[2]; idz++) {
                const pos = getCubePosition(paddedShape, idx, idy, idz);
                if(idx < tensorShape[0] && idy < tensorShape[1] && idz < tensorShape[2]) {
                    const material = new THREE.MeshLambertMaterial({color: 0x0000ff, transparent: true, opacity: 0.95});
                    const cube = new THREE.Mesh(boxGeometry, material);
                    cube.position.set(pos.x, pos.y, pos.z);
                    scene.add(cube);
                    const geo = new THREE.EdgesGeometry(boxGeometry);
                    const mat = new THREE.LineBasicMaterial({color: 0x000000});
                    const wireframe = new THREE.LineSegments(geo, mat);
                    cube.add(wireframe);
                    cubes[idx][idy].push(cube);
                } else {
                    const geo = new THREE.EdgesGeometry(boxGeometry);
                    const mat = new THREE.LineBasicMaterial({color: 0x000000, transparent: true, opacity: 0.2});
                    const wireframe = new THREE.LineSegments(geo, mat);
                    wireframe.position.set(pos.x, pos.y, pos.z);
                    scene.add(wireframe);
                    cubes[idx][idy].push(wireframe);
                }
            }
        }
    }
}

function colorShardedCubes() {
    for (let idx = 0; idx < tensorShape[0]; idx++) {
        for (let idy = 0; idy < tensorShape[1]; idy++) {
            for (let idz = 0; idz < tensorShape[2]; idz++) {
                const shardId = getShardIdx(idx, idy, idz);
                const cube = cubes[idx][idy][idz];
                cube.material.color.set(colors[shardId % colors.length]);
            }
        }
    }
}

const animationDuration = 1000;
function animateCubes(shardId) {
    const paddedShape = getPaddedTensorShape();
    for (let idx = 0; idx < paddedShape[0]; idx++) {
        for (let idy = 0; idy < paddedShape[1]; idy++) {
            for (let idz = 0; idz < paddedShape[2]; idz++) {
                const curShardId = getShardIdx(idx, idy, idz);
                if(shardId !== curShardId) {
                    continue;
                }
                const coreCoord = shardIdToCore(shardId);
                const shardCoord = cubeToShardCoord([idx, idy, idz]);
                const finalPos = getFinalPosition(coreCoord, shardCoord, shardId);
                pending_animations += 1;
                new TWEEN.Tween(cubes[idx][idy][idz].position)
                    .to(finalPos, animationDuration)
                    .onComplete(() => {
                        pending_animations -= 1;
                    })
                    .start();
            }
        }
    }
}

function resetPositions(shardId) {
    const paddedShape = getPaddedTensorShape();
    for (let idx = 0; idx < paddedShape[0]; idx++) {
        for (let idy = 0; idy < paddedShape[1]; idy++) {
            for (let idz = 0; idz < paddedShape[2]; idz++) {
                const cube = cubes[idx][idy][idz];
                const curShardId = getShardIdx(idx, idy, idz);
                if (curShardId <= shardId) {
                    const coreCoord = shardIdToCore(curShardId);
                    const shardCoord = cubeToShardCoord([idx, idy, idz]);
                    const finalPos = getFinalPosition(coreCoord, shardCoord, curShardId);
                    cube.position.set(finalPos.x, finalPos.y, finalPos.z);
                } else {
                    const cubePos = getCubePosition(paddedShape, idx, idy, idz);
                    cube.position.set(cubePos.x, cubePos.y, cubePos.z);
                }
            }
        }
    }
    pending_animations = 0;
}

function initScene() {
    scene = new THREE.Scene();
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
    scene.add(ambientLight);
    createCubes();
    colorShardedCubes();
    createCoreGrid();
    TWEEN.removeAll();
    animating_shard = -1;
    pending_animations = 0;
}

function reloadParams() {
    let shape_0 = Number(document.getElementById('shape_0').value);
    let shape_1 = Number(document.getElementById('shape_1').value);
    let shape_2 = Number(document.getElementById('shape_2').value);
    let shard_0 = Number(document.getElementById('shard_0').value);
    let shard_1 = Number(document.getElementById('shard_1').value);
    let shard_2 = Number(document.getElementById('shard_2').value);
    let core_grid_0 = Number(document.getElementById('core_grid_0').value);
    let core_grid_1 = Number(document.getElementById('core_grid_1').value);
    tensorShape = [shape_2, shape_1, shape_0];
    shardShape = [shard_2, shard_1, shard_0];
    coreGrid = [core_grid_0, core_grid_1];
    initScene();
}

function setPaused(paused) {
    if (paused === is_paused) {
        return;
    }
    if (paused) {
        document.getElementById('pause_button').value = "Play";
        TWEEN.removeAll();
        is_paused = true;
    } else {
        document.getElementById('pause_button').value = "Pause";
        if (pending_animations !== 0 && animating_shard >= 0) {
            pending_animations = 0;
            animating_shard -= 1;
        }
        is_paused = false;
    }
}

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('bg'),
    antialias: true,
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.useLegacyLights = false;
renderer.setClearColor(0xffffffff);
camera.position.set(-70, 70, 70);
camera.lookAt(0, 0, 0);
const controls = new OrbitControls(camera, renderer.domElement);

initScene();

function renderLoop() {
    requestAnimationFrame(renderLoop);

    if (!is_paused && pending_animations === 0 && animating_shard + 1 < getNumShards()) {
        animating_shard += 1;
        animateCubes(animating_shard);
    }

    TWEEN.update();
    controls.update();
    renderer.render(scene, camera);
}
renderLoop();

window.addEventListener('resize', onWindowResize, false)
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.render(scene, camera)
}

const input_ids = ['shape_0', 'shape_1', 'shape_2', 'shard_0', 'shard_1', 'shard_2', 'core_grid_0', 'core_grid_1'];
for (let idx = 0; idx < input_ids.length; idx++) {
    document.getElementById(input_ids[idx]).addEventListener('change', reloadParams);
}
document.getElementById('reset_button').addEventListener('click', reloadParams);

document.getElementById('pause_button').addEventListener('click', () => {
    setPaused(!is_paused);
});
document.getElementById('next_button').addEventListener('click', () => {
    setPaused(true);
    if (pending_animations === 0 && animating_shard + 1 < getNumShards()) {
        animating_shard += 1;
    }
    resetPositions(animating_shard);
});
document.getElementById('prev_button').addEventListener('click', () => {
    setPaused(true);
    if (animating_shard >= 0) {
        animating_shard -= 1;
    }
    resetPositions(animating_shard);
});
