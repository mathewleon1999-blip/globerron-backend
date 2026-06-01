/*
  Three.js Hero (no build step)
  - Loads Three.js from CDN (see index.html)
  - Renders a lightweight animated 3D scene into #three-hero canvas

  Notes:
  - This file is defensive: it won't crash if THREE isn't loaded yet.
  - Check DevTools Console for clear error messages.
*/

(() => {
  const canvas = document.getElementById('three-hero');
  if (!canvas) return;

  function startWhenReady(triesLeft = 80) {
    if (window.THREE && typeof window.THREE.WebGLRenderer === 'function') {
      start(window.THREE);
      return;
    }

    if (triesLeft <= 0) {
      console.error('[three-hero] Three.js failed to load. Ensure three.min.js is loaded before three-hero.js');
      return;
    }

    setTimeout(() => startWhenReady(triesLeft - 1), 100);
  }

  function start(THREE) {
    try {
      const prefersReducedMotion =
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // Renderer
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
      renderer.setClearAlpha(0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      // Scene
      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x050a12, 5.5, 16);

      // Camera
      const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
      camera.position.set(0, 0.35, 6);

      // Lights
      scene.add(new THREE.AmbientLight(0xffffff, 0.9));

      const key = new THREE.DirectionalLight(0x8bd3ff, 1.6);
      key.position.set(3, 4, 2);
      scene.add(key);

      const rimLight = new THREE.DirectionalLight(0x7cffa3, 1.0);
      rimLight.position.set(-4, 1.5, -2);
      scene.add(rimLight);

      const fill = new THREE.PointLight(0xffffff, 0.9, 30);
      fill.position.set(0, 2, 6);
      scene.add(fill);

      // Root group
      const root = new THREE.Group();
      scene.add(root);

      // Center the model and make it clearly visible in the hero
      root.scale.set(1.35, 1.35, 1.35);
      root.position.set(0, -0.05, 0);

      // Wheel assembly
      const wheel = new THREE.Group();
      root.add(wheel);

      // Face the camera (otherwise it can appear as a thin bar)
      wheel.rotation.x = Math.PI / 2;

      // Tire
      const tire = new THREE.Mesh(
        new THREE.TorusGeometry(1.35, 0.23, 26, 64),
        new THREE.MeshStandardMaterial({
          color: 0x0b1220,
          metalness: 0.05,
          roughness: 0.9
        })
      );
      wheel.add(tire);

      // Rim
      const rimGeo = new THREE.TorusGeometry(1.05, 0.14, 18, 64);
      const rim = new THREE.Mesh(
        rimGeo,
        new THREE.MeshStandardMaterial({
          color: 0xb7c5d8,
          metalness: 0.95,
          roughness: 0.22
        })
      );
      wheel.add(rim);

      // Hub
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 0.22, 32),
        new THREE.MeshStandardMaterial({
          color: 0x9fb0ca,
          metalness: 0.85,
          roughness: 0.28
        })
      );
      hub.rotation.x = Math.PI / 2;
      wheel.add(hub);

      // Spokes
      const spokeMat = new THREE.MeshStandardMaterial({
        color: 0xd7e2ef,
        metalness: 0.85,
        roughness: 0.26
      });
      const spokeCount = 6;
      for (let i = 0; i < spokeCount; i++) {
        const a = (i / spokeCount) * Math.PI * 2;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.95), spokeMat);
        spoke.position.set(Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0);
        spoke.rotation.z = a;
        wheel.add(spoke);
      }

      // Brake disc
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.88, 0.88, 0.08, 48),
        new THREE.MeshStandardMaterial({
          color: 0x7f8ea8,
          metalness: 0.65,
          roughness: 0.35,
          emissive: 0x0a1020,
          emissiveIntensity: 0.15
        })
      );
      disc.rotation.x = Math.PI / 2;
      disc.position.z = -0.2;
      wheel.add(disc);

      // Disc drill holes
      const holeMat = new THREE.MeshStandardMaterial({
        color: 0x0b1220,
        metalness: 0.1,
        roughness: 0.9
      });
      const holeGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.11, 16);
      const holeCount = 12;
      for (let i = 0; i < holeCount; i++) {
        const a = (i / holeCount) * Math.PI * 2;
        const hole = new THREE.Mesh(holeGeo, holeMat);
        hole.rotation.x = Math.PI / 2;
        hole.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, -0.2);
        wheel.add(hole);
      }

      // Caliper
      const caliper = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.6, 0.35),
        new THREE.MeshStandardMaterial({
          color: 0x0ea5e9,
          metalness: 0.35,
          roughness: 0.35,
          emissive: 0x06121f,
          emissiveIntensity: 0.25
        })
      );
      caliper.position.set(1.05, 0.2, 0.15);
      caliper.rotation.z = -0.35;
      wheel.add(caliper);

      // Wire overlay
      wheel.add(
        new THREE.Mesh(
          rimGeo,
          new THREE.MeshBasicMaterial({
            color: 0x86c5ff,
            wireframe: true,
            transparent: true,
            opacity: 0.1
          })
        )
      );

      // Particles
      const particlesCount = 700;
      const positions = new Float32Array(particlesCount * 3);
      for (let i = 0; i < particlesCount; i++) {
        const i3 = i * 3;
        const r = 7.5 * Math.cbrt(Math.random());
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i3 + 0] = r * Math.sin(phi) * Math.cos(theta);
        positions[i3 + 1] = r * Math.cos(phi) * 0.55;
        positions[i3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      }
      const particlesGeo = new THREE.BufferGeometry();
      particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const particles = new THREE.Points(
        particlesGeo,
        new THREE.PointsMaterial({
          color: 0x86c5ff,
          size: 0.02,
          transparent: true,
          opacity: 0.75,
          depthWrite: false
        })
      );
      scene.add(particles);

      // Resize
      function resize() {
        const parent = canvas.parentElement || document.body;
        const rect = parent.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));

        canvas.style.width = '100%';
        canvas.style.height = '100%';

        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }

      if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => resize());
        ro.observe(canvas.parentElement || canvas);
      }
      window.addEventListener('resize', resize, { passive: true });
      resize();

      // Pointer parallax
      const pointer = { x: 0, y: 0 };
      window.addEventListener(
        'pointermove',
        (e) => {
          const r = canvas.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width;
          const y = (e.clientY - r.top) / r.height;
          pointer.x = (x - 0.5) * 2;
          pointer.y = (y - 0.5) * 2;
        },
        { passive: true }
      );

      const clock = new THREE.Clock();

      // Render loop
      function animate() {
        const t = clock.getElapsedTime();
        const motion = prefersReducedMotion ? 0 : 1;

        // Spin like a wheel
        wheel.rotation.y = t * 0.9 * motion;

        // Small floating motion
        root.position.y = -0.05 + Math.sin(t * 0.9) * 0.05 * motion;

        camera.position.x = pointer.x * 0.35;
        camera.position.y = 0.35 + -pointer.y * 0.18;
        camera.lookAt(0, 0, 0);

        particles.rotation.y = t * 0.06 * motion;

        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      }

      animate();
    } catch (err) {
      console.error('[three-hero] Failed to initialize scene:', err);
    }
  }

  startWhenReady();
})();
