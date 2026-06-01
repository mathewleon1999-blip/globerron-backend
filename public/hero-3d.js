(() => {
  const canvas = document.getElementById("hero-canvas")
  if (!canvas) return

const scene = new THREE.Scene()

const camera = new THREE.PerspectiveCamera(
  45,
  canvas.clientWidth / canvas.clientHeight,
  0.1,
  100
)

camera.position.set(0, 1.2, 3)

const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  alpha: true,
  antialias: true
})

renderer.setSize(canvas.clientWidth, canvas.clientHeight)
renderer.setPixelRatio(window.devicePixelRatio)

// Lights
const keyLight = new THREE.DirectionalLight(0xffffff, 1.2)
keyLight.position.set(5, 10, 5)
scene.add(keyLight)

const fillLight = new THREE.DirectionalLight(0xffffff, 0.6)
fillLight.position.set(-5, 5, -5)
scene.add(fillLight)

scene.add(new THREE.AmbientLight(0xffffff, 0.4))

// Load model
const loader = new THREE.GLTFLoader()
let model = null

loader.load(
  "/models/rotor_disc_brake_e_vs.glb",
  gltf => {
    model = gltf.scene

    model.scale.set(1.5, 1.5, 1.5)
    model.position.set(0, -0.8, 0)
    model.rotation.x = 0.2

    scene.add(model)
  },
  undefined,
  error => {
    console.error("GLB load error", error)
  }
)

// Animation loop
function animate() {
  requestAnimationFrame(animate)

  if (model) {
    model.rotation.y += 0.004
  }

  renderer.render(scene, camera)
}

animate()

// Resize handling
window.addEventListener("resize", () => {
  const width = canvas.clientWidth
  const height = canvas.clientHeight

  camera.aspect = width / height
  camera.updateProjectionMatrix()

  renderer.setSize(width, height)
})
})();
