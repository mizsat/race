import * as THREE from 'https://cdn.skypack.dev/three@0.132.2';

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xabcdef); // Add background color
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // Enable shadows
document.body.appendChild(renderer.domElement);

// --- Course Dimensions (used by Minimap and Ground Graphics) ---
const groundHeightClient = 0.05; // Corresponds to server's groundHeight, changed from 0.1
const straightLengthClient = 70; // Match server-side
const straightWidthClient = 10;  // Match server-side
const straightSpacingClient = 40; // Match server-side

// --- Minimap Setup ---
const minimapContainer = document.getElementById('minimapContainer');
const minimapRenderer = new THREE.WebGLRenderer({ alpha: true }); // alpha: true for transparent background if needed
minimapContainer.appendChild(minimapRenderer.domElement);

const courseWidthEstimate = straightSpacingClient + straightWidthClient + 20; // Add some margin
const courseLengthEstimate = straightLengthClient + straightSpacingClient + 20; // Add some margin
const minimapCamHeight = 100; // Height of the minimap camera

// Define a fixed size for the minimap's view frustum
const minimapViewWidth = 80; // Fixed width for the orthographic camera's view - Decreased from 130 for zoom in
const minimapViewHeight = 80; // Fixed height for the orthographic camera's view - Decreased from 130 for zoom in

const minimapCamera = new THREE.OrthographicCamera(
    -minimapViewWidth / 2, minimapViewWidth / 2,
    minimapViewHeight / 2, -minimapViewHeight / 2,
    1, 1000 // near, far
);
minimapCamera.position.set(0, minimapCamHeight, 0); // Initial position
// minimapCamera.lookAt(0, 0, 0); // Will be updated to follow the car

// Helper function to update minimap renderer size
function updateMinimapView() {
    if (!minimapContainer) return;

    // const minimapRect = minimapContainer.getBoundingClientRect(); // Previous method
    // minimapRenderer.setSize(minimapRect.width, minimapRect.height); // Previous method

    // Use clientWidth and clientHeight to get the inner dimensions of the container (excluding border)
    minimapRenderer.setSize(minimapContainer.clientWidth, minimapContainer.clientHeight);

    // The camera's left, right, top, bottom (defining its frustum/view size) are now fixed
    // and do not change on resize. The renderer will scale the fixed view to fit the container.
}

// Initial setup of minimap view
updateMinimapView();

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); // Changed from 0.65 to 0.8
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // Changed from 0.85 to 1.0
directionalLight.position.set(10, 50, 5); // Match script.js: Y from 30 to 50, Z from 10 to 5
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
// Adjust shadow camera properties to cover a larger area, matching script.js
directionalLight.shadow.camera.left = -120;
directionalLight.shadow.camera.right = 120;
directionalLight.shadow.camera.top = 130;
directionalLight.shadow.camera.bottom = -130;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 500; // Match script.js: far from 200 to 500

scene.add(directionalLight);

// Optional: Shadow camera helper (for debugging shadow frustum)
// const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
// scene.add(shadowHelper);

// --- Texture Loader for Test Cube AND Course ---
const textureLoader = new THREE.TextureLoader(); // Combined loader
let courseTextureObject = null; // To store the loaded course texture and its properties
// let courseTextureNaturalWidth = 1; // No longer strictly needed for repeat logic if using fixed tile size
// let courseTextureNaturalHeight = 1; // No longer strictly needed for repeat logic if using fixed tile size
const TEXTURE_TILE_SIZE = 5.0; // World units for one tile of the texture - Changed from 20.0 to 5.0

// --- Ground Graphics (Oval Course) ---
const baseGroundMaterial = new THREE.MeshStandardMaterial({
    // color: 0x808080, // Will be replaced by texture if loaded
    roughness: 0.8,
    metalness: 0.2
});

