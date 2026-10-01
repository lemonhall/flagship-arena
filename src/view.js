import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clamp, forward } from './sim.js';

const V = (p, y = 0) => new THREE.Vector3(p.x, y, p.y);
const models = new Map();
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const sphere = new THREE.IcosahedronGeometry(1, 1);
const box = new THREE.BoxGeometry(1, 1, 1);
const ringGeo = new THREE.RingGeometry(.87, 1, 48);
const warningCircle = new THREE.CircleGeometry(1, 48);
const projectileMaterial = new THREE.MeshStandardMaterial({ color: '#1c2022', metalness: .7, roughness: .5 });
// Small procedural alpha texture for powder smoke and fire; cannonballs stay solid meshes.
const puffCanvas = document.createElement('canvas'); puffCanvas.width = puffCanvas.height = 64;
const puffContext = puffCanvas.getContext('2d'), puff = puffContext.createRadialGradient(32, 32, 0, 32, 32, 32);
puff.addColorStop(0, 'rgba(255,255,255,1)'); puff.addColorStop(.25, 'rgba(255,255,255,.85)');
puff.addColorStop(.65, 'rgba(255,255,255,.3)'); puff.addColorStop(1, 'rgba(255,255,255,0)');
puffContext.fillStyle = puff; puffContext.fillRect(0, 0, 64, 64);
const puffTexture = new THREE.CanvasTexture(puffCanvas);

