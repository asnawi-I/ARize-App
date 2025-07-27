// Utility functions for notifications and helpers

function showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 120px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.9);
        color: white;
        padding: 12px 20px;
        border-radius: 20px;
        z-index: 300;
        font-size: 14px;
        font-weight: 500;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.1);
        transition: all 0.3s ease;
        max-width: 280px;
        text-align: center;
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(() => notification.remove(), 300);
    }, 2500);
}

function showScaleNotification(percentage) {
    const existing = document.getElementById('scaleNotification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.id = 'scaleNotification';
    notification.textContent = percentage;
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        color: white;
        padding: 8px 16px;
        border-radius: 10px;
        z-index: 250;
        font-size: 14px;
        font-weight: 600;
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
        pointer-events: none;
        opacity: 1;
        min-width: 50px;
        text-align: center;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 200);
}

function showError(message) {
    const loading = document.getElementById('loading');
    loading.style.display = 'none';

    const error = document.createElement('div');
    error.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(244, 67, 54, 0.9);
        color: white;
        padding: 30px;
        border-radius: 15px;
        text-align: center;
        z-index: 300;
        border: 1px solid rgba(255,255,255,0.2);
        max-width: 300px;
    `;
    error.innerHTML = `
        <h3 style="margin-bottom: 15px;">AR Error</h3>
        <p style="opacity: 0.9; margin-bottom: 20px; line-height: 1.4;">
            ${message}
        </p>
        <button onclick="location.reload()" style="
            background: white;
            color: #F44336;
            border: none;
            padding: 12px 24px;
            border-radius: 20px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
        ">Reload</button>
    `;
    document.body.appendChild(error);
}

function parseURLData() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        id: urlParams.get('id') || 'demo',
        type: urlParams.get('type') || 'bottle',
        frames: parseInt(urlParams.get('frames')) || 30,
        duration: parseInt(urlParams.get('duration')) || 60,
        quality: parseInt(urlParams.get('quality')) || 85,
        confidence: parseInt(urlParams.get('confidence')) || 95,
        model: urlParams.get('model') || '',
        is3d: urlParams.get('is3d') === 'true' || urlParams.get('type') === '3d_model'
    };
}