textureLoader.load(
    'texture.jpg', // Path to your texture
    function (texture) { // onLoad callback
        console.log('Course texture loaded successfully!');
        texture.encoding = THREE.sRGBEncoding; // Important for color accuracy
        
        // Set wrapping to RepeatWrapping for the original texture
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;

        courseTextureObject = texture; // Store the loaded texture
        // if (texture.image && texture.image.naturalWidth > 0 && texture.image.naturalHeight > 0) {
        //     courseTextureNaturalWidth = texture.image.naturalWidth;
        //     courseTextureNaturalHeight = texture.image.naturalHeight;
        //     console.log(`Texture dimensions: ${courseTextureNaturalWidth}x${courseTextureNaturalHeight}`);
        // } else {
        //     console.warn('Texture image not yet fully available or has zero dimensions.');
        // }
        
        baseGroundMaterial.color.set(0xffffff); 

        // Create the oval course graphics NOW that the texture is loaded
        // Straight 1
        createStraightSectionGraphics(straightWidthClient, groundHeightClient, straightLengthClient, 
            new THREE.Vector3(-straightSpacingClient / 2, -groundHeightClient / 2, 0),
            courseTextureObject // Pass the loaded texture object
        );
        // Straight 2
        createStraightSectionGraphics(straightWidthClient, groundHeightClient, straightLengthClient, 
            new THREE.Vector3(straightSpacingClient / 2, -groundHeightClient / 2, 0),
            courseTextureObject // Pass the loaded texture object
        );

        // Corner parameters
        const R_inner_client = straightSpacingClient / 2 - straightWidthClient / 2;
        const R_outer_client = straightSpacingClient / 2 + straightWidthClient / 2;
        const arcCenterY_client = -groundHeightClient / 2;

        // Corner 1 (Positive Z)
        const arcPos1_client = new THREE.Vector3(0, arcCenterY_client, straightLengthClient / 2);
        createCornerSectionGraphics(arcPos1_client, R_inner_client, R_outer_client, groundHeightClient, Math.PI, 0, true, "corner1_graphics", courseTextureObject);

        // Corner 2 (Negative Z)
        const arcPos2_client = new THREE.Vector3(0, arcCenterY_client, -straightLengthClient / 2);
        createCornerSectionGraphics(arcPos2_client, R_inner_client, R_outer_client, groundHeightClient, 0, Math.PI, true, "corner2_graphics", courseTextureObject);

        console.log("Oval course graphics setup initiated with texture.");
    },
    undefined, // onProgress callback currently not used
    function (err) { // onError callback
        console.error('An error happened during course texture loading:', err);
        baseGroundMaterial.color.set(0x888888); // Fallback color if texture fails
        baseGroundMaterial.map = null;
        baseGroundMaterial.needsUpdate = true;

        console.log("Oval course graphics setup initiated WITHOUT texture due to loading error. Will be grey.");
        // Straight 1
        createStraightSectionGraphics(straightWidthClient, groundHeightClient, straightLengthClient, 
            new THREE.Vector3(-straightSpacingClient / 2, -groundHeightClient / 2, 0) // No texture passed
        );
        // Straight 2
        createStraightSectionGraphics(straightWidthClient, groundHeightClient, straightLengthClient, 
            new THREE.Vector3(straightSpacingClient / 2, -groundHeightClient / 2, 0) // No texture passed
        );
        // Corner parameters
        const R_inner_client = straightSpacingClient / 2 - straightWidthClient / 2;
        const R_outer_client = straightSpacingClient / 2 + straightWidthClient / 2;
        const arcCenterY_client = -groundHeightClient / 2;
        // Corner 1 (Positive Z)
        const arcPos1_client = new THREE.Vector3(0, arcCenterY_client, straightLengthClient / 2);
        createCornerSectionGraphics(arcPos1_client, R_inner_client, R_outer_client, groundHeightClient, Math.PI, 0, true, "corner1_graphics"); // No texture
        // Corner 2 (Negative Z)
        const arcPos2_client = new THREE.Vector3(0, arcCenterY_client, -straightLengthClient / 2);
        createCornerSectionGraphics(arcPos2_client, R_inner_client, R_outer_client, groundHeightClient, 0, Math.PI, true, "corner2_graphics"); // No texture
    }
);


function createStraightSectionGraphics(width, height, length, position, textureInstance) { 
    const geometry = new THREE.BoxGeometry(width, height, length);
    const material = baseGroundMaterial.clone(); // Clone the base material

    if (textureInstance && textureInstance.isTexture) {
        const clonedTexture = textureInstance.clone(); // Clone the texture itself
        clonedTexture.needsUpdate = true; // Important for cloned texture
        
        // Ensure wrap settings are on the clone as well (inherited, but good to be explicit if ever changed)
        clonedTexture.wrapS = THREE.RepeatWrapping;
        clonedTexture.wrapT = THREE.RepeatWrapping;

        // Calculate repeat based on geometry size and desired tile size
        const repeatX = width / TEXTURE_TILE_SIZE;
        const repeatY = length / TEXTURE_TILE_SIZE; // For BoxGeometry top face, length corresponds to V direction
        
        clonedTexture.repeat.set(repeatX, repeatY);
        clonedTexture.offset.set(0, 0); // No offset needed for simple repeat
        
        material.map = clonedTexture;
        material.color.set(0xffffff); // Ensure texture colors are shown
    } else {
         material.color.set(0x707070); 
         material.map = null;
    }
    material.needsUpdate = true; 

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.receiveShadow = true;
    scene.add(mesh);
}

