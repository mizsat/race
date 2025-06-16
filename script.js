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
    Space: false, // Add Space for braking
};

init();
animate();

function init() {
    // Three.js Initialization
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xabcdef);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // 車両の初期位置を考慮してカメラの初期位置と注視点を設定
    const initialChassisPosition = new THREE.Vector3(-25, 1, 0); // createChassisでの設定値
    const cameraOffset = new THREE.Vector3(0, 3, -7); // 車両後方のオフセット
    camera.position.copy(initialChassisPosition).add(cameraOffset);
    camera.lookAt(initialChassisPosition);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 50, 5); // ライトのY座標を20から50に変更
    directionalLight.castShadow = true;

    directionalLight.shadow.camera.left = -120;
    directionalLight.shadow.camera.right = 120;
    directionalLight.shadow.camera.top = 130;
    directionalLight.shadow.camera.bottom = -130;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500; // farの値を元に戻す
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    scene.add(directionalLight);

    // シャドウカメラヘルパー (デバッグ用、必要に応じてコメント解除)
    const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
    scene.add(shadowHelper);

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
    const groundHeight = 0.1;
    const straightLength = 150; // 直線の長さを200から150に変更
    const straightWidth = 10;
    const straightSpacing = 50; // 2つの直線間の距離（中心から中心まで）

    const groundMaterialCannon = material;

    const checkerboardTexture = createCheckerboardTexture(64, 64, 8, 8, '#aaaaaa', '#bbbbbb');
    // テクスチャリピートは各セクションで設定するため、ここでは共通設定をコメントアウト
    // checkerboardTexture.wrapS = THREE.RepeatWrapping;
    // checkerboardTexture.wrapT = THREE.RepeatWrapping;

    const groundMaterialThree = new THREE.MeshStandardMaterial({
        map: checkerboardTexture.clone(), // Clone texture for independent repeat settings if needed
    });
    groundMaterialThree.map.wrapS = THREE.RepeatWrapping;
    groundMaterialThree.map.wrapT = THREE.RepeatWrapping;


    // 1本目の直線
    createStraightSection(groundMaterialThree, groundMaterialCannon, straightWidth, groundHeight, straightLength, new THREE.Vector3(-straightSpacing / 2, -groundHeight / 2, 0));

    // 2本目の直線
    createStraightSection(groundMaterialThree, groundMaterialCannon, straightWidth, groundHeight, straightLength, new THREE.Vector3(straightSpacing / 2, -groundHeight / 2, 0));

    // コーナー部分のパラメータ
    const R_inner = straightSpacing / 2 - straightWidth / 2; // 20
    const R_outer = straightSpacing / 2 + straightWidth / 2; // 30
    const arcCenterY = -groundHeight / 2;

    // コーナー1 (ポジティブ Z側)
    const arcPos1 = new THREE.Vector3(0, arcCenterY, straightLength / 2);
    // shapeはXY平面で定義: 左(-X)から右(+X)へ半円、外側の円弧は時計回り
    createCornerSection(groundMaterialThree, groundMaterialCannon, arcPos1, R_inner, R_outer, groundHeight, Math.PI, 0, true, "corner1");

    // コーナー2 (ネガティブ Z側)
    const arcPos2 = new THREE.Vector3(0, arcCenterY, -straightLength / 2);
    // shapeはXY平面で定義: 右(+X)から左(-X)へ半円、外側の円弧は時計回り
    createCornerSection(groundMaterialThree, groundMaterialCannon, arcPos2, R_inner, R_outer, groundHeight, 0, Math.PI, true, "corner2");
}

function createStraightSection(threeMaterial, cannonMaterial, width, height, length, position) {
    // Three.js Mesh
    const geometry = new THREE.BoxGeometry(width, height, length);
    const material = threeMaterial.clone(); // Clone material for independent texture repeat
    material.map = threeMaterial.map.clone(); // Clone texture for independent repeat
    material.map.needsUpdate = true;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.receiveShadow = true;
    scene.add(mesh);

    if (mesh.material.map) {
        // 1タイルの物理的なサイズを targetTileSize とする (例: 1x1ユニット)
        const targetTileSize = 1;
        mesh.material.map.repeat.set(width / targetTileSize, length / targetTileSize);
        mesh.material.map.needsUpdate = true;
    }

    // Cannon.js Body
    const shape = new CANNON.Box(new CANNON.Vec3(width * 0.5, height * 0.5, length * 0.5));
    const body = new CANNON.Body({ mass: 0, material: cannonMaterial });
    body.addShape(shape);
    body.position.copy(position);
    world.addBody(body);
}

