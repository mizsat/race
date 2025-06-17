console.log("Starting server.js for vehicle simulation...");

import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import CANNON from 'cannon-es';
import * as THREE from 'three'; // Added for Trimesh generation

console.log("Imports completed.");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("__dirname setup completed.");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

console.log("Express, HTTP, and WebSocket server initialized.");

app.use(express.static(path.join(__dirname, '/')));

console.log("Static file serving setup completed.");

// --- Cannon.js World Setup ---
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0); // Y軸方向に重力
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations = 10;

const vehicleColors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0x00ffff, 0xff00ff, 0xf0f0f0, 0x303030]; // Red, Green, Blue, Yellow, Cyan, Magenta, White, DarkGray

console.log("Cannon.js world setup completed.");

// --- Materials ---
const groundMaterial = new CANNON.Material("groundMaterial"); 
// const offRoadMaterial = new CANNON.Material("offRoadMaterial"); // REMOVED
const vehicleMaterial = new CANNON.Material("vehicleMaterial"); // For vehicle chassis

const vehicleGroundContactMaterial = new CANNON.ContactMaterial(
    groundMaterial, // Course material AND safety ground
    vehicleMaterial,
    {
        friction: 0.3, // Normal friction
        restitution: 0.1,
        contactEquationStiffness: 1e8,
        contactEquationRelaxation: 3,
    }
);
world.addContactMaterial(vehicleGroundContactMaterial);

// const vehicleOffRoadContactMaterial = new CANNON.ContactMaterial( // REMOVED BLOCK
//     offRoadMaterial, 
//     vehicleMaterial,
//     {
//         friction: 200.0, 
//         restitution: 0.1, 
//         contactEquationStiffness: 1e8,
//         contactEquationRelaxation: 3,
//     }
// );
// world.addContactMaterial(vehicleOffRoadContactMaterial); // REMOVED

// --- Ground Physics (Oval Course) ---
// const groundSize = { x: 100, y: 0.1, z: 100 }; // Old flat ground
// const groundShape = new CANNON.Box(new CANNON.Vec3(groundSize.x * 0.5, groundSize.y * 0.5, groundSize.z * 0.5));
// const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial });
// groundBody.addShape(groundShape);
// groundBody.position.set(0, -groundSize.y * 0.5, 0);
// world.addBody(groundBody);
// console.log("Old ground physics setup removed.");

const groundHeight = 0.05; // Changed from 0.1 to 0.05
const straightLength = 70; // Reduced length for initial testing
const straightWidth = 10;
const straightSpacing = 40; // Reduced spacing

function createStraightSectionPhysics(width, height, length, position) {
    const shape = new CANNON.Box(new CANNON.Vec3(width * 0.5, height * 0.5, length * 0.5));
    const body = new CANNON.Body({ mass: 0, material: groundMaterial });
    body.addShape(shape);
    body.position.copy(position);
    world.addBody(body);
    console.log(`Straight section created at ${position.x}, ${position.y}, ${position.z}`);
}

function createCornerSectionPhysics(arcCenterPos, innerRadius, outerRadius, height, shapeStartAngle, shapeEndAngle, shapeOuterArcClockwise, name) {
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
    // No need to translate geometry here, body position will handle it

    const vertices = geometry.attributes.position.array;
    let indices;
    if (geometry.index) {
        indices = geometry.index.array;
    } else {
        indices = [];
        for (let i = 0; i < vertices.length / 3; i += 3) {
            indices.push(i, i + 1, i + 2);
        }
    }

    // Convert Float32Array to regular array for Cannon.js
    const cannonVertices = [];
    for (let i = 0; i < vertices.length; i++) {
        cannonVertices.push(vertices[i]);
    }
    const cannonIndices = [];
    for (let i = 0; i < indices.length; i++) {
        cannonIndices.push(indices[i]);
    }
    
    const cannonShape = new CANNON.Trimesh(cannonVertices, cannonIndices);
    const body = new CANNON.Body({ mass: 0, material: groundMaterial });
    body.addShape(cannonShape);
    body.position.copy(arcCenterPos); // Set position of the Trimesh body
    // body.position.y -= height / 2; // REMOVED: arcCenterPos.y should already be -height/2, so top is at Y=0
    world.addBody(body);
    console.log(`Corner section '${name}' created at ${arcCenterPos.x}, ${arcCenterPos.y}, ${arcCenterPos.z}`);
}

