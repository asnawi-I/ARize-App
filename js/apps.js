// Main application initialization

let camera, loading, trackingStatus;
let objectData = {};

function checkDependencies() {
    const missing = [];
    if (typeof THREE === 'undefined') missing.push('THREE.js');
    if (typeof window.AREngine === 'undefined') missing.push('AREngine');
    if (typeof showNotification === 'undefined') missing.push('Utils');
    
    if (missing.length > 0) {
        throw new Error(`Missing: ${missing.join(', ')}`);
    }
}

async function initApp() {
    try {
        // Get DOM elements
        camera = document.getElementById('camera');
        loading = document.getElementById('loading');
        trackingStatus = document.getElementById('trackingStatus');

        // Check if mobile
        if (window.innerWidth > 768) {
            return;
        }

        console.log('Starting ARize AR...');

        // Parse URL parameters
        objectData = parseURLData();
        console.log('Parsed object data:', objectData);
        
        // Setup AR Engine
        await window.AREngine.init(objectData);
        
        // Start camera
        await startCamera();
        
        // Setup AR object data
        setupARObjectData(objectData);
        
        // Hide loading and show placement UI
        setTimeout(() => {
            loading.style.display = 'none';
            document.getElementById('placementUI').style.display = 'block';
            trackingStatus.style.display = 'block';
        }, 1000);

    } catch (error) {
        console.error('Failed to initialize AR:', error);
        console.error('Error stack:', error.stack);
        console.error('Error name:', error.name);
        console.error('Full error object:', JSON.stringify(error));

        // Hide loading before showing error
        if (loading) {
            loading.style.display = 'none';
        }

        showError(`AR Error: ${error.message || 'Unknown error'}`);
    }
}

async function startCamera() {
    try {
        const constraints = {
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        camera.srcObject = stream;
        console.log('Camera started successfully');
        
    } catch (error) {
        console.error('Camera access failed:', error);
        showCameraError();
    }
}

function showCameraError() {
    camera.style.display = 'none';
    document.body.style.background = 'linear-gradient(45deg, #1a1a1a, #2d2d2d)';
    
    const errorMessage = document.createElement('div');
    errorMessage.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.9);
        color: white;
        padding: 30px;
        border-radius: 15px;
        text-align: center;
        z-index: 300;
        border: 1px solid rgba(255,255,255,0.1);
        max-width: 300px;
    `;
    errorMessage.innerHTML = `
        <h3 style="margin-bottom: 15px;">Camera Required</h3>
        <p style="opacity: 0.8; margin-bottom: 20px; line-height: 1.4;">
            AR requires camera access. Please allow camera permissions and refresh.
        </p>
        <button onclick="location.reload()" style="
            background: #007AFF;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 20px;
            cursor: pointer;
            font-size: 14px;
        ">Try Again</button>
    `;
    document.body.appendChild(errorMessage);
}

// Event listeners
window.addEventListener('resize', () => {
    if (window.AREngine && window.AREngine.handleResize) {
        window.AREngine.handleResize();
    }
});

document.addEventListener('visibilitychange', () => {
    // Handle page visibility changes if needed
});

window.addEventListener('beforeunload', () => {
    if (camera.srcObject) {
        camera.srcObject.getTracks().forEach(track => track.stop());
    }
});

// Initialize the app when page loads
document.addEventListener('DOMContentLoaded', initApp);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

window.addEventListener('load', () => {
    if (loading && loading.style.display !== 'none') {
        console.log('Fallback init triggered');
        initApp();
    }
});