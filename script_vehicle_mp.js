import * as THREE from 'https://cdn.skypack.dev/three@0.132.2';

// --- Scene Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // Enable shadows
document.body.appendChild(renderer.domElement);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 30, 10); // Changed Y from 15 to 30
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
// Adjust shadow camera properties to cover a larger area
directionalLight.shadow.camera.left = -100; // Default was -5
directionalLight.shadow.camera.right = 100;  // Default was 5
directionalLight.shadow.camera.top = 100;    // Default was 5
directionalLight.shadow.camera.bottom = -100; // Default was -5
directionalLight.shadow.camera.near = 0.5;   // Default was 0.5
directionalLight.shadow.camera.far = 200;    // Default was 500, but light position is closer

scene.add(directionalLight);

// Optional: Shadow camera helper (for debugging shadow frustum)
const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
scene.add(shadowHelper);

// --- Ground Graphics ---
// Function to create a checkerboard texture
function createCheckerboardTexture(size = 1024, checks = 64) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    const checkSize = size / checks;

    for (let i = 0; i < checks; i++) {
        for (let j = 0; j < checks; j++) {
            context.fillStyle = (i + j) % 2 === 0 ? '#FFFFFF' : '#AAAAAA'; // White and light gray
            context.fillRect(i * checkSize, j * checkSize, checkSize, checkSize);
        }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(checks / 2, checks / 2); // Adjust repeat based on ground size and desired check density
    return texture;
}

const groundGeometry = new THREE.BoxGeometry(100, 0.2, 100); // Larger ground
const checkerboardTexture = createCheckerboardTexture(512, 32); // Create texture
const groundMaterial = new THREE.MeshStandardMaterial({
    // color: 0x808080, // Color is now primarily from texture
    map: checkerboardTexture, // Apply texture
    roughness: 0.8,
    metalness: 0.2
});
const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
groundMesh.position.y = -0.1; // Align with server-side ground
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// --- Vehicle Graphics (Manages multiple vehicles) ---
const vehicleMeshes = {}; // Stores vehicle meshes (chassis + wheels) by ID
let myVehicleId = null; // To identify the client's own vehicle

// DOM elements for displaying info
const positionDataElement = document.getElementById('positionData');
const speedDataElement = document.getElementById('speedData');

// Vehicle dimensions (should match server-side for consistency in appearance)
const chassisSize = { x: 1, y: 0.5, z: 2 };
const wheelRadius = 0.3;
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
const socket = new WebSocket('ws://localhost:3000');

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
                    if (speedDataElement && vehicleState.speed !== undefined) { // Check if speed data is sent
                        speedDataElement.textContent = `${vehicleState.speed.toFixed(2)} units/s`;
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
    updateCamera(); // Update camera position each frame
    renderer.render(scene, camera);
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

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