function createCornerSection(threeMaterial, cannonMaterial, arcCenterPos, innerRadius, outerRadius, groundHeight, shapeStartAngle, shapeEndAngle, shapeOuterArcClockwise, name) {
    const shape = new THREE.Shape();
    shape.moveTo(innerRadius * Math.cos(shapeStartAngle), innerRadius * Math.sin(shapeStartAngle));
    shape.absarc(0, 0, innerRadius, shapeStartAngle, shapeEndAngle, !shapeOuterArcClockwise);
    shape.lineTo(outerRadius * Math.cos(shapeEndAngle), outerRadius * Math.sin(shapeEndAngle));
    shape.absarc(0, 0, outerRadius, shapeEndAngle, shapeStartAngle, shapeOuterArcClockwise);
    shape.closePath();

    const extrudeSettings = {
        depth: groundHeight,
        bevelEnabled: false,
    };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateX(-Math.PI / 2); // XY平面で作成したshapeをXZ平面に配置

    const material = threeMaterial.clone();
    material.map = threeMaterial.map.clone();
    material.map.needsUpdate = true;
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(arcCenterPos);
    mesh.receiveShadow = true;
    mesh.name = name; // デバッグ用に名前を付ける
    scene.add(mesh);
    
    // テクスチャリピートの調整（コーナー用） - 一時的にコメントアウトして表示を確認
    if (mesh.material.map) {
        // const courseWidth = outerRadius - innerRadius; 
        // const averageCircumference = Math.PI * (innerRadius + outerRadius); 
        
        // mesh.material.map.repeat.set(courseWidth / 5, averageCircumference / 20);
        // mesh.material.map.wrapS = THREE.RepeatWrapping;
        // mesh.material.map.wrapT = THREE.RepeatWrapping;
        mesh.material.map.needsUpdate = true; // Ensure map update is flagged
    }


    // Cannon.js Body
    const threeVertices = geometry.attributes.position.array;
    const cannonVertices = Array.from(threeVertices);
    let cannonIndices;
    if (geometry.index) {
        cannonIndices = Array.from(geometry.index.array);
    } else {
        cannonIndices = [];
        for (let i = 0; i < geometry.attributes.position.count / 3; i++) {
            cannonIndices.push(i * 3 + 0, i * 3 + 1, i * 3 + 2);
        }
    }

    const cannonShape = new CANNON.Trimesh(cannonVertices, cannonIndices);
    const body = new CANNON.Body({ mass: 0, material: cannonMaterial });
    body.addShape(cannonShape);
    body.position.copy(mesh.position);
    body.quaternion.copy(mesh.quaternion); // meshの回転を物理ボディに適用 (geometry.rotateXのため不要なはず)
    world.addBody(body);
}