export async function loadModels(ids, progress = () => {}) {
  const unique = [...new Set([...ids, 'repair', 'ammo'])]; let done = 0;
  await Promise.all(unique.map(async id => {
    if (!models.has(id)) {
      const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}assets/ships/${id}.glb`);
      const root = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(root), size = bounds.getSize(new THREE.Vector3());
      if (id !== 'repair' && id !== 'ammo') {
        const scale = 20 / size.z;
        root.scale.setScalar(scale);
        root.position.x = -(bounds.max.x + bounds.min.x) * .5 * scale;
        root.position.z = -(bounds.max.z + bounds.min.z) * .5 * scale;
        root.position.y = -.65;
      }
      root.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = false; } });
      models.set(id, root);
    }
    progress(++done / unique.length);
  }));
}

export class BattleView {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.4 : 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#a9d5d4');
    this.scene.fog = new THREE.FogExp2('#a9d5d4', .00165);
    this.camera = new THREE.PerspectiveCamera(58, 1, .5, 1400);
    this.cameraBase = new THREE.Vector3();
    this.scene.add(new THREE.HemisphereLight('#def3f1', '#376768', 2.4));
    const sun = new THREE.DirectionalLight('#fff0d4', 3.1); sun.position.set(-180, 260, 90); this.scene.add(sun);
    this.world = new THREE.Group(); this.scene.add(this.world);
    this.units = new Map(); this.pickups = new Map(); this.shells = new Map(); this.hazards = new Map(); this.particles = []; this.wrecks = [];
    this.time = 0; this.shake = 0; this.cameraReady = false; this.wakeClock = 0;
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(2300, 2300, 100, 100), new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `uniform float time; varying vec3 sea; varying vec3 worldPos;
        void main(){ vec3 p=position; p.z=sin(p.x*.055+time*.9)*.36+sin(p.y*.073-time*1.2)*.25;
          sea=p; vec4 w=modelMatrix*vec4(p,1.);worldPos=w.xyz;gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float time; varying vec3 sea; varying vec3 worldPos;
        void main(){float a=sin(sea.x*.055+time*.9),b=sin(sea.y*.073-time*1.2);
          float small=sin(sea.x*.48+sin(sea.y*.23+time)*2.+time)*sin(sea.y*.51-time*1.9);
          float s=pow(max(0.,small),9.);float swell=(a+b)*.1;
          vec3 c=mix(vec3(.018,.24,.29),vec3(.08,.51,.53),.6+swell);
          c+=s*vec3(.20,.24,.21)*.45;float haze=1.-exp(-length(cameraPosition-worldPos)*.0019);
          gl_FragColor=vec4(mix(c,vec3(.63,.79,.79),haze),1.); }`,
    }));
    this.water.rotation.x = -Math.PI / 2; this.scene.add(this.water);
    this.storm = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 22, 128, 1, true), new THREE.MeshBasicMaterial({ color: '#778ba4', transparent: true, opacity: .11, side: THREE.DoubleSide, depthWrite: false }));
    this.storm.position.y = 9; this.scene.add(this.storm);
    this.stormEdge = this.ring('#d1dcde', 290, .17); this.scene.add(this.stormEdge);
    this.stormEdge.geometry = new THREE.RingGeometry(.997, 1, 160);
    this.targetRing = this.ring('#f8c378', 13, .8); this.scene.add(this.targetRing);
    this.resize(); addEventListener('resize', () => this.resize());
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight; this.camera.fov = innerHeight > innerWidth ? 66 : 56;
    this.camera.updateProjectionMatrix();
  }
  ring(color, size, opacity) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.scale.setScalar(size); m.position.y = .4; return m;
  }
  setArena(sim) {
    this.world.traverse(n => {
      if (n.userData.terrain) { n.geometry?.dispose(); n.material?.dispose(); }
      else if (n.userData.terrainMaterial || n.userData.marker || n.userData.warningMaterial) n.material.dispose();
    });
    this.world.clear(); this.units.clear(); this.pickups.clear(); this.shells.clear(); this.hazards.clear(); this.wrecks = [];
    for (const p of this.particles) { this.scene.remove(p.mesh); p.mesh.material.dispose(); }
    this.particles = []; this.cameraReady = false;
    for (const [i, rock] of sim.rocks.entries()) {
      const island = new THREE.Group(); island.position.set(rock.x, 0, rock.y);
      const sand = new THREE.Mesh(new THREE.CylinderGeometry(rock.radius * .83, rock.radius * 1.06, 2, 11), new THREE.MeshStandardMaterial({ color: '#d6c495', roughness: 1, flatShading: true }));
      sand.position.y = -.1; sand.userData.terrain = true; island.add(sand);
      const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: i % 3 ? '#697e6f' : '#88928a', roughness: 1, flatShading: true }));
      stone.scale.set(rock.radius * .86, rock.height, rock.radius * .73); stone.rotation.y = i * 2.1;
      stone.position.y = rock.height * .15; stone.userData.terrain = true; island.add(stone);
      const foam = this.ring('#dcf1d9', rock.radius * 1.09, .3); island.add(foam); foam.userData.terrainMaterial = true;
      if (i % 3 !== 0) for (let j = 0; j < 3; j++) {
        const tree = new THREE.Group(); tree.position.set((j - 1) * 4, rock.height * .64, Math.sin(j * 8) * 3);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.35, .6, 6, 5), new THREE.MeshStandardMaterial({ color: '#7e6346' }));
        trunk.position.y = 2; trunk.rotation.z = .12; trunk.userData.terrain = true; tree.add(trunk);
        for (let k = 0; k < 5; k++) {
          const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.35, 6, 3), new THREE.MeshStandardMaterial({ color: '#427d66', flatShading: true }));
          leaf.rotation.z = 1.2; leaf.rotation.y = k * Math.PI * .4; leaf.position.set(Math.cos(k * Math.PI * .4) * 2, 5, Math.sin(k * Math.PI * .4) * 2); leaf.userData.terrain = true; tree.add(leaf);
        }
        island.add(tree);
      }
      this.world.add(island);
    }
  }
  createUnit(u) {
    const root = new THREE.Group();
    const model = models.get(u.hull)?.clone(true);
    if (!model) throw new Error(`Ship model missing: ${u.hull}`);
    model.scale.multiplyScalar(u.bodyScale); model.position.multiplyScalar(u.bodyScale);
    const modelSize = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    root.add(model);
    const marker = this.ring(u.player ? '#f6da96' : u.team ? '#df7058' : '#73d9c4', u.radius + 3, u.boss ? .8 : .55); marker.userData.marker = true; root.add(marker);
    this.world.add(root); const record = { root, model, marker, generation: u.generation, boss: u.boss, modelLength: modelSize.z, modelHeight: modelSize.y };
    this.units.set(u.id, record); return record;
  }
  createHazard(h) {
    const root = new THREE.Group();
    const material = opacity => new THREE.MeshBasicMaterial({ color: '#f23e32', transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    if (h.shape === 'circle') {
      const fill = new THREE.Mesh(warningCircle, material(.16)); fill.rotation.x = -Math.PI / 2; fill.scale.setScalar(h.radius); root.add(fill);
      const edge = this.ring('#f23e32', h.radius, .85); edge.material.toneMapped = false; edge.position.y = .1; root.add(edge);
      root.position.copy(V(h.pos, 1));
    } else {
      const fill = new THREE.Mesh(box, material(.13)); fill.scale.set(h.radius * 2, .08, h.length); root.add(fill);
      for (const sign of [-1, 1]) {
        const edge = new THREE.Mesh(box, material(.85)); edge.scale.set(.55, .1, h.length); edge.position.x = sign * h.radius; root.add(edge);
      }
      // Collision uses swept segments: show the rounded ends as well as the lane.
      for (const sign of [-1, 1]) {
        const cap = new THREE.Mesh(warningCircle, material(.13)); cap.rotation.x = -Math.PI / 2;
        cap.scale.setScalar(h.radius); cap.position.z = sign * h.length / 2; cap.userData.fill = true; root.add(cap);
      }
      root.position.copy(V({ x: h.pos.x + h.dir.x * h.length / 2, y: h.pos.y + h.dir.y * h.length / 2 }, 1));
      root.rotation.y = -Math.atan2(h.dir.x, -h.dir.y);
    }
    root.traverse(n => { if (n.isMesh) n.userData.warningMaterial = true; });
    root.userData.dispose = () => root.traverse(n => { if (n.isMesh) n.material.dispose(); });
    this.world.add(root); return root;
  }
  particle(pos, type, count = 1, direction) {
    const colors = { fire: '#ffc369', smoke: '#5b5d59', water: '#defff3', wood: '#a17743', wake: '#c5ede0' };
    for (let i = 0; i < count && this.particles.length < 260; i++) {
      const soft = type === 'smoke' || type === 'fire';
      const material = soft ? new THREE.SpriteMaterial({ map: puffTexture, color: colors[type], opacity: .8, transparent: true, depthWrite: false, blending: type === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending })
        : new THREE.MeshBasicMaterial({ color: colors[type], transparent: true, opacity: .9, depthWrite: false });
      const mesh = soft ? new THREE.Sprite(material) : new THREE.Mesh(type === 'wood' ? box : sphere, material);
      mesh.position.copy(V(pos, type === 'water' || type === 'wake' ? .5 : 2.8));
      const size = type === 'smoke' ? 5 : type === 'fire' ? 4.5 : type === 'wake' ? .65 : .5;
      mesh.scale.setScalar(size); this.scene.add(mesh);
      const vel = new THREE.Vector3((Math.random() - .5) * 12, type === 'water' ? 12 + Math.random() * 15 : 2 + Math.random() * 5, (Math.random() - .5) * 12);
      if (direction) vel.add(V(direction).multiplyScalar(9));
      if (type === 'wake') { vel.multiplyScalar(.15); vel.y = 0; mesh.scale.y = .08; }
      this.particles.push({ mesh, vel, age: 0, life: type === 'smoke' ? 2.5 : type === 'fire' ? .32 : type === 'wake' ? 2 : 1.2, size, type });
    }
  }
  events(events) {
    for (const e of events) {
      if (e.type === 'shot') { this.particle(e.pos, 'fire', e.heavy ? 3 : 2, e.dir); this.particle(e.pos, 'smoke', e.heavy ? 4 : 3, e.dir); if (e.id === 'p0') this.shake = Math.max(this.shake, .18); }
      if (e.type === 'boss' || e.type === 'boss_charge') { this.particle(e.pos, 'water', 30); this.shake = Math.max(this.shake, .55); }
      if (e.type === 'boss_phase') this.shake = Math.max(this.shake, .4);
      if (e.type === 'hit' || e.type === 'rock_hit') { this.particle(e.pos, 'wood', 5); this.particle(e.pos, 'fire', 2); this.particle(e.pos, 'smoke', 2); if (e.id === 'p0') this.shake = .4; }
      if (e.type === 'splash' || e.type === 'blast') { this.particle(e.pos, 'water', e.type === 'blast' ? 16 : 4); }
      if (e.type === 'chain_blast') { this.particle(e.pos, 'fire', 22); this.particle(e.pos, 'smoke', 10); this.particle(e.pos, 'wood', 12); this.shake = .6; }
      if (e.type === 'sunk') {
        this.particle(e.pos, 'fire', 14); this.particle(e.pos, 'smoke', 13); this.particle(e.pos, 'wood', 18); this.particle(e.pos, 'water', 12);
        const r = this.units.get(e.id);
        if (r && r.generation === e.generation) { this.units.delete(e.id); r.marker.visible = false; this.wrecks.push({ ...r, age: 0, pos: e.pos }); }
        this.shake = Math.max(this.shake, .35);
      }
    }
  }
  render(sim, dt, menu = false) {
    this.time += dt; this.water.material.uniforms.time.value = this.time;
    this.storm.scale.set(sim.radius(), 1, sim.radius()); this.stormEdge.scale.setScalar(sim.radius());
    this.wakeClock += dt;
    for (const u of sim.units) {
      if (u.hp <= 0) continue;
      let r = this.units.get(u.id);
      if (!r || r.generation !== u.generation) { if (r) this.world.remove(r.root); r = this.createUnit(u); }
      r.root.position.copy(V(u.pos, Math.sin(this.time * 1.8 + Number(u.id[1])) * .25));
      r.root.rotation.set(0, -u.heading, Math.sin(this.time * 1.2 + u.pos.x) * .018);
      if (this.wakeClock > .14 && u.burn?.until > sim.time) { this.particle(u.pos, 'fire', 1); this.particle(u.pos, 'smoke', 1); }
      r.marker.material.color.set(u.boss && u.openUntil > sim.time ? '#f9dd8a' : u.player ? '#f6da96' : u.team ? '#df7058' : '#73d9c4');
      if (this.wakeClock > .14 && Math.abs(u.speed) > 4) {
        const f = forward(u.heading), stern = { x: u.pos.x - f.x * 9 * u.bodyScale, y: u.pos.y - f.y * 9 * u.bodyScale };
        this.particle(stern, 'wake', u.boss ? 5 : 2);
        if (u.charge) this.particle({ x: u.pos.x + f.x * u.radius, y: u.pos.y + f.y * u.radius }, 'water', 3);
      }
    }
    if (this.wakeClock > .14) this.wakeClock = 0;
    this.syncMeshes(this.pickups, sim.pickups, p => {
      const root = models.get(p.kind).clone(true); root.scale.setScalar(1.3); this.world.add(root); return root;
    }, (root, p) => { root.position.copy(V(p.pos, 1.3 + Math.sin(this.time * 2 + p.id) * .35)); root.rotation.y = this.time * .25 + p.id; });
    this.syncMeshes(this.shells, sim.projectiles, p => {
      const m = new THREE.Mesh(sphere, projectileMaterial); m.scale.setScalar(p.special ? 1.05 : p.gun === 'grapeshot' ? .3 : p.blast ? .75 : .52); this.world.add(m); return m;
    }, (m, p) => m.position.copy(V(p.pos, p.height)));
    this.syncMeshes(this.hazards, sim.hazards, h => this.createHazard(h), (root, h) => {
      root.visible = !menu;
      const urgency = clamp(1 - (h.impactAt - sim.time) / 1.5, 0, 1);
      root.children.forEach((mesh, i) => {
        mesh.material.opacity = i && !mesh.userData.fill ? .72 + Math.sin(sim.time * 10) * .16 : .09 + urgency * .16;
        mesh.material.color.set(sim.time >= h.impactAt ? '#ff1c0d' : '#f23e32');
      });
    });
    for (const w of this.wrecks) {
      w.age += dt; w.root.position.y = -w.age * 2; w.root.rotation.z += dt * .24;
      if (w.age > .7 && w.age - dt <= .7) { this.particle(w.pos, 'fire', 8); this.particle(w.pos, 'smoke', 6); }
      if (w.age > 5) { this.world.remove(w.root); w.marker.material.dispose(); }
    }
    this.wrecks = this.wrecks.filter(w => w.age <= 5);
    for (const p of this.particles) {
      p.age += dt; p.mesh.position.addScaledVector(p.vel, dt);
      if (p.type === 'water' || p.type === 'wood') p.vel.y -= 20 * dt;
      const t = p.age / p.life; p.mesh.material.opacity = (1 - t) * (p.type === 'smoke' ? .48 : .9);
      if (p.type === 'smoke' || p.type === 'fire') p.mesh.scale.setScalar(p.size * (1 + t * 3));
      if (p.type === 'wake') p.mesh.scale.set(p.size * (1 + t * 3), .08, p.size * (1 + t * 3));
      if (p.age >= p.life) { this.scene.remove(p.mesh); p.mesh.material.dispose(); }
    }
    this.particles = this.particles.filter(p => p.age < p.life);
    const player = sim.unit('p0'), target = sim.unit(player.target);
    this.targetRing.visible = !menu && !!target && target.hp > 0;
    if (target) { this.targetRing.position.copy(V(target.pos, .5)); this.targetRing.scale.setScalar(target.radius + 6); }
    // Keep the locked enemy ahead of the camera while the hull turns independently for a broadside.
    const facing = menu ? this.time * .055 + 2.4 : target && target.hp > 0
      ? Math.atan2(target.pos.x - player.pos.x, player.pos.y - target.pos.y) : player.heading;
    const f = forward(facing), desired = V(player.pos);
    const portrait = innerHeight > innerWidth;
    const giant = target?.boss && target.hp > 0 && !menu ? 8 : 0;
    desired.add(new THREE.Vector3(-f.x * ((portrait ? 64 : 56) + giant), (portrait ? 44 : 36) + giant * .5, -f.y * ((portrait ? 64 : 56) + giant)));
    const look = V(player.pos, 3 + giant * .5).add(new THREE.Vector3(f.x * 25, 0, f.y * 25));
    if (target && !menu && target.hp > 0) {
      const dx = target.pos.x - player.pos.x, dz = target.pos.y - player.pos.y;
      look.x += clamp(dx * .08, -12, 12); look.z += clamp(dz * .08, -12, 12);
    }
    if (!this.cameraReady) { this.cameraBase.copy(desired); this.look = look.clone(); this.cameraReady = true; }
    this.cameraBase.lerp(desired, 1 - Math.exp(-dt * 4)); this.look.lerp(look, 1 - Math.exp(-dt * 4));
    this.shake = Math.max(0, this.shake - dt * .8);
    this.camera.position.copy(this.cameraBase);
    this.camera.position.y += Math.sin(this.time * 75) * this.shake;
    this.camera.lookAt(this.look); this.renderer.render(this.scene, this.camera);
  }
  syncMeshes(map, items, create, update) {
    const ids = new Set(items.map(p => p.id));
    for (const [id, mesh] of map) if (!ids.has(id)) { this.world.remove(mesh); mesh.userData.dispose?.(); map.delete(id); }
    for (const p of items) { let m = map.get(p.id); if (!m) { m = create(p); map.set(p.id, m); } update(m, p); }
  }
  screenPosition(pos, height = 17) {
    const p = V(pos, height).project(this.camera);
    return { x: (p.x * .5 + .5) * innerWidth, y: (-p.y * .5 + .5) * innerHeight, visible: p.z > -1 && p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1 };
  }
  stats() { return { models: [...models.keys()], drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, camera: this.camera.position.toArray(),
    ships: [...this.units].map(([id, r]) => ({ id, boss: r.boss, length: r.modelLength, height: r.modelHeight })) }; }
}
