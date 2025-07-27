// AR Engine - Three.js and spatial tracking

window.AREngine = (function() {

    // Model loading variables
    let modelLoader = null;
    let loadingProgress = 0;
    let isModelLoading = false;
    const modelLibrary = {
        '3d_model': [
            'models/Duck.glb',  
            'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb'
        ],
        'bottle': [
            'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/WaterBottle/glTF-Binary/WaterBottle.glb'
        ],

        'brain_stem': ['models/BrainStem.glb'],
        'helmet': ['models/DamagedHelmet.glb'], 
        'mosquito': ['models/MosquitoInAmber.glb'],

        'photo_model': ['user-models/photo_model.glb'],
        'custom': (modelId) => [`https://your-cloud-storage.com/models/${modelId}.glb`]
    };
    // Private variables
    let scene, renderer, arObject, threeCamera;
    let deviceOrientation = { alpha: 0, beta: 0, gamma: 0 };
    let deviceMotion = { x: 0, y: 0, z: 0 };
    let objectPlaced = false;
    let objectPosition = { x: 0, y: -1, z: -3 };
    let initialOrientation = null;
    let isTracking = false;
    let animationId;

    // Interactive controls
    let objectScale = 1.0;
    let objectRotation = { x: 0, y: 0, z: 0 };
    let manualRotationMode = true;
    let isDragging = false;
    let lastTouch = { 
        x: 0, y: 0, 
        scale: 0, 
        angle: undefined, 
        centerX: undefined, 
        centerY: undefined 
    };
    let isScaling = false;

// Current object data
    let currentObjectData = {};

// tracking variables  
    let worldAnchor = null;
    let trackingQuality = 0;
    let motionHistory = [];
    let stabilityCounter = 0;
    let positionPredictor = { x: 0, y: 0, z: 0 };
    let lastUpdateTime = 0;

    function setupThreeJS() {
        const canvas = document.getElementById('ar-canvas');
        
        scene = new THREE.Scene();
        
        threeCamera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
            );
        threeCamera.position.set(0, 0, 0);
        
        renderer = new THREE.WebGLRenderer({ 
            canvas: canvas, 
            alpha: true, 
            antialias: true 
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setClearColor(0x000000, 0);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        scene.add(directionalLight);
        
        console.log('Three.js setup complete');
    }


    function initializeModelLoader() {
        try {
            console.log('Initializing GLTFLoader...');

            if (typeof THREE.GLTFLoader === 'undefined') {
                console.warn('GLTFLoader not available, using fallback');
                modelLoader = null;
                return Promise.resolve();
            }

            modelLoader = new THREE.GLTFLoader();
            console.log('GLTFLoader ready');
            return Promise.resolve();

        } catch (error) {
            console.warn('GLTFLoader failed:', error);
            modelLoader = null;
            return Promise.resolve();
        }
    }

    async function setupDeviceTracking() {
        try {
            console.log('Setting up device tracking...');

            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission !== 'granted') {
                    throw new Error('Device orientation permission denied');
                }
            }

            window.addEventListener('deviceorientation', handleOrientation, true);

            setupTouchControls();

            setTimeout(() => {
                if (deviceOrientation.alpha === 0 && deviceOrientation.beta === 0) {
                    console.warn('Device orientation not working, using fallback');
                    setupTouchFallback();
                } else {
                    isTracking = true;
                    updateTrackingStatus();
                    console.log('Device tracking active');
                }
            }, 1000);

        } catch (error) {
            console.error('Device tracking setup failed:', error);
            setupTouchFallback();
        }
    }

    function handleOrientation(event) {
        const newOrientation = {
            alpha: event.alpha || 0,
            beta: event.beta || 0,
            gamma: event.gamma || 0
        };

    // Calculate tracking stability
        if (deviceOrientation.alpha !== 0 || deviceOrientation.beta !== 0) {
            const alphaDiff = Math.abs(newOrientation.alpha - deviceOrientation.alpha);
            const betaDiff = Math.abs(newOrientation.beta - deviceOrientation.beta);

            if (alphaDiff < 2 && betaDiff < 2) {
                stabilityCounter++;
                trackingQuality = Math.min(100, trackingQuality + 5);
            } else {
                stabilityCounter = 0;
                trackingQuality = Math.max(0, trackingQuality - 2);
            }
        }

        deviceOrientation = newOrientation;

    // Create world anchor when object is first placed and tracking is stable
        if (!worldAnchor && objectPlaced && trackingQuality > 50) {
            worldAnchor = {
                orientation: { ...deviceOrientation },
                position: { ...objectPosition },
                timestamp: Date.now()
            };
            console.log('World anchor created with quality:', trackingQuality);
        }
    }


    function handleMotion(event) {
        if (event.acceleration && event.rotationRate) {
            const now = Date.now();
        const deltaTime = (now - lastUpdateTime) / 1000; // Convert to seconds
        lastUpdateTime = now;
        
        const motion = {
            acceleration: {
                x: event.acceleration.x || 0,
                y: event.acceleration.y || 0,
                z: event.acceleration.z || 0
            },
            rotation: {
                alpha: event.rotationRate.alpha || 0,
                beta: event.rotationRate.beta || 0,
                gamma: event.rotationRate.gamma || 0
            },
            timestamp: now
        };
        
        // Predict position changes based on motion
        if (deltaTime > 0 && deltaTime < 0.1) { // Valid time delta
            positionPredictor.x += motion.acceleration.x * deltaTime * 0.01;
            positionPredictor.y += motion.acceleration.y * deltaTime * 0.01;
            positionPredictor.z += motion.acceleration.z * deltaTime * 0.01;
            
            // Apply damping to prevent drift
            positionPredictor.x *= 0.95;
            positionPredictor.y *= 0.95;
            positionPredictor.z *= 0.95;
        }
        
        motionHistory.push(motion);
        if (motionHistory.length > 15) {
            motionHistory.shift();
        }
        
        deviceMotion = motion;
    }
}


function detectVisualFeatures() {
    // Simple edge detection for visual anchoring
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const video = document.getElementById('camera');
    
    if (!video.videoWidth || !video.videoHeight) return null;
    
    canvas.width = 160; // Low res for performance
    canvas.height = 120;
    
    try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Simple corner detection
        const corners = findCorners(imageData);
        
        if (corners.length > 3) {
            return {
                corners: corners,
                confidence: Math.min(100, corners.length * 10),
                timestamp: Date.now()
            };
        }
        
    } catch (error) {
        // Canvas access might fail on some devices
        return null;
    }
    
    return null;
}