// Create the oval course physics
// Straight 1
createStraightSectionPhysics(straightWidth, groundHeight, straightLength, new CANNON.Vec3(-straightSpacing / 2, -groundHeight / 2, 0));
// Straight 2
createStraightSectionPhysics(straightWidth, groundHeight, straightLength, new CANNON.Vec3(straightSpacing / 2, -groundHeight / 2, 0));


// Corner parameters
const R_inner = straightSpacing / 2 - straightWidth / 2;
const R_outer = straightSpacing / 2 + straightWidth / 2;
const arcCenterY = -groundHeight / 2;

// Corner 1 (Positive Z)
const arcPos1 = new CANNON.Vec3(0, arcCenterY, straightLength / 2);
try {
    createCornerSectionPhysics(arcPos1, R_inner, R_outer, groundHeight, Math.PI, 0, true, "corner1_physics");
} catch (e) {
    console.error("Error creating corner1 physics:", e);
}

// Corner 2 (Negative Z)
const arcPos2 = new CANNON.Vec3(0, arcCenterY, -straightLength / 2);
try {
    createCornerSectionPhysics(arcPos2, R_inner, R_outer, groundHeight, 0, Math.PI, true, "corner2_physics");
} catch (e) {
    console.error("Error creating corner2 physics:", e);
}

console.log("Oval course physics setup initiated.");

// --- Fallback Ground Physics (Safety Net) ---
// Match client-side dimensions and positioning logic as closely as possible
const safetyGroundMargin_server = 40; // Margin, same as client (was 20)

// Calculate actual course dimensions for server-side safety ground
const courseActualWidth_server = straightSpacing + straightWidth;
const courseActualLength_server = straightLength + (2 * R_outer); // R_outer already defined for corners

const safetyGroundSizeX_server = courseActualWidth_server + safetyGroundMargin_server * 4; // Apply margin to both sides, changed from * 2 to * 4
const safetyGroundSizeZ_server = courseActualLength_server + safetyGroundMargin_server * 4;   // Apply margin to both sides, changed from * 2 to * 4

const safetyGroundHeight_server = 1; // Thickness of the safety ground (physics body)
// Position its top surface at the bottom of the course physics
// groundHeight is now 0.1. Course elements are positioned so their top is at Y=0, so bottom is at -groundHeight.
const safetyGroundYPosition_server = -groundHeight - (safetyGroundHeight_server / 2); 

const safetyGroundShape_server = new CANNON.Box(new CANNON.Vec3(safetyGroundSizeX_server * 0.5, safetyGroundHeight_server * 0.5, safetyGroundSizeZ_server * 0.5));
const safetyGroundBody_server = new CANNON.Body({
    mass: 0, // Static body
    material: groundMaterial, // CHANGED BACK to groundMaterial
    position: new CANNON.Vec3(0, safetyGroundYPosition_server, 0)
});
safetyGroundBody_server.addShape(safetyGroundShape_server);
world.addBody(safetyGroundBody_server);
console.log(`Safety ground physics body added at Y: ${safetyGroundYPosition_server} with size X: ${safetyGroundSizeX_server}, Z: ${safetyGroundSizeZ_server}`);


// --- Vehicle Physics (Manages multiple vehicles) ---
const vehicles = new Map(); // Stores vehicle data (vehicle, chassisBody, id) keyed by WebSocket client
let nextVehicleId = 0;