function createCornerSectionGraphics(arcCenterPos, innerRadius, outerRadius, height, shapeStartAngle, shapeEndAngle, shapeOuterArcClockwise, name, textureInstance) {
    const shape = new THREE.Shape();
    shape.moveTo(innerRadius * Math.cos(shapeStartAngle), innerRadius * Math.sin(shapeStartAngle));
    shape.absarc(0, 0, innerRadius, shapeStartAngle, shapeEndAngle, !shapeOuterArcClockwise);
    shape.lineTo(outerRadius * Math.cos(shapeEndAngle), outerRadius * Math.sin(shapeEndAngle));
    shape.absarc(0, 0, outerRadius, shapeEndAngle, shapeStartAngle, shapeOuterArcClockwise);
    shape.closePath();

    const extrudeSettings = {
        depth: height,
        bevelEnabled: false,
    };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateX(-Math.PI / 2); // Align with XZ plane

    // --- UV Adjustment for Extruded Top Surface (Normalization) ---
    const positions = geometry.attributes.position.array;
    const uvs = geometry.attributes.uv.array;
    const numVertices = positions.length / 3;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < numVertices; i++) {
        const x = positions[i * 3];
        const z = positions[i * 3 + 2]; 
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
    }

    const rangeX = maxX - minX; // This is the width of the corner's bounding box
    const rangeZ = maxZ - minZ; // This is the "depth" or "height" of the corner's bounding box in its local Z

    if (rangeX > 0 && rangeZ > 0) {
        for (let i = 0; i < numVertices; i++) {
            const x = positions[i * 3];
            const z = positions[i * 3 + 2];
            uvs[i * 2] = (x - minX) / rangeX;         
            uvs[i * 2 + 1] = 1.0 - ((z - minZ) / rangeZ); 
        }
        geometry.attributes.uv.needsUpdate = true;
        console.log(`UVs normalized for corner: ${name} (Range X: ${rangeX.toFixed(2)}, Range Z: ${rangeZ.toFixed(2)})`);
    }
    // --- End of UV Normalization ---

    const material = baseGroundMaterial.clone();
    
    if (textureInstance && textureInstance.isTexture && rangeX > 0 && rangeZ > 0) {
        const clonedTexture = textureInstance.clone(); // Clone the texture
        clonedTexture.needsUpdate = true;
        
        clonedTexture.wrapS = THREE.RepeatWrapping;
        clonedTexture.wrapT = THREE.RepeatWrapping;

        // Calculate repeat based on the corner's bounding box and desired tile size
        // The UVs are already normalized (0-1) across this rangeX and rangeZ.
        const repeatU = rangeX / TEXTURE_TILE_SIZE;
        const repeatV = rangeZ / TEXTURE_TILE_SIZE;
        
        clonedTexture.repeat.set(repeatU, repeatV);
        clonedTexture.offset.set(0, 0);

        material.map = clonedTexture;
        material.color.set(0xffffff);
    } else {
        material.color.set(0x606060); 
        material.map = null;
    }
    material.needsUpdate = true; 

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(arcCenterPos);
    mesh.position.y -= height / 2; // Adjust Y position to align top surface
    mesh.receiveShadow = true;
    mesh.name = name;
    scene.add(mesh);
}

// --- Start Line ---
const startLineWidth = straightWidthClient; // Match straight section width
const startLineDepth = 0.5; // How wide the line is along the Z axis
const startLineHeight = 0.01; // Made very thin to appear like a line painted on the course

const startLineGeometry = new THREE.BoxGeometry(startLineWidth, startLineHeight, startLineDepth);
const startLineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
const startLineMesh = new THREE.Mesh(startLineGeometry, startLineMaterial);