function findCorners(imageData) {
    const corners = [];
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    // Simple corner detection algorithm
    for (let y = 10; y < height - 10; y += 10) {
        for (let x = 10; x < width - 10; x += 10) {
            const intensity = getPixelIntensity(data, x, y, width);
            const surrounding = [
                getPixelIntensity(data, x-5, y-5, width),
                getPixelIntensity(data, x+5, y-5, width),
                getPixelIntensity(data, x-5, y+5, width),
                getPixelIntensity(data, x+5, y+5, width)
            ];
            
            const variance = calculateVariance([intensity, ...surrounding]);
            
            if (variance > 30) { // Corner threshold
                corners.push({ x, y, strength: variance });
            }
        }
    }
    
    return corners.sort((a, b) => b.strength - a.strength).slice(0, 10);
}

function getPixelIntensity(data, x, y, width) {
    const index = (y * width + x) * 4;
    return (data[index] + data[index + 1] + data[index + 2]) / 3;
}

function calculateVariance(values) {
    const mean = values.reduce((a, b) => a + b) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
}

function setupTouchFallback() {
    console.log('Setting up touch-based camera control');
    let isInteracting = false;
    let lastTouchFallback = { x: 0, y: 0 }; 
    let cameraRotation = { x: 0, y: 0 };

    const canvas = document.getElementById('ar-canvas');

    canvas.addEventListener('touchstart', (e) => {
        if (objectPlaced) return;
        e.preventDefault();
        isInteracting = true;
        const touch = e.touches[0];
        lastTouchFallback.x = touch.clientX;
        lastTouchFallback.y = touch.clientY;
    });

    canvas.addEventListener('touchmove', (e) => {
        if (objectPlaced || !isInteracting) return;
        e.preventDefault();

        const touch = e.touches[0];
        const deltaX = touch.clientX - lastTouchFallback.x;
        const deltaY = touch.clientY - lastTouchFallback.y;

        cameraRotation.y += deltaX * 0.01;
        cameraRotation.x += deltaY * 0.01;

        if (objectPlaced) {
           updateCameraPosition(cameraRotation);
       }

       lastTouchFallback.x = touch.clientX;
       lastTouchFallback.y = touch.clientY;
   });

    canvas.addEventListener('touchend', () => {
       isInteracting = false;
   });

    isTracking = true;
    updateTrackingStatus();
}

