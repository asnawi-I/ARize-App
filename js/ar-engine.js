// AR Engine - Three.js and spatial tracking

window.AREngine = (function() {
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