// Position it on the first straight section, at Z=0
startLineMesh.position.set(
    -straightSpacingClient / 2, // X position of the first straight
    (startLineHeight / 2) + 0.001, // Y position: center of the thin line + very small offset above course (Y=0)
    0 // Z position (center of the straight)
);
startLineMesh.receiveShadow = false; // Start line probably doesn't need to receive shadows
scene.add(startLineMesh); // Add start line to the scene
console.log('Start line mesh (enlarged) added to scene at X:', startLineMesh.position.x, 'Y:', startLineMesh.position.y, 'Z:', startLineMesh.position.z, 'Size (W,H,D):', startLineWidth, startLineHeight, startLineDepth);

console.log("Oval course graphics setup initiated.");

// --- Fallback Ground (Safety Net) ---
// Calculate the actual bounding box of the course
const courseMaxX = (straightSpacingClient / 2) + (straightWidthClient / 2);
const courseMinX = -courseMaxX;
const courseActualWidth = courseMaxX - courseMinX; // straightSpacingClient + straightWidthClient

const R_outer_client_for_calc = straightSpacingClient / 2 + straightWidthClient / 2;
const courseMaxZ = (straightLengthClient / 2) + R_outer_client_for_calc;
const courseMinZ = -(straightLengthClient / 2) - R_outer_client_for_calc;
const courseActualLength = courseMaxZ - courseMinZ; // straightLengthClient + 2 * R_outer_client_for_calc = straightLengthClient + straightSpacingClient + straightWidthClient

const margin = 40;
const safetyGroundSizeX = courseActualWidth + margin * 4; // Changed from margin * 2 to margin * 4
const safetyGroundSizeZ = courseActualLength + margin * 4; // Changed from margin * 2 to margin * 4

const safetyGroundHeight = 1; // Thickness of the safety ground
// Position its top surface at the bottom of the course
const safetyGroundYPosition = -groundHeightClient - (safetyGroundHeight / 2); // Adjusted for new groundHeightClient logic

const safetyGroundGeometry = new THREE.BoxGeometry(safetyGroundSizeX, safetyGroundHeight, safetyGroundSizeZ);
const safetyGroundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x404040, // Dark grey
    roughness: 0.9,
    metalness: 0.1 
});
const safetyGroundMesh = new THREE.Mesh(safetyGroundGeometry, safetyGroundMaterial);
safetyGroundMesh.position.set(0, safetyGroundYPosition, 0);
safetyGroundMesh.receiveShadow = true; // It can receive shadows from the course/vehicles
scene.add(safetyGroundMesh);
console.log(`Safety ground added at Y: ${safetyGroundYPosition} with size X: ${safetyGroundSizeX}, Z: ${safetyGroundSizeZ}`);


// --- Vehicle Graphics (Manages multiple vehicles) ---
const vehicleMeshes = {}; // Stores vehicle meshes (chassis + wheels) by ID
let myVehicleId = null; // To identify the client's own vehicle

// DOM elements for displaying info
const positionDataElement = document.getElementById('positionData');
const speedDataElement = document.getElementById('speedData');
const onCourseDataElement = document.getElementById('onCourseData'); // Added for onCourse status

// Vehicle dimensions (should match server-side for consistency in appearance)
const chassisSize = { x: 1, y: 0.5, z: 2 };
const wheelRadius = 0.3; // Added initializer
const wheelWidth = 0.3; // For CylinderGeometry - Changed from 0.2 to 0.3

function createVehicleGraphic(vehicleId, color = 0xff0000) { // Add color parameter, default to red
    const chassisGeometry = new THREE.BoxGeometry(chassisSize.x, chassisSize.y, chassisSize.z);
    // Assign a unique color to each vehicle's chassis for differentiation
    const chassisMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color), // Use the provided color
        roughness: 0.5,
        metalness: 0.5
    });
    const chassisMesh = new THREE.Mesh(chassisGeometry, chassisMaterial);
    chassisMesh.castShadow = true;
    scene.add(chassisMesh);

    const wheels = [];
    const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24);
    // Rotate cylinder to align with wheel axle (axle is along X-axis)
    wheelGeometry.rotateZ(Math.PI / 2); // Corrected rotation based on script.js

    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8, metalness: 0.1 });
    for (let i = 0; i < 4; i++) {
        const wheelMesh = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheelMesh.castShadow = true;
        scene.add(wheelMesh);
        wheels.push(wheelMesh);
    }
    return { chassis: chassisMesh, wheels: wheels, id: vehicleId };
}

camera.position.set(0, 10, 15); // Initial camera position, will be updated by follow logic
// camera.lookAt(0, 0, 0); // Will be updated by follow logic

// --- Keyboard Input States ---
const keyStates = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
};