function setupTouchControls() {
   const canvas = document.getElementById('ar-canvas');

   canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
   canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
   canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

   canvas.addEventListener('mousedown', handleMouseStart);
   canvas.addEventListener('mousemove', handleMouseMove);
   canvas.addEventListener('mouseup', handleMouseEnd);
}

function handleTouchStart(e) {
   if (!objectPlaced) return;
   e.preventDefault();
   isDragging = true;

   if (e.touches.length === 1) {
       const touch = e.touches[0];
       lastTouch.x = touch.clientX;
       lastTouch.y = touch.clientY;
   } else if (e.touches.length === 2) {
       const touch1 = e.touches[0];
       const touch2 = e.touches[1];

       isScaling = true;
       lastTouch.scale = Math.hypot(
           touch2.clientX - touch1.clientX,
           touch2.clientY - touch1.clientY
           );

       lastTouch.centerX = (touch1.clientX + touch2.clientX) / 2;
       lastTouch.centerY = (touch1.clientY + touch2.clientY) / 2;
       lastTouch.angle = Math.atan2(
           touch2.clientY - touch1.clientY,
           touch2.clientX - touch1.clientX
           );
   }
}

function handleTouchMove(e) {
    if (!objectPlaced || !isDragging) return;
    e.preventDefault();
    
    if (e.touches.length === 1 && !isScaling) {
        const touch = e.touches[0];
        const deltaX = touch.clientX - lastTouch.x;
        const deltaY = touch.clientY - lastTouch.y;
        
        const moveSensitivity = 0.01;
        objectPosition.x += deltaX * moveSensitivity;
        objectPosition.y -= deltaY * moveSensitivity;
        
        if (arObject) {
            arObject.position.set(objectPosition.x, objectPosition.y, objectPosition.z);
        }
        
        lastTouch.x = touch.clientX;
        lastTouch.y = touch.clientY;
        
    } else if (e.touches.length === 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        
        const currentDistance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY
            );
        
        const centerX = (touch1.clientX + touch2.clientX) / 2;
        const centerY = (touch1.clientY + touch2.clientY) / 2;
        
        if (isScaling) {
            const scaleChange = currentDistance / lastTouch.scale;
            objectScale = Math.max(0.5, Math.min(3.0, objectScale * scaleChange));
            
            if (arObject) {
                arObject.scale.setScalar(objectScale);
            }
            
            document.getElementById('scaleSlider').value = objectScale;
            document.getElementById('scaleValue').textContent = Math.round(objectScale * 100) + '%';
            
            showScaleNotification(Math.round(objectScale * 100) + '%');
            
            lastTouch.scale = currentDistance;
        }
        
        if (lastTouch.centerX !== undefined && lastTouch.centerY !== undefined) {
            const centerDeltaX = centerX - lastTouch.centerX;
            const centerDeltaY = centerY - lastTouch.centerY;
            
            const rotationSensitivity = 0.02;
            
            objectRotation.y += centerDeltaX * rotationSensitivity;
            objectRotation.x += centerDeltaY * rotationSensitivity;
            
            const currentAngle = Math.atan2(
                touch2.clientY - touch1.clientY,
                touch2.clientX - touch1.clientX
                );
            
            if (lastTouch.angle !== undefined) {
                let angleDiff = currentAngle - lastTouch.angle;
                
                if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                
                objectRotation.z += angleDiff * 0.8;
            }
            
            lastTouch.angle = currentAngle;
            
            if (arObject) {
                arObject.rotation.x = objectRotation.x;
                arObject.rotation.y = objectRotation.y;
                arObject.rotation.z = objectRotation.z;
            }
        }
        
        lastTouch.centerX = centerX;
        lastTouch.centerY = centerY;
    }
}

