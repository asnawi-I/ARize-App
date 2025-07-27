// AR Engine - Three.js and spatial tracking

window.AREngine = (function() {

    // Model loading variables
    let modelLoader = null;
    let loadingProgress = 0;
    let isModelLoading = false;
    const modelLibrary = {
        '3d_model': 'models/default-scan.glb',
        'bottle': 'models/bottle.glb',
        'box': 'models/box.glb',
        'ball': 'models/ball.glb',
        'cube': 'models/cube.glb'
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
        if (window.GLTFLoader) {
            modelLoader = new window.GLTFLoader();
            console.log('GLTF Loader initialized');
        } else {
            console.warn('GLTF Loader not available, using fallback geometry');
        }
    }

    async function setupDeviceTracking() {
        try {
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission !== 'granted') {
                    throw new Error('Device orientation permission denied');
                }
            }

            window.addEventListener('deviceorientation', handleOrientation, true);
            
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                const motionPermission = await DeviceMotionEvent.requestPermission();
                if (motionPermission === 'granted') {
                    window.addEventListener('devicemotion', handleMotion, true);
                }
            } else {
                window.addEventListener('devicemotion', handleMotion, true);
            }

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
            }, 500);

        } catch (error) {
            console.error('Device tracking setup failed:', error);
            setupTouchFallback();
        }
    }

    function handleOrientation(event) {
        deviceOrientation.alpha = event.alpha || 0;
        deviceOrientation.beta = event.beta || 0;
        deviceOrientation.gamma = event.gamma || 0;
        
        if (!initialOrientation && objectPlaced) {
            initialOrientation = { ...deviceOrientation };
        }
    }

    function handleMotion(event) {
        if (event.acceleration) {
            deviceMotion.x = event.acceleration.x || 0;
            deviceMotion.y = event.acceleration.y || 0;
            deviceMotion.z = event.acceleration.z || 0;
        }
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
            const deltaX = touch.client
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

 function create3DObject() {
     if (arObject) {
         scene.remove(arObject);
     }

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

         arObject = new THREE.Group();
         const mainMesh = new THREE.Mesh(geometry, material);
         const wireframe = new THREE.Mesh(wireframeGeometry, wireframeMaterial);

         mainMesh.castShadow = true;
         mainMesh.receiveShadow = true;

         arObject.add(mainMesh);
         arObject.add(wireframe);
         arObject.userData = { rotationSpeed: 0.005 };

     } else {
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

         arObject = new THREE.Mesh(geometry, material);
         arObject.castShadow = true;
         arObject.receiveShadow = true;
     }

     arObject.position.set(objectPosition.x, objectPosition.y, objectPosition.z);
     arObject.scale.setScalar(objectScale);

     if (manualRotationMode) {
         arObject.rotation.x = objectRotation.x;
         arObject.rotation.y = objectRotation.y;
         arObject.rotation.z = objectRotation.z;
     }

     scene.add(arObject);
     console.log('3D object created at:', objectPosition);
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
     if (!initialOrientation || !isTracking) return;

     const alphaDiff = (deviceOrientation.alpha - initialOrientation.alpha) * Math.PI / 180;
     const betaDiff = (deviceOrientation.beta - initialOrientation.beta) * Math.PI / 180;
     const gammaDiff = (deviceOrientation.gamma - initialOrientation.gamma) * Math.PI / 180;

     const radius = 4;

     const x = objectPosition.x + radius * Math.sin(alphaDiff) * Math.cos(betaDiff);
     const z = objectPosition.z + radius * Math.cos(alphaDiff) * Math.cos(betaDiff);
     const y = objectPosition.y + radius * Math.sin(betaDiff);

     threeCamera.position.set(x, y, z);
     threeCamera.lookAt(objectPosition.x, objectPosition.y, objectPosition.z);

     threeCamera.rotation.z = gammaDiff * 0.5;
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
     init: function(objectData) {
        currentObjectData = objectData;
        setupThreeJS();
        initializeModelLoader();
        return setupDeviceTracking();
    },

     placeObject: function() {
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