// --- WebSocket Connection ---
// const socket = new WebSocket('ws://localhost:3000'); // Original hardcoded version
const socket = new WebSocket(`ws://${window.location.hostname}:3000`); // Use dynamic hostname

socket.onopen = () => {
    console.log('Connected to WebSocket server (vehicle simulation)');
    setInterval(sendInputToServer, 50); // Send input state 20 times per second
};

socket.onmessage = (event) => {
    try {
        const message = JSON.parse(event.data);

        if (message.type === 'yourVehicleId') {
            myVehicleId = message.id;
            console.log("My vehicle ID is:", myVehicleId);
            // If my vehicle already exists (e.g. due to quick reconnect), update its color
            if (vehicleMeshes[myVehicleId] && message.color !== undefined) {
                vehicleMeshes[myVehicleId].chassis.material.color.setHex(message.color);
            }
        }

        if (message.type === 'vehicleRemoved') {
            if (vehicleMeshes[message.id]) {
                scene.remove(vehicleMeshes[message.id].chassis);
                vehicleMeshes[message.id].wheels.forEach(wheel => scene.remove(wheel));
                delete vehicleMeshes[message.id];
                console.log("Removed vehicle mesh:", message.id);
            }
        }

        if (message.vehicles) { // Expecting an array of vehicle states
            message.vehicles.forEach(vehicleState => {
                if (!vehicleMeshes[vehicleState.id]) {
                    // Pass the color when creating the graphic
                    vehicleMeshes[vehicleState.id] = createVehicleGraphic(vehicleState.id, vehicleState.color);
                    console.log("Created new vehicle mesh:", vehicleState.id, "with color", vehicleState.color);
                } else if (vehicleState.color !== undefined && 
                           vehicleMeshes[vehicleState.id].chassis.material.color.getHex() !== vehicleState.color) {
                    // Update color if it has changed (e.g., if initial creation missed it)
                    vehicleMeshes[vehicleState.id].chassis.material.color.setHex(vehicleState.color);
                    console.log("Updated color for vehicle mesh:", vehicleState.id, "to", vehicleState.color);
                }

                const currentVehicle = vehicleMeshes[vehicleState.id];
                // Update chassis
                currentVehicle.chassis.position.copy(vehicleState.chassis.position);
                currentVehicle.chassis.quaternion.copy(vehicleState.chassis.quaternion);

                // Update wheels
                if (vehicleState.wheels && vehicleState.wheels.length === currentVehicle.wheels.length) {
                    for (let i = 0; i < vehicleState.wheels.length; i++) {
                        currentVehicle.wheels[i].position.copy(vehicleState.wheels[i].position);
                        currentVehicle.wheels[i].quaternion.copy(vehicleState.wheels[i].quaternion);
                    }
                }

                // If this is the client's vehicle, update the info panel
                if (vehicleState.id === myVehicleId) {
                    if (positionDataElement) {
                        const pos = vehicleState.chassis.position;
                        positionDataElement.textContent = `X: ${pos.x.toFixed(2)}, Y: ${pos.y.toFixed(2)}, Z: ${pos.z.toFixed(2)}`;
                    }
                    if (speedDataElement && vehicleState.speed !== undefined) {
                        speedDataElement.textContent = `${vehicleState.speed.toFixed(2)} units/s`;
                    }
                    if (onCourseDataElement && vehicleState.onCourse !== undefined) { // Added for onCourse status
                        onCourseDataElement.textContent = vehicleState.onCourse ? 'Yes' : 'No';
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error processing message from server:', error);
    }
};

socket.onclose = () => {
    console.log('Disconnected from WebSocket server (vehicle simulation)');
};

socket.onerror = (error) => {
    console.error('WebSocket error (vehicle simulation):', error);
};

// --- Send Input to Server ---
function sendInputToServer() {
    if (socket.readyState === WebSocket.OPEN) {
        const inputVector = { dx: 0, dz: 0 }; // dx for steering, dz for throttle/brake
        if (keyStates.ArrowUp) inputVector.dz -= 1;    // Forward
        if (keyStates.ArrowDown) inputVector.dz += 1;   // Backward/Brake
        if (keyStates.ArrowLeft) inputVector.dx -= 1;   // Steer Left
        if (keyStates.ArrowRight) inputVector.dx += 1;  // Steer Right

        // Only send if there's active input (or to explicitly send zero input if needed by server logic)
        // For simplicity, sending even if zero to ensure server gets updates.
        socket.send(JSON.stringify({ type: 'input', data: inputVector }));
    }
}

// --- Keyboard Event Listeners ---
document.addEventListener('keydown', (event) => {
    if (event.key in keyStates) {
        keyStates[event.key] = true;
    }
});

document.addEventListener('keyup', (event) => {
    if (event.key in keyStates) {
        keyStates[event.key] = false;
    }
});

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    updateCamera(); // Update main camera position each frame
    updateMinimapCamera(); // Update minimap camera position each frame
    
    // Main rendering
    renderer.render(scene, camera);

    // Minimap rendering
    // Get the minimap container's current dimensions
    const minimapRect = minimapContainer.getBoundingClientRect();
    // Set the viewport to the minimap container's position and size
    // minimapRenderer.setViewport(0, 0, minimapRect.width, minimapRect.height); // Handled by renderer.setSize
    // minimapRenderer.setScissor(0, 0, minimapRect.width, minimapRect.height); // Handled by renderer.setSize
    // minimapRenderer.setScissorTest(true);
    minimapRenderer.render(scene, minimapCamera);
}

animate();

// --- Camera Follow Logic ---
const cameraOffset = new THREE.Vector3(0, 4, -7); // Offset from the vehicle (Z成分の符号を反転して後方に)

function updateCamera() {
    if (myVehicleId && vehicleMeshes[myVehicleId]) {
        const myVehicleChassis = vehicleMeshes[myVehicleId].chassis;

        // Calculate camera position based on vehicle orientation and offset
        const offset = cameraOffset.clone();
        offset.applyQuaternion(myVehicleChassis.quaternion); // Rotate offset by vehicle's rotation
        offset.add(myVehicleChassis.position); // Add vehicle's position
        camera.position.copy(offset);

        // Make camera look at a point slightly in front of the vehicle's chassis
        const lookAtPoint = myVehicleChassis.position.clone();
        // Optional: Add a small forward offset to the lookAt point if desired
        // const forward = new THREE.Vector3(0, 0, -2); // Local forward
        // forward.applyQuaternion(myVehicleChassis.quaternion);
        // lookAtPoint.add(forward);
        camera.lookAt(lookAtPoint);
    }
}

// --- Minimap Camera Follow Logic ---
function updateMinimapCamera() {
    if (myVehicleId && vehicleMeshes[myVehicleId]) {
        const myVehicleChassis = vehicleMeshes[myVehicleId].chassis;
        minimapCamera.position.x = myVehicleChassis.position.x;
        minimapCamera.position.z = myVehicleChassis.position.z;
        minimapCamera.position.y = minimapCamHeight; 

        // Calculate vehicle's forward direction in world space (on XZ plane)
        const carForward = new THREE.Vector3(0, 0, -1); // Local forward vector
        carForward.applyQuaternion(myVehicleChassis.quaternion);
        carForward.y = 0; // Project onto XZ plane
        if (carForward.lengthSq() < 0.0001) { // Handle cases where XZ projection is near zero
            // If car is pointing straight up/down, default to a sensible forward for minimap up
            carForward.set(0, 0, -1); // Default to world -Z as 'forward' for up calculation
        }
        carForward.normalize();

        // Set camera's up vector to the negation of car's forward to make car's forward point up on screen
        minimapCamera.up.copy(carForward.clone().negate()); 
        minimapCamera.lookAt(myVehicleChassis.position.x, myVehicleChassis.position.y, myVehicleChassis.position.z); // Look at the car

    } else {
        // Default minimap orientation if no vehicle to follow
        minimapCamera.position.set(0, minimapCamHeight, 0);
        minimapCamera.up.set(0, 0, -1); // Default up: world -Z points "up" on screen
        minimapCamera.lookAt(0, 0, 0);
    }
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Update minimap view (only renderer size)
    updateMinimapView();
});

// function createCheckerboardTexture(width, height, segmentsX, segmentsY, color1, color2) {
// const canvas = document.createElement('canvas');
// canvas.width = width;
// canvas.height = height;
// const context = canvas.getContext('2d');
//
// const segmentWidth = width / segmentsX;
// const segmentHeight = height / segmentsY;
//
// for (let y = 0; y < segmentsY; y++) {
// for (let x = 0; x < segmentsX; x++) {
// context.fillStyle = (x + y) % 2 === 0 ? color1 : color2;
// context.fillRect(x * segmentWidth, y * segmentHeight, segmentWidth, segmentHeight);
// }
// }
// return new THREE.CanvasTexture(canvas);
// }

// --- Three.js setup ---