function createVehiclePhysics(ws) {
    const chassisSize = { x: 1, y: 0.5, z: 2 };
    const chassisShape = new CANNON.Box(new CANNON.Vec3(chassisSize.x * 0.5, chassisSize.y * 0.5, chassisSize.z * 0.5));
    // Adjust initial position to be on one of the straights
    const initialPosition = new CANNON.Vec3(-straightSpacing / 2, 2, Math.random() * straightLength * 0.4 - straightLength * 0.2); 
    const chassisBody = new CANNON.Body({ 
        mass: 150,
        material: vehicleMaterial,
        position: initialPosition.clone(), // Use clone for initial setup
    });
    chassisBody.addShape(chassisShape);
    chassisBody.linearDamping = 0.1; // Reduced from 0.15
    world.addBody(chassisBody);

    const vehicle = new CANNON.RaycastVehicle({
        chassisBody: chassisBody,
        indexForwardAxis: 2, // z-axis
        indexRightAxis: 0,   // x-axis
        indexUpAxis: 1       // y-axis
    });

    const wheelOptions = {
        radius: 0.3,
        directionLocal: new CANNON.Vec3(0, -1, 0),
        suspensionStiffness: 30,
        suspensionRestLength: 0.3,
        frictionSlip: 1.4, // Adjusted for better grip
        dampingRelaxation: 2.3,
        dampingCompression: 4.4,
        maxSuspensionForce: 100000,
        rollInfluence: 0.01,
        axleLocal: new CANNON.Vec3(1, 0, 0), // For x-axis (right)
        chassisConnectionPointLocal: new CANNON.Vec3(), // Will be set per wheel
        maxSuspensionTravel: 0.3,
        customSlidingRotationalSpeed: -30,
        useCustomSlidingRotationalSpeed: true
    };

    // Wheel positions (relative to chassis center)
    const wheelOffsetX = chassisSize.x * 0.55; // Adjusted from 0.45 to 0.55 to move wheels outward
    const wheelOffsetY = -chassisSize.y * 0.3;
    const wheelOffsetZFront = chassisSize.z * 0.4;
    const wheelOffsetZRear = -chassisSize.z * 0.4;

    const wheelPositions = [
        new CANNON.Vec3(wheelOffsetX, wheelOffsetY, wheelOffsetZFront),   // Front-Right
        new CANNON.Vec3(-wheelOffsetX, wheelOffsetY, wheelOffsetZFront),  // Front-Left
        new CANNON.Vec3(wheelOffsetX, wheelOffsetY, wheelOffsetZRear),    // Back-Right
        new CANNON.Vec3(-wheelOffsetX, wheelOffsetY, wheelOffsetZRear)    // Back-Left
    ];

    wheelPositions.forEach(pos => {
        const wheelOpt = {...wheelOptions};
        wheelOpt.chassisConnectionPointLocal.copy(pos);
        vehicle.addWheel(wheelOpt);
    });

    vehicle.addToWorld(world);

    const vehicleId = `vehicle-${nextVehicleId}`;
    const vehicleColor = vehicleColors[nextVehicleId % vehicleColors.length];
    nextVehicleId++; // Increment after assigning ID and color

    vehicles.set(ws, {
        vehicle: vehicle,
        chassisBody: chassisBody,
        id: vehicleId,
        initialPosition: initialPosition, // Save initial position
        color: vehicleColor // Store the assigned color
    });
    console.log(`Vehicle ${vehicleId} created with color 0x${vehicleColor.toString(16)} for client at`, initialPosition);
    return { vehicleId, vehicleColor }; // Return ID and color
}

function removeVehiclePhysics(ws) {
    if (vehicles.has(ws)) {
        const vehicleData = vehicles.get(ws);
        vehicleData.vehicle.removeFromWorld(world);
        world.removeBody(vehicleData.chassisBody);
        vehicles.delete(ws);
        console.log(`Vehicle ${vehicleData.id} removed.`);
        return vehicleData.id;
    }
    return null;
}

const clientInputs = new Map();

