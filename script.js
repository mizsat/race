// --- Three.js setup ---
let scene, camera, renderer;

// --- Cannon.js setup ---
let world;
let chassisBody, chassisMesh;
let vehicle; // Add vehicle variable
const wheelMeshes = []; // Array to store wheel meshes

// --- Control parameters ---
const moveForce = 500; // Force for forward/backward movement
const steerTorque = 200; // Torque for steering

// --- Key input state ---
const keyMap = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
};

init();
animate();

function init() {
    // Three.js Initialization
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xabcdef);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Cannon.js Initialization
    world = new CANNON.World();
    world.gravity.set(0, -9.82, 0);
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.solver.iterations = 10;

    // Materials
    const groundMaterialCannon = new CANNON.Material("groundMaterial");
    const chassisMaterialCannon = new CANNON.Material("chassisMaterial");

    const groundChassisContactMaterial = new CANNON.ContactMaterial(
        groundMaterialCannon,
        chassisMaterialCannon,
        {
            friction: 0.5, // Friction between ground and chassis
            restitution: 0.1, // Bounciness
        }
    );
    world.addContactMaterial(groundChassisContactMaterial);

    // Create Ground
    createGround(groundMaterialCannon);

    // Create Chassis
    createChassis(chassisMaterialCannon);

    // Keyboard Controls
    setupKeyboardControls();

    // Window Resize
    window.addEventListener('resize', onWindowResize, false);
}

function createGround(material) {
    // Three.js Ground
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // Cannon.js Ground
    const groundShape = new CANNON.Plane();
    const groundBody = new CANNON.Body({ mass: 0, material: material });
    groundBody.addShape(groundShape);
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    world.addBody(groundBody);
}

function createChassis(material) {
    const chassisSize = { x: 1, y: 0.5, z: 2 }; // width, height, length

    // Cannon.js Chassis Body
    const chassisShape = new CANNON.Box(new CANNON.Vec3(chassisSize.x * 0.5, chassisSize.y * 0.5, chassisSize.z * 0.5));
    chassisBody = new CANNON.Body({ mass: 150, material: material });
    chassisBody.addShape(chassisShape);
    chassisBody.position.set(0, 1, 0); // Start slightly above ground
    world.addBody(chassisBody);

    // Create RaycastVehicle
    vehicle = new CANNON.RaycastVehicle({
        chassisBody: chassisBody,
        indexForwardAxis: 2, // Z-axis
        indexRightAxis: 0,   // X-axis
        indexUpAxis: 1       // Y-axis
    });
    vehicle.addToWorld(world);

    // Add wheels to the vehicle
    addWheels(vehicle);

    // Three.js Chassis Mesh
    const chassisGeometry = new THREE.BoxGeometry(chassisSize.x, chassisSize.y, chassisSize.z);
    const chassisMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    chassisMesh = new THREE.Mesh(chassisGeometry, chassisMaterial);
    chassisMesh.castShadow = true;

    // Add AxesHelper to chassisMesh to see local orientation
    // Z-axis (blue) should point forward
    const axesHelper = new THREE.AxesHelper(2);
    chassisMesh.add(axesHelper);

    scene.add(chassisMesh);
}

function setupKeyboardControls() {
    document.addEventListener('keydown', (event) => {
        if (keyMap.hasOwnProperty(event.key)) {
            keyMap[event.key] = true;
        }
    });
    document.addEventListener('keyup', (event) => {
        if (keyMap.hasOwnProperty(event.key)) {
            keyMap[event.key] = false;
        }
    });
}