function createChassis(material) {
    const chassisSize = { x: 1, y: 0.5, z: 2 }; // width, height, length

    // Cannon.js Chassis Body
    const chassisShape = new CANNON.Box(new CANNON.Vec3(chassisSize.x * 0.5, chassisSize.y * 0.5, chassisSize.z * 0.5));
    chassisBody = new CANNON.Body({ mass: 300, material: material }); // Increased mass from 150 to 300
    chassisBody.addShape(chassisShape);
    // 車両の初期位置を1本目の直線コース上に調整
    const straightSpacing = 50; // createGroundで定義した値と同じにする
    chassisBody.position.set(-straightSpacing / 2, 1, 0); // X座標を-25に、Yは1、Zは0
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

    const { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Space } = keyMap;

    const engineForceMagnitude = 1000;
    const steeringMagnitude = 0.5;
    const brakeForce = 100; // Adjust brake force as needed

    let currentEngineForce = 0;
    if (ArrowUp) {
        currentEngineForce = -engineForceMagnitude;
    }
    if (ArrowDown) {
        currentEngineForce = engineForceMagnitude;
    }

    let currentSteeringValue = 0;
    if (ArrowLeft) {
        currentSteeringValue = steeringMagnitude;
    }
    if (ArrowRight) {
        currentSteeringValue = -steeringMagnitude;
    }

    // Apply engine force to rear wheels
    vehicle.applyEngineForce(currentEngineForce, 2);
    vehicle.applyEngineForce(currentEngineForce, 3);

    // Apply steering to front wheels
    vehicle.setSteeringValue(currentSteeringValue, 0);
    vehicle.setSteeringValue(currentSteeringValue, 1);

    // Apply brake
    if (Space) {
        vehicle.setBrake(brakeForce, 0);
        vehicle.setBrake(brakeForce, 1);
        vehicle.setBrake(brakeForce, 2);
        vehicle.setBrake(brakeForce, 3);
    } else {
        // Release brake if space is not pressed
        vehicle.setBrake(0, 0);
        vehicle.setBrake(0, 1);
        vehicle.setBrake(0, 2);
        vehicle.setBrake(0, 3);
    }

    // Automatic braking when no acceleration/deceleration input
    if (!ArrowUp && !ArrowDown && !Space) { // Also check if Space is not pressed
        const autoBrakeForce = 2; // Gentle automatic brake, reduced from 10
        vehicle.setBrake(autoBrakeForce, 0);
        vehicle.setBrake(autoBrakeForce, 1);
        vehicle.setBrake(autoBrakeForce, 2);
        vehicle.setBrake(autoBrakeForce, 3);
    }
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

    // Update camera position to follow the chassis
    if (chassisMesh) {
        const chassisPosition = chassisMesh.position;
        const chassisQuaternion = chassisMesh.quaternion;

        // Define camera offset from the chassis (behind and slightly above)
        const cameraOffset = new THREE.Vector3(0, 3, -7); // x, y, z in chassis local space
        // Apply chassis rotation to the offset
        const worldOffset = cameraOffset.clone().applyQuaternion(chassisQuaternion);
        // Calculate target camera position
        const cameraTargetPosition = new THREE.Vector3().addVectors(chassisPosition, worldOffset);

        // Smoothly move camera towards the target position (optional, can use direct set for now)
        camera.position.lerp(cameraTargetPosition, 0.1); // Adjust 0.1 for different smoothing speeds
        // camera.position.copy(cameraTargetPosition); // For direct setting without smoothing

        // Make camera look at the chassis
        camera.lookAt(chassisPosition);
    }

    // Display speed
    if (chassisBody) {
        const speed = chassisBody.velocity.length(); // m/s
        const speedKmh = (speed * 3.6).toFixed(1); // km/h, 1 decimal place
        const speedometerElement = document.getElementById('speedometer');
        if (speedometerElement) {
            speedometerElement.textContent = `Speed: ${speedKmh} km/h`;
        }

        // Display coordinates
        const coordinatesElement = document.getElementById('coordinates');
        if (coordinatesElement) {
            const x = chassisBody.position.x.toFixed(2);
            const y = chassisBody.position.y.toFixed(2);
            const z = chassisBody.position.z.toFixed(2);
            coordinatesElement.textContent = `X: ${x}, Y: ${y}, Z: ${z}`;
        }
    }

    renderer.render(scene, camera);
}

function createCheckerboardTexture(width, height, segmentsX, segmentsY, color1, color2) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');

    const segmentWidth = width / segmentsX;
    const segmentHeight = height / segmentsY;

    for (let y = 0; y < segmentsY; y++) {
        for (let x = 0; x < segmentsX; x++) {
            context.fillStyle = (x + y) % 2 === 0 ? color1 : color2;
            context.fillRect(x * segmentWidth, y * segmentHeight, segmentWidth, segmentHeight);
        }
    }
    return new THREE.CanvasTexture(canvas);
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
