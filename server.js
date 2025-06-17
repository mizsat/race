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
// const ballMaterial = new CANNON.Material("ballMaterial"); // No longer just a ball
const vehicleMaterial = new CANNON.Material("vehicleMaterial"); // For vehicle chassis

const vehicleGroundContactMaterial = new CANNON.ContactMaterial(
    groundMaterial,
    vehicleMaterial,
    {
        friction: 0.3, // Friction between vehicle and ground
        restitution: 0.1,
        contactEquationStiffness: 1e8,
        contactEquationRelaxation: 3,
    }
);
world.addContactMaterial(vehicleGroundContactMaterial);

// --- Ground Physics (Oval Course) ---
// const groundSize = { x: 100, y: 0.1, z: 100 }; // Old flat ground
// const groundShape = new CANNON.Box(new CANNON.Vec3(groundSize.x * 0.5, groundSize.y * 0.5, groundSize.z * 0.5));
// const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial });
// groundBody.addShape(groundShape);
// groundBody.position.set(0, -groundSize.y * 0.5, 0);
// world.addBody(groundBody);
// console.log("Old ground physics setup removed.");

const groundHeight = 0.1;
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
    body.position.y -= height / 2; // Adjust Y position to align top surface
    // body.quaternion.copy(mesh.quaternion); // Not needed as geometry is already rotated
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

setInterval(() => {
    clientInputs.forEach((input, ws) => {
        if (vehicles.has(ws)) {
            const vehicleData = vehicles.get(ws);
            const vehicle = vehicleData.vehicle;

            let engineForce = 0;

            if (input.dz < 0) { // ArrowUp for forward
                engineForce = input.dz * maxForce; // 前進 (dzは負なので、engineForceも負)
            } else if (input.dz > 0) { // ArrowDown for backward
                engineForce = input.dz * maxForce; // 後進 (dzは正なので、engineForceも正)
            }

            // Apply engine force to rear wheels (indices 2 and 3)
            vehicle.applyEngineForce(engineForce, 2);
            vehicle.applyEngineForce(engineForce, 3);

            // Brakes are always off unless a specific brake input is implemented
            for (let i = 0; i < vehicle.wheelInfos.length; i++) {
                vehicle.setBrake(0, i); // Always release brake
            }
            
            // Set steering value for front wheels (indices 0 and 1)
            vehicle.setSteeringValue(-input.dx * maxSteerVal, 0); // 変更: input.dx の符号を反転
            vehicle.setSteeringValue(-input.dx * maxSteerVal, 1); // 変更: input.dx の符号を反転
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
            speed: vehicleData.chassisBody.velocity.length(), // Add speed calculation
            color: vehicleData.color // Add color information
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
