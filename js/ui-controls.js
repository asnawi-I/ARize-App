// UI Controls and Interactions

let statsVisible = false;

function toggleStats() {
    statsVisible = !statsVisible;
    const panel = document.getElementById('statsPanel');
    const toggle = document.getElementById('statsToggle');

    if (statsVisible) {
        panel.classList.add('visible');
        toggle.style.background = 'rgba(255,255,255,0.2)';
    } else {
        panel.classList.remove('visible');
        toggle.style.background = 'rgba(0,0,0,0.6)';
    }
}

function toggleControls() {
    const panel = document.getElementById('controlPanel');
    const toggle = document.getElementById('controlsToggle');
    
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        toggle.style.background = 'rgba(255,255,255,0.2)';
    } else {
        panel.style.display = 'none';
        toggle.style.background = 'rgba(0,0,0,0.6)';
    }
}

function updateObjectScale(value) {
    window.AREngine.updateScale(parseFloat(value));
    document.getElementById('scaleValue').textContent = Math.round(value * 100) + '%';
}

function takeScreenshot() {
    const flash = document.createElement('div');
    flash.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: white;
        z-index: 1000;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.1s;
    `;
    document.body.appendChild(flash);

    flash.style.opacity = '0.7';
    setTimeout(() => {
        flash.style.opacity = '0';
        setTimeout(() => flash.remove(), 200);
    }, 100);

    showNotification('AR photo captured!');
}

function resetPosition() {
    window.AREngine.resetObject();
    
    const controlPanel = document.getElementById('controlPanel');
    const controlsToggle = document.getElementById('controlsToggle');
    const bottomUI = document.getElementById('bottomUI');
    const placementUI = document.getElementById('placementUI');
    
    document.getElementById('scaleSlider').value = 1.0;
    document.getElementById('scaleValue').textContent = '100%';
    controlPanel.style.display = 'none';
    controlsToggle.style.background = 'rgba(0,0,0,0.6)';
    bottomUI.style.display = 'none';
    placementUI.style.display = 'block';
    
    showNotification('Object reset - place again');
}

function placeObject() {
    const placementUI = document.getElementById('placementUI');
    const bottomUI = document.getElementById('bottomUI');
    
    placementUI.style.display = 'none';
    bottomUI.style.display = 'block';
    
    window.AREngine.placeObject();
    showNotification('Object placed! Walk around to explore');
}

function goBack() {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        window.close();
    }
}

function setupARObjectData(objectData) {
    document.getElementById('qualityValue').textContent = objectData.quality + '%';
    document.getElementById('framesValue').textContent = objectData.frames;
    
    if (objectData.confidence > 0) {
        document.getElementById('confidenceRow').style.display = 'flex';
        document.getElementById('confidenceValue').textContent = objectData.confidence + '%';
    }

    if (objectData.is3d || objectData.type === '3d_model') {
        document.getElementById('modelRow').style.display = 'flex';
        document.getElementById('modelType').textContent = '3D Reconstruction';
    }
}