wss.on('connection', (ws) => {
    console.log('Client connected');
    const { vehicleId, vehicleColor } = createVehiclePhysics(ws); // Get ID and color
    clientInputs.set(ws, { dx: 0, dz: 0, vehicleId: vehicleId });

    // Send the new vehicle's ID and color to the connected client so it knows which vehicle is its own
    ws.send(JSON.stringify({ type: 'yourVehicleId', id: vehicleId, color: vehicleColor }));

    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            if (parsedMessage.type === 'input' && parsedMessage.data) {
                const currentInput = clientInputs.get(ws);
                if (currentInput) {
                    currentInput.dx = parsedMessage.data.dx || 0; // Steering input
                    currentInput.dz = parsedMessage.data.dz || 0; // Forward/backward/brake input
                }
            }
        } catch (error) {
            console.error('Failed to parse message or update input:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        const removedVehicleId = removeVehiclePhysics(ws);
        clientInputs.delete(ws);
        if (removedVehicleId) {
            wss.clients.forEach(client => {
                if (client.readyState === client.OPEN) {
                    client.send(JSON.stringify({ type: 'vehicleRemoved', id: removedVehicleId }));
                }
            });
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        const removedVehicleIdOnError = removeVehiclePhysics(ws);
        clientInputs.delete(ws);
        if (removedVehicleIdOnError) {
             wss.clients.forEach(client => {
                if (client.readyState === client.OPEN) {
                    client.send(JSON.stringify({ type: 'vehicleRemoved', id: removedVehicleIdOnError }));
                }
            });
        }
    });
});

// --- Physics Loop (Server-side) ---
const timeStep = 1 / 60;
const maxSteerVal = 0.5;
const maxForce = 240; // Changed from 200 to 240
// const brakeForce = 20; // Explicit brake force for ArrowDown, now used for reverse
// const gentleBrakeForce = 2; // New: Force for gentle braking when no input. Value changed from 5 to 2.
const fallResetThresholdY = -10; // Y-coordinate threshold for reset

// const BRAKE_FORCE_OFF_COURSE = 80; // REMOVED - Replaced by damping adjustment

const NORMAL_LINEAR_DAMPING = 0.1; // Default linear damping for chassisBody
const OFF_COURSE_LINEAR_DAMPING = 0.8; // Increased linear damping for off-course

// Helper function to check if the vehicle is on the course
function isVehicleOnCourse(vehiclePosition) {
    const x = vehiclePosition.x;
    const z = vehiclePosition.z;

    // Course parameters (ensure these are consistent with course creation)
    // const straightLength = 70;
    // const straightWidth = 10;
    // const straightSpacing = 40;
    // const R_inner = straightSpacing / 2 - straightWidth / 2; // Already defined globally
    // const R_outer = straightSpacing / 2 + straightWidth / 2; // Already defined globally

    // Check straight sections
    // Straight 1 (negative X side)
    const straight1MinX = -straightSpacing / 2 - straightWidth / 2;
    const straight1MaxX = -straightSpacing / 2 + straightWidth / 2;
    if (x >= straight1MinX && x <= straight1MaxX && z >= -straightLength / 2 && z <= straightLength / 2) {
        return true;
    }
    // Straight 2 (positive X side)
    const straight2MinX = straightSpacing / 2 - straightWidth / 2;
    const straight2MaxX = straightSpacing / 2 + straightWidth / 2;
    if (x >= straight2MinX && x <= straight2MaxX && z >= -straightLength / 2 && z <= straightLength / 2) {
        return true;
    }

    // Check corner sections
    // Corner 1 (Positive Z end)
    const corner1CenterX = 0;
    const corner1CenterZ = straightLength / 2;
    const distToCorner1CenterSq = Math.pow(x - corner1CenterX, 2) + Math.pow(z - corner1CenterZ, 2);
    if (distToCorner1CenterSq >= R_inner * R_inner && distToCorner1CenterSq <= R_outer * R_outer) {
        // Check if within the semicircle part (z > center Z for top corner)
        if (z >= corner1CenterZ) { 
            const angle = Math.atan2(z - corner1CenterZ, x - corner1CenterX);
            if (angle >= 0 && angle <= Math.PI) { // 0 to PI for the top semicircle
                return true;
            }
        }
    }

    // Corner 2 (Negative Z end)
    const corner2CenterX = 0;
    const corner2CenterZ = -straightLength / 2;
    const distToCorner2CenterSq = Math.pow(x - corner2CenterX, 2) + Math.pow(z - corner2CenterZ, 2);
    if (distToCorner2CenterSq >= R_inner * R_inner && distToCorner2CenterSq <= R_outer * R_outer) {
        // Check if within the semicircle part (z < center Z for bottom corner)
         if (z <= corner2CenterZ) { 
            const angle = Math.atan2(z - corner2CenterZ, x - corner2CenterX);
            if (angle <= 0 && angle >= -Math.PI) { // -PI to 0 for the bottom semicircle
                return true;
            }
        }
    }
    return false;
}