function applyForcesAndTorques() {
    if (!vehicle) return; // Ensure vehicle is initialized

    const { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } = keyMap;

    const engineForceMagnitude = 1000; // Increased from previous moveForce for better effect
    const steeringMagnitude = 0.5;   // Standard steering value range

    let currentEngineForce = 0;
    if (ArrowUp) {
        currentEngineForce = -engineForceMagnitude; // Negative force for forward movement
    }
    if (ArrowDown) {
        currentEngineForce = engineForceMagnitude;  // Positive force for backward movement
    }

    let currentSteeringValue = 0;
    if (ArrowLeft) {
        // If previous positive angular velocity (turnSpeed) caused a right turn,
        // we now need a negative steering value for a left turn.
        // currentSteeringValue = -steeringMagnitude; // This was still reversed
        currentSteeringValue = steeringMagnitude; // Try positive for left
    }
    if (ArrowRight) {
        // If previous negative angular velocity (-turnSpeed) caused a left turn,
        // we now need a positive steering value for a right turn.
        // currentSteeringValue = steeringMagnitude; // This was still reversed
        currentSteeringValue = -steeringMagnitude; // Try negative for right
    }

    // Apply engine force to rear wheels (indices 2 and 3 for RWD)
    vehicle.applyEngineForce(currentEngineForce, 2);
    vehicle.applyEngineForce(currentEngineForce, 3);

    // Apply steering to front wheels (indices 0 and 1)
    vehicle.setSteeringValue(currentSteeringValue, 0);
    vehicle.setSteeringValue(currentSteeringValue, 1);

    // Old damping logic for chassisBody.velocity and chassisBody.angularVelocity is removed
    // as RaycastVehicle handles its own physics and damping through wheel parameters.
}

function animate() {
    requestAnimationFrame(animate);

    const deltaTime = 1 / 60; // Fixed timestep
    world.step(deltaTime);

    applyForcesAndTorques();

    // Synchronize Three.js mesh with Cannon.js body
    if (chassisMesh && chassisBody) {
        chassisMesh.position.copy(chassisBody.position);
        chassisMesh.quaternion.copy(chassisBody.quaternion);
    }

    // Synchronize wheel meshes with Cannon.js wheelInfos
    for (let i = 0; i < vehicle.wheelInfos.length; i++) {
        vehicle.updateWheelTransform(i);
        const transform = vehicle.wheelInfos[i].worldTransform;
        const wheelMesh = wheelMeshes[i];
        wheelMesh.position.copy(transform.position);
        wheelMesh.quaternion.copy(transform.quaternion);
    }

    renderer.render(scene, camera);
}

function addWheels(vehicle) {
    const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const wheelRadius = 0.3;
    const wheelWidth = 0.2;
    const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 20);
    wheelGeometry.rotateZ(Math.PI / 2); // Rotate to align with axle

    const baseWheelOptions = {
        radius: wheelRadius,
        directionLocal: new CANNON.Vec3(0, -1, 0), // Downwards
        suspensionStiffness: 30,
        suspensionRestLength: 0.3,
        frictionSlip: 5,
        dampingRelaxation: 2.3,
        dampingCompression: 4.4,
        maxSuspensionForce: 100000,
        rollInfluence: 0.01,
        axleLocal: new CANNON.Vec3(1, 0, 0), // X-axis for wheel rotation
        // chassisConnectionPointLocal will be set for each wheel
        maxSuspensionTravel: 0.3,
        customSlidingRotationalSpeed: -30,
        useCustomSlidingRotationalSpeed: true
    };

    const wheelPositions = [
        new CANNON.Vec3(0.5, 0, 0.85),  // Front-left
        new CANNON.Vec3(-0.5, 0, 0.85), // Front-right
        new CANNON.Vec3(0.5, 0, -0.85), // Rear-left
        new CANNON.Vec3(-0.5, 0, -0.85)  // Rear-right
    ];

    wheelPositions.forEach(position => {
        const wheelOptions = { ...baseWheelOptions }; // Shallow copy base options
        wheelOptions.chassisConnectionPointLocal = position;
        vehicle.addWheel(wheelOptions);
    });

    for (let i = 0; i < vehicle.wheelInfos.length; i++) {
        const wheelMesh = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheelMesh.castShadow = true;
        // Initial position will be updated in animate loop
        scene.add(wheelMesh);
        wheelMeshes.push(wheelMesh);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