function handleTouchEnd(e) {
   isDragging = false;
   isScaling = false;
   lastTouch.angle = undefined;
   lastTouch.centerX = undefined;
   lastTouch.centerY = undefined;

   setTimeout(() => {
       const notification = document.getElementById('scaleNotification');
       if (notification) notification.remove();
   }, 300);
}

function handleMouseStart(e) {
   if (!objectPlaced) return;
   isDragging = true;
   lastTouch.x = e.clientX;
   lastTouch.y = e.clientY;
}

function handleMouseMove(e) {
   if (!objectPlaced || !isDragging) return;

   const deltaX = e.clientX - lastTouch.x;
   const deltaY = e.clientY - lastTouch.y;

   const moveSensitivity = 0.01;
   objectPosition.x += deltaX * moveSensitivity;
   objectPosition.y -= deltaY * moveSensitivity;

   if (arObject) {
       arObject.position.set(objectPosition.x, objectPosition.y, objectPosition.z);
   }

   lastTouch.x = e.clientX;
   lastTouch.y = e.clientY;
}

function handleMouseEnd(e) {
   isDragging = false;
}

async function create3DObject() {
    if (arObject) {
        scene.remove(arObject);
    }

    let model = null;
    
    // Try to load 3D model first if available
    if (modelLoader && (currentObjectData.is3d || currentObjectData.type === '3d_model')) {
        console.log('Attempting to load 3D model...');
        const modelPaths = modelLibrary[currentObjectData.type] || modelLibrary['3d_model'];
        model = await load3DModel(modelPaths);
    } else if (modelLoader && modelLibrary[currentObjectData.type]) {
        console.log('Attempting to load model for type:', currentObjectData.type);
        const modelPaths = modelLibrary[currentObjectData.type];
        model = await load3DModel(modelPaths);
    }

    // If model loading failed, create fallback geometry
    if (!model) {
        console.log('Creating fallback geometry for:', currentObjectData.type);
        model = createFallbackGeometry();
    }

    arObject = model;
    arObject.position.set(objectPosition.x, objectPosition.y, objectPosition.z);
    arObject.scale.setScalar(objectScale);

    if (manualRotationMode) {
        arObject.rotation.x = objectRotation.x;
        arObject.rotation.y = objectRotation.y;
        arObject.rotation.z = objectRotation.z;
    }

    scene.add(arObject);
    console.log('3D object created and added to scene');
}


async function load3DModel(modelPaths) {
    if (!modelLoader || !Array.isArray(modelPaths)) {
        return null;
    }

    for (let modelPath of modelPaths) {
        try {
            console.log('Loading model from:', modelPath);
            
            // Handle user-generated models
            if (modelPath.includes('photo_model_') || modelPath.includes('user-models/')) {
                console.log('User-generated model detected, using enhanced fallback');
                return createEnhancedFallback('user_model');
            }
            
            const gltf = await new Promise((resolve, reject) => {
                modelLoader.load(modelPath, resolve, undefined, reject);
            });

            const model = gltf.scene;
            
            // Normalize model size
            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 1.0 / maxDim;
            model.scale.multiplyScalar(scale);
            
            console.log('Model loaded successfully!');
            return model;
            
        } catch (error) {
            console.warn('Failed to load model from:', modelPath, error);
            continue;
        }
    }
    
    return null;
}

