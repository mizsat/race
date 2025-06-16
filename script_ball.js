import * as THREE from 'https://cdn.skypack.dev/three@0.132.2';

// --- Scene Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

// --- Ground Graphics ---
const groundGeometry = new THREE.BoxGeometry(20, 0.1, 20); // Match server-side ground size
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
groundMesh.position.y = -0.05; // Align with server-side ground position
scene.add(groundMesh);

// --- Ball Graphics ---
const ballRadius = 0.5; // Match server-side ball radius
const ballGeometry = new THREE.SphereGeometry(ballRadius, 32, 32);
const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
// const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial); // Single ball mesh removed
// scene.add(ballMesh); // Single ball mesh removed

const ballMeshes = {}; // Store ball meshes by ID
// let myBallId = null; // To identify the client's own ball (optional for now)

camera.position.set(0, 15, 20); // Adjust camera for potentially more balls
camera.lookAt(0, 0, 0);

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
    console.log('Connected to WebSocket server (ball simulation)');
    setInterval(sendInputToServer, 50);
};

socket.onmessage = (event) => {
    try {
        const message = JSON.parse(event.data);

        /* Optional: Identify client's own ball
        if (message.type === 'yourBallId') {
            myBallId = message.id;
            console.log("My ball ID is:", myBallId);
        }
        */

        if (message.type === 'ballRemoved') {
            if (ballMeshes[message.id]) {
                scene.remove(ballMeshes[message.id]);
                delete ballMeshes[message.id];
                console.log("Removed ball mesh:", message.id);
            }
        }

        if (message.balls) { // Expecting an array of ball states
            message.balls.forEach(ballState => {
                if (!ballMeshes[ballState.id]) {
                    // Create a new mesh for a new ball
                    const newBallGeometry = new THREE.SphereGeometry(ballRadius, 32, 32);
                    // Give different colors to different balls, or based on myBallId
                    const newBallMaterial = new THREE.MeshStandardMaterial({ 
                        color: Math.random() * 0xffffff // Random color for now
                    }); 
                    ballMeshes[ballState.id] = new THREE.Mesh(newBallGeometry, newBallMaterial);
                    scene.add(ballMeshes[ballState.id]);
                    console.log("Created new ball mesh:", ballState.id);
                }
                // Update position and quaternion
                ballMeshes[ballState.id].position.copy(ballState.position);
                ballMeshes[ballState.id].quaternion.copy(ballState.quaternion);
            });
        }
    } catch (error) {
        console.error('Error processing message from server:', error);
    }
};

socket.onclose = () => {
    console.log('Disconnected from WebSocket server (ball simulation)');
};

socket.onerror = (error) => {
    console.error('WebSocket error (ball simulation):', error);
};

// --- Send Input to Server ---
function sendInputToServer() {
    if (socket.readyState === WebSocket.OPEN) {
        const inputVector = { dx: 0, dz: 0 };
        if (keyStates.ArrowUp) inputVector.dz -= 1;
        if (keyStates.ArrowDown) inputVector.dz += 1;
        if (keyStates.ArrowLeft) inputVector.dx -= 1;
        if (keyStates.ArrowRight) inputVector.dx += 1;
        
        // Only send if there's active input
        if (inputVector.dx !== 0 || inputVector.dz !== 0) {
            socket.send(JSON.stringify({ type: 'input', data: inputVector }));
        }
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
    renderer.render(scene, camera);
}

animate();

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