setInterval(() => {
    clientInputs.forEach((input, ws) => {
        if (vehicles.has(ws)) {
            const vehicleData = vehicles.get(ws);
            const vehicle = vehicleData.vehicle;
            const chassisBody = vehicleData.chassisBody;

            let engineForce = 0;

            if (input.dz < 0) { // ArrowUp for forward
                engineForce = input.dz * maxForce; 
            } else if (input.dz > 0) { // ArrowDown for backward
                engineForce = input.dz * maxForce; 
            }

            vehicle.applyEngineForce(engineForce, 2);
            vehicle.applyEngineForce(engineForce, 3);

            const onCourse = isVehicleOnCourse(chassisBody.position);

            if (onCourse) {
                chassisBody.linearDamping = NORMAL_LINEAR_DAMPING;
                for (let i = 0; i < vehicle.wheelInfos.length; i++) {
                    vehicle.setBrake(0, i); 
                }
            } else {
                chassisBody.linearDamping = OFF_COURSE_LINEAR_DAMPING;
                // No explicit brake applied here anymore, relying on increased damping
                for (let i = 0; i < vehicle.wheelInfos.length; i++) {
                    vehicle.setBrake(0, i); // Ensure brakes are off if not explicitly applied for off-course
                }
            }
            
            vehicle.setSteeringValue(-input.dx * maxSteerVal, 0); 
            vehicle.setSteeringValue(-input.dx * maxSteerVal, 1); 
        }
    });

    world.step(timeStep);

    // Check for fall and reset vehicles
    vehicles.forEach(vehicleData => {
        if (vehicleData.chassisBody.position.y < fallResetThresholdY) {
            console.log(`Vehicle ${vehicleData.id} fell, resetting to initial position.`);
            vehicleData.chassisBody.position.copy(vehicleData.initialPosition);
            vehicleData.chassisBody.velocity.set(0, 0, 0);
            vehicleData.chassisBody.angularVelocity.set(0, 0, 0);
            vehicleData.chassisBody.quaternion.setFromEuler(0, 0, 0); // Reset orientation
        }
    });

    const allVehiclesState = [];
    vehicles.forEach(vehicleData => {
        const onCourse = isVehicleOnCourse(vehicleData.chassisBody.position);
        allVehiclesState.push({
            id: vehicleData.id,
            chassis: {
                position: vehicleData.chassisBody.position,
                quaternion: vehicleData.chassisBody.quaternion
            },
            wheels: vehicleData.vehicle.wheelInfos.map(wheel => ({
                // For RaycastVehicle, wheel world transform is directly available
                position: wheel.worldTransform.position,
                quaternion: wheel.worldTransform.quaternion
            })),
            speed: vehicleData.chassisBody.velocity.length(),
            color: vehicleData.color,
            onCourse: onCourse // Add onCourse status
        });
    });

    const physicsState = {
        vehicles: allVehiclesState // Changed from 'balls' to 'vehicles'
    };

    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) { // ws.OPEN (モジュールから直接参照) の代わりに client.OPEN を使用
            client.send(JSON.stringify(physicsState));
        }
    });

}, timeStep * 1000);

// --- Start Server ---
const PORT = process.env.PORT || 3000;
console.log(`Attempting to start server on port ${PORT}...`);

server.on('error', (err) => {
    console.error('Server error:', err);
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});
