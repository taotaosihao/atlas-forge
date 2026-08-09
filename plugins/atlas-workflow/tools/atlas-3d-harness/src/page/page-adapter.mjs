function copyNumbers(array) { return Array.from(array, (value) => Number(value)); }
export function installAtlas3DBridge({ THREE, scene, camera, renderer, cube, joint, visual, socket, attachment }) {
  let stateRevision = 0, renderedStateRevision = 0, renderRevision = 0, pending = 0, generation = 0;
  let profile = "base@1", checkpoint = "home", view = "hero", timeMs = 0, captures = new Map();
  const consumeFailure = (stage) => { if (window.__ATLAS_3D_TEST_FAILURE__ === stage) { delete window.__ATLAS_3D_TEST_FAILURE__; throw new Error(`injected ${stage} failure`); } };
  let fatal = null;
  renderer.domElement.addEventListener("webglcontextlost", (event) => { event.preventDefault(); fatal = new Error("WEBGL_CONTEXT_LOST"); });
  const present = () => new Promise((resolve, reject) => requestAnimationFrame(() => { try { if (fatal) throw fatal; consumeFailure("asset-pending"); consumeFailure("render"); consumeFailure("no-op-presentation"); renderer.render(scene, camera); consumeFailure("first-frame"); renderedStateRevision = stateRevision; renderRevision += 1; requestAnimationFrame(() => { try { if (fatal) throw fatal; consumeFailure("quiet-timeout"); consumeFailure("quiet-frame"); resolve(); } catch (error) { reject(error); } }); } catch (error) { reject(error); } }));
  const setView = (name) => { camera.position.fromArray(name === "hero" ? [4, 3, 6] : [6, 2, 4]); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true); };
  const matrix = (object) => copyNumbers(object.matrix.elements);
  const world = (object) => copyNumbers(object.matrixWorld.elements);
  const snapshot = () => {
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(cube);
    const value = { protocol_version: "atlas-3d-page@1", profile, stateRevision, renderedStateRevision, renderRevision, pending, checkpoint, view, timeline: { time_ms: timeMs, joint_radians: joint.rotation.y }, object: { id: cube.name, parent_id: cube.parent.name, translation: copyNumbers(cube.position.toArray()), quaternion_xyzw: copyNumbers(cube.quaternion.toArray()), scale: copyNumbers(cube.scale.toArray()), parent_world_matrix: world(cube.parent), world_matrix: world(cube), aabb_min: copyNumbers(box.min.toArray()), aabb_max: copyNumbers(box.max.toArray()) }, camera: { projection_matrix: copyNumbers(camera.projectionMatrix.elements), matrix_world_inverse: copyNumbers(camera.matrixWorldInverse.elements), near: camera.near, far: camera.far } };
    if (profile === "industrial-kinematics@1") value.industrial = { anchor: { root_id: scene.name, root_world_matrix: world(scene), joint_parent_id: joint.parent.name, visual_id: visual.name, visual_parent_id: visual.parent.name, visual_local_matrix: matrix(visual), visual_world_matrix: world(visual) }, joint: { id: joint.name, origin_local: copyNumbers(joint.position.toArray()), axis_local: [0, 1, 0], position_radians: joint.rotation.y, parent_world_matrix: world(joint.parent), world_matrix: world(joint) }, socket: { id: socket.name, parent_id: socket.parent.name, local_matrix: matrix(socket), world_matrix: world(socket) }, attachment: { id: attachment.name, parent_id: attachment.parent.name, ancestry: [scene.name, joint.name, visual.name, socket.name, attachment.name], local_matrix: matrix(attachment), world_matrix: world(attachment), ancestry_scales: [scene.scale, joint.scale, visual.scale, socket.scale, attachment.scale].map((scale) => copyNumbers(scale.toArray())) } };
    return Object.freeze(value);
  };
  const restore = (before) => { stateRevision = before.stateRevision; renderedStateRevision = before.renderedStateRevision; renderRevision = before.renderRevision; generation = before.generation; captures = new Map(before.captures); profile = before.profile; checkpoint = before.checkpoint; view = before.view; timeMs = before.timeMs; joint.rotation.y = before.jointY; camera.position.fromArray(before.cameraPosition); camera.quaternion.fromArray(before.cameraQuaternion); scene.updateMatrixWorld(true); };
  const transaction = async (apply, afterPresentation = () => {}) => {
    const before = { stateRevision, renderedStateRevision, renderRevision, generation, captures: new Map(captures), profile, checkpoint, view, timeMs, jointY: joint.rotation.y, cameraPosition: camera.position.toArray(), cameraQuaternion: camera.quaternion.toArray() };
    pending += 1; let failure = null;
    try { if (fatal) throw fatal; apply(); consumeFailure("apply"); stateRevision += 1; await present(); afterPresentation(); }
    catch (error) { failure = error; restore(before); try { renderer.render(scene, camera); } catch { failure = new Error(`${error.message}; rollback render failed`); } }
    finally { pending -= 1; }
    if (failure) throw failure;
    const value = snapshot();
    if (value.pending !== 0 || value.renderedStateRevision !== value.stateRevision) throw new Error("transaction did not reach quiet state");
    return { ...value, quiet: true };
  };
  window.__ATLAS_3D_BRIDGE__ = Object.freeze({
    protocolVersion: "atlas-3d-page@1",
    capabilities: Object.freeze(["scene.graph@1", "scene.transforms@1", "timeline.seek@1", "render.metrics@1"]),
    supportedProfiles: Object.freeze(["industrial-kinematics@1"]),
    reset: async ({ seed, epoch_ms, required_profiles = [] }) => { if (!Number.isInteger(seed) || !Number.isInteger(epoch_ms) || !Array.isArray(required_profiles) || (required_profiles.length && JSON.stringify(required_profiles) !== '["industrial-kinematics@1"]')) throw new Error("invalid reset"); return transaction(() => { profile = required_profiles.length ? "industrial-kinematics@1" : "base@1"; checkpoint = "home"; view = "hero"; timeMs = 0; joint.rotation.y = 0; setView(view); }, () => { generation += 1; captures.clear(); }); },
    checkpoint: async ({ name, time_ms, view: nextView }) => { if (!["home", "mid", "settled"].includes(name) || !["hero", "profile"].includes(nextView) || !Number.isInteger(time_ms)) throw new Error("invalid checkpoint"); const before = stateRevision; const result = await transaction(() => { checkpoint = name; view = nextView; timeMs = time_ms; joint.rotation.y = time_ms / 1000; setView(view); }); if (result.stateRevision !== before + 1) throw new Error("non-atomic checkpoint"); return result; },
    captureTarget: ({ captureToken }) => { const item = captures.get(captureToken); if (!item || item.generation !== generation) throw new Error("invalid capture token"); return item.value; },
    beginCapture: () => { if (pending !== 0 || renderedStateRevision !== stateRevision) throw new Error("capture barrier not quiet"); const captureToken = crypto.randomUUID(); const value = Object.freeze({ ...snapshot(), selector: "canvas" }); captures.set(captureToken, { generation, value }); return { captureToken, value }; },
    status: () => ({ protocol_version: "atlas-3d-page@1", stateRevision, renderedStateRevision, renderRevision, pending, quiet: pending === 0 && renderedStateRevision === stateRevision })
  });
  setView("hero");
  window.__ATLAS_3D_READY__ = present().then(() => true);
}