function createFallbackGeometry() {
   
    let geometry, material;

    if (currentObjectData.is3d || currentObjectData.type === '3d_model') {
        geometry = new THREE.IcosahedronGeometry(0.6, 2);
        material = new THREE.MeshPhongMaterial({
            color: 0xFFD700,
            shininess: 100,
            transparent: true,
            opacity: 0.9
        });

        const wireframeGeometry = new THREE.IcosahedronGeometry(0.62, 2);
        const wireframeMaterial = new THREE.MeshBasicMaterial({
            color: 0xFFD700,
            wireframe: true,
            transparent: true,
            opacity: 0.4
        });

        const group = new THREE.Group();
        const mainMesh = new THREE.Mesh(geometry, material);
        const wireframe = new THREE.Mesh(wireframeGeometry, wireframeMaterial);

        mainMesh.castShadow = true;
        mainMesh.receiveShadow = true;

        group.add(mainMesh);
        group.add(wireframe);
        group.userData = { rotationSpeed: 0.005 };

        return group;
    } else {
        // Regular geometric shapes
        switch (currentObjectData.type) {
        case 'bottle':
            geometry = new THREE.CylinderGeometry(0.25, 0.35, 1.2, 8);
            material = new THREE.MeshPhongMaterial({ color: 0x2196F3 });
            break;
        case 'box':
            geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
            material = new THREE.MeshPhongMaterial({ color: 0xF44336 });
            break;
        case 'ball':
            geometry = new THREE.SphereGeometry(0.4, 16, 16);
            material = new THREE.MeshPhongMaterial({ color: 0x4CAF50 });
            break;
        default:
            geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
            material = new THREE.MeshPhongMaterial({ color: 0x9C27B0 });
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }
}


function createEnhancedFallback(modelType) {
    console.log('Creating enhanced fallback for:', modelType);
    
    if (modelType === 'user_model') {
        // Special fallback for user-generated models
        const group = new THREE.Group();
        
        // Main crystal-like object
        const geometry = new THREE.OctahedronGeometry(0.8, 2);
        const material = new THREE.MeshPhongMaterial({
            color: 0x00FFAA,
            shininess: 100,
            transparent: true,
            opacity: 0.8,
            emissive: 0x002211
        });
        
        const mainMesh = new THREE.Mesh(geometry, material);
        
        // Wireframe overlay
        const wireframeGeometry = new THREE.OctahedronGeometry(0.82, 2);
        const wireframeMaterial = new THREE.MeshBasicMaterial({
            color: 0x00FFAA,
            wireframe: true,
            transparent: true,
            opacity: 0.6
        });
        const wireframe = new THREE.Mesh(wireframeGeometry, wireframeMaterial);
        
        // Glowing core
        const coreGeometry = new THREE.SphereGeometry(0.3, 16, 16);
        const coreMaterial = new THREE.MeshBasicMaterial({
            color: 0xAAFFFF,
            transparent: true,
            opacity: 0.7
        });
        const core = new THREE.Mesh(coreGeometry, coreMaterial);
        
        mainMesh.castShadow = true;
        mainMesh.receiveShadow = true;
        
        group.add(core);
        group.add(mainMesh);
        group.add(wireframe);
        group.userData = { rotationSpeed: 0.008 };
        
        console.log('Enhanced user model fallback created');
        return group;
    }
    
    // Default fallback
    return createFallbackGeometry();
}


function startRenderLoop() {
   function animate() {
       if (!objectPlaced) return;

       animationId = requestAnimationFrame(animate);

       if (!manualRotationMode) {
           updateCameraFromOrientation();
       }

       if (arObject && arObject.userData && arObject.userData.rotationSpeed && !manualRotationMode) {
           arObject.rotation.y += arObject.userData.rotationSpeed;
       }

       renderer.render(scene, threeCamera);
   }
   animate();
}

function updateCameraFromOrientation() {
    if (!worldAnchor || !isTracking || !objectPlaced) return;

    const alphaDiff = (deviceOrientation.alpha - worldAnchor.orientation.alpha) * Math.PI / 180;
    const betaDiff = (deviceOrientation.beta - worldAnchor.orientation.beta) * Math.PI / 180;
    const gammaDiff = (deviceOrientation.gamma - worldAnchor.orientation.gamma) * Math.PI / 180;

    // Enhanced radius calculation with stability
    const baseRadius = 4;
    const stabilityFactor = Math.min(1.0, trackingQuality / 100);
    const radius = baseRadius * (0.8 + 0.2 * stabilityFactor);

    // Enhanced position with motion prediction
    const targetX = worldAnchor.position.x + radius * Math.sin(alphaDiff) * Math.cos(betaDiff) - positionPredictor.x;
    const targetZ = worldAnchor.position.z + radius * Math.cos(alphaDiff) * Math.cos(betaDiff) - positionPredictor.z;
    const targetY = worldAnchor.position.y + radius * Math.sin(betaDiff) - positionPredictor.y;

    // Smooth camera movement (lerp)
    const lerpFactor = 0.1;
    const currentPos = threeCamera.position;
    
    threeCamera.position.set(
        currentPos.x + (targetX - currentPos.x) * lerpFactor,
        currentPos.y + (targetY - currentPos.y) * lerpFactor,
        currentPos.z + (targetZ - currentPos.z) * lerpFactor
        );

    threeCamera.lookAt(worldAnchor.position.x, worldAnchor.position.y, worldAnchor.position.z);
    threeCamera.rotation.z = gammaDiff * 0.3; // Reduced rotation sensitivity
}

function updateCameraPosition(rotation) {
   if (!objectPlaced) return;

   const radius = 4;
   const x = objectPosition.x + radius * Math.sin(rotation.y) * Math.cos(rotation.x);
   const z = objectPosition.z + radius * Math.cos(rotation.y) * Math.cos(rotation.x);
   const y = objectPosition.y + radius * Math.sin(rotation.x);

   threeCamera.position.set(x, y, z);
   threeCamera.lookAt(objectPosition.x, objectPosition.y, objectPosition.z);
}

function updateTrackingStatus() {
   const statusElement = document.getElementById('trackingStatus');
   const trackingValue = document.getElementById('trackingValue');

   if (isTracking && objectPlaced) {
       statusElement.textContent = 'Spatial tracking active';
       statusElement.classList.add('tracking-active');
       statusElement.style.display = 'block';
       trackingValue.textContent = 'Active';
       trackingValue.style.color = '#4CAF50';

       setTimeout(() => {
           statusElement.classList.add('fade-out');
           setTimeout(() => {
               statusElement.style.display = 'none';
               statusElement.classList.remove('fade-out');
           }, 300);
       }, 2000);

   } else if (isTracking) {
       statusElement.textContent = 'Ready to place object';
       statusElement.classList.remove('tracking-active');
       statusElement.style.display = 'block';
       trackingValue.textContent = 'Ready';
       trackingValue.style.color = '#FFD700';

       setTimeout(() => {
           statusElement.style.display = 'none';
       }, 1500);

   } else {
       statusElement.textContent = 'Initializing tracking...';
       statusElement.classList.remove('tracking-active');
       statusElement.style.display = 'block';
       trackingValue.textContent = 'Off';
       trackingValue.style.color = '#F44336';
   }
}

   // Public API
return {
   init: async function(objectData) {
    currentObjectData = objectData;
    setupThreeJS();
    await initializeModelLoader();
    return setupDeviceTracking();
},

placeObject: async function() {
   create3DObject();
   objectPlaced = true;
   initialOrientation = { ...deviceOrientation };
   startRenderLoop();
   updateTrackingStatus();
},

updateScale: function(scale) {
   objectScale = scale;
   if (arObject) {
       arObject.scale.setScalar(objectScale);
   }
},

resetObject: function() {
   if (arObject) {
       scene.remove(arObject);
       arObject = null;
   }

   if (animationId) {
       cancelAnimationFrame(animationId);
       animationId = null;
   }

   objectPlaced = false;
   worldAnchor = null;
   trackingQuality = 0;
   stabilityCounter = 0;
   motionHistory = [];
   initialOrientation = null;
   objectScale = 1.0;
   objectRotation = { x: 0, y: 0, z: 0 };
   objectPosition = { x: 0, y: -1, z: -3 };

   threeCamera.position.set(0, 0, 0);
   threeCamera.rotation.set(0, 0, 0);

   updateTrackingStatus();
},

handleResize: function() {
   if (threeCamera && renderer) {
       threeCamera.aspect = window.innerWidth / window.innerHeight;
       threeCamera.updateProjectionMatrix();
       renderer.setSize(window.innerWidth, window.innerHeight);
   }
}
};
})();