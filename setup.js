// INSTALLATION AND SETUP
// 1. Create a new directory for your project
// 2. Save this file as "setup.js"
// 3. Run "node setup.js" to create all necessary files
// 4. Run "npm install" to install dependencies
// 5. Run "npm start" to start the server
// 6. Open http://localhost:3000 in your browser

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Create directory structure
const dirs = [
    'public',
    'public/css',
    'public/js',
    'public/images'
];

// Create directories
dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
});

// File contents
const files = [
    {
        path: 'package.json',
        content: `{
  "name": "reno-rodeo-display-system",
  "version": "1.0.0",
  "description": "Live event display system for Reno Rodeo with phone integration",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.17.3",
    "socket.io": "^4.4.1",
    "qrcode": "^1.5.0"
  },
  "devDependencies": {
    "nodemon": "^2.0.15"
  }
}`
    },
    {
        path: 'server.js',
        content: `const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Create placeholder image if it doesn't exist
const placeholderPath = path.join(__dirname, 'public', 'images', 'waiting-for-preview.png');
if (!fs.existsSync(placeholderPath)) {
    // Create a simple placeholder image (1x1 pixel transparent PNG)
    const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    fs.writeFileSync(placeholderPath, Buffer.from(base64Data, 'base64'));
}

// Create logo placeholder if it doesn't exist
const logoPath = path.join(__dirname, 'public', 'images', 'dodge-ram-logo.png');
if (!fs.existsSync(logoPath)) {
    // Copy the placeholder as a temporary logo
    fs.copyFileSync(placeholderPath, logoPath);
}

// Store connected devices and their streams
const connectedDevices = new Map();

// Generate unique QR code for the event
async function generateEventQRCode(req) {
    try {
        const host = req.get('host');
        const protocol = req.protocol;
        const url = \`\${protocol}://\${host}/mobile\`;
        const qrCode = await QRCode.toDataURL(url);
        return qrCode;
    } catch (err) {
        console.error('QR Code generation error:', err);
        return null;
    }
}

// Handle device connections
io.on('connection', (socket) => {
    console.log('New device connected:', socket.id);
    
    // Identify control room connections
    socket.on('control-room-connected', () => {
        socket.join('control-room');
        console.log('Control room connected:', socket.id);
        
        // Send list of currently connected devices
        const deviceList = Array.from(connectedDevices.entries()).map(([id, device]) => ({
            id,
            preview: device.preview,
            type: device.type,
            name: device.name
        }));
        
        socket.emit('device-list-update', deviceList);
    });
    
    // Identify arena display connections
    socket.on('arena-display-connected', () => {
        socket.join('arena-display');
        console.log('Arena display connected:', socket.id);
    });

    // Handle mobile device registration
    socket.on('register-mobile-device', (deviceInfo) => {
        connectedDevices.set(socket.id, {
            type: 'mobile',
            name: deviceInfo.name || \`Phone \${connectedDevices.size + 1}\`,
            preview: null
        });
        
        // Notify control room about the new device
        io.to('control-room').emit('device-connected', {
            id: socket.id,
            type: 'mobile',
            name: deviceInfo.name || \`Phone \${connectedDevices.size}\`
        });
    });

    // Handle camera access approval
    socket.on('camera-access-approved', () => {
        io.to(socket.id).emit('start-preview');
    });

    // Handle preview image updates
    socket.on('preview-update', (imageData) => {
        const device = connectedDevices.get(socket.id);
        if (device) {
            device.preview = imageData;
            // Send to control room display
            io.to('control-room').emit('preview-update', {
                deviceId: socket.id,
                preview: imageData
            });
        }
    });

    // Handle live button click from control room
    socket.on('go-live', (deviceId) => {
        const device = connectedDevices.get(deviceId);
        if (device && device.preview) {
            // Send to arena display via HDMI
            io.to('arena-display').emit('arena-display-update', {
                content: device.preview,
                overlay: {
                    sponsorLogo: '/images/dodge-ram-logo.png',
                    eventTitle: 'RENO RODEO'
                }
            });
            
            // Notify all clients which device is live
            io.emit('device-is-live', deviceId);
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        if (connectedDevices.has(socket.id)) {
            // Notify control room about device disconnection
            io.to('control-room').emit('device-disconnected', socket.id);
            connectedDevices.delete(socket.id);
        }
        console.log('Device disconnected:', socket.id);
    });
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/control-room', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'control-room.html'));
});

app.get('/arena-display', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'arena-display.html'));
});

app.get('/mobile', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

app.get('/api/qr-code', async (req, res) => {
    const qrCode = await generateEventQRCode(req);
    res.json({ qrCode });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(\`Server running on port \${PORT}\`);
    console.log(\`Open http://localhost:\${PORT} in your browser\`);
});`
    },
    {
        path: 'public/index.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reno Rodeo Display System</title>
    <link rel="stylesheet" href="/css/styles.css">
</head>
<body>
    <div class="container">
        <h1>Reno Rodeo Display System</h1>
        <div class="qr-code-container">
            <h2>Scan QR Code to Connect Your Phone</h2>
            <div id="qrcode"></div>
        </div>
        <div class="buttons">
            <a href="/control-room" class="button">Go to Control Room</a>
            <a href="/arena-display" class="button">Go to Arena Display</a>
        </div>
    </div>
    
    <script src="/socket.io/socket.io.js"></script>
    <script>
        // Fetch and display QR code
        fetch('/api/qr-code')
            .then(response => response.json())
            .then(data => {
                const qrcodeDiv = document.getElementById('qrcode');
                const img = document.createElement('img');
                img.src = data.qrCode;
                qrcodeDiv.appendChild(img);
            })
            .catch(err => {
                console.error('Error fetching QR code:', err);
                document.getElementById('qrcode').textContent = 'Error generating QR code';
            });
    </script>
</body>
</html>`
    },
    {
        path: 'public/control-room.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reno Rodeo - Control Room</title>
    <link rel="stylesheet" href="/css/styles.css">
    <link rel="stylesheet" href="/css/control-room.css">
</head>
<body>
    <div class="control-room">
        <header>
            <h1>Control Room</h1>
            <div class="status-info">
                Connected Devices: <span id="device-count">0</span>
            </div>
        </header>
        
        <main>
            <div class="preview-grid" id="preview-grid">
                <!-- Previews will be added here dynamically -->
            </div>
        </main>
        
        <footer>
            <a href="/" class="button">Back to Home</a>
        </footer>
    </div>
    
    <script src="/socket.io/socket.io.js"></script>
    <script src="/js/control-room.js"></script>
</body>
</html>`
    },
    {
        path: 'public/arena-display.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reno Rodeo - Arena Display</title>
    <link rel="stylesheet" href="/css/styles.css">
    <link rel="stylesheet" href="/css/arena-display.css">
</head>
<body>
    <div class="arena-display">
        <div class="sponsor-logo" id="sponsor-logo"></div>
        <div class="content-area" id="content-area"></div>
        <div class="event-title" id="event-title">RENO RODEO</div>
    </div>
    
    <script src="/socket.io/socket.io.js"></script>
    <script src="/js/arena-display.js"></script>
</body>
</html>`
    },
    {
        path: 'public/mobile.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reno Rodeo - Mobile Connection</title>
    <link rel="stylesheet" href="/css/styles.css">
    <link rel="stylesheet" href="/css/mobile.css">
</head>
<body>
    <div class="mobile-container">
        <h1>Reno Rodeo</h1>
        
        <div id="connection-screen" class="connection-screen">
            <h2>Connect to Arena Display</h2>
            <p>Please enter your name and allow camera access</p>
            
            <div class="form-group">
                <input type="text" id="user-name" placeholder="Your Name" class="input-field">
                <button id="connect-btn" class="button">Connect</button>
            </div>
        </div>
        
        <div id="camera-screen" class="camera-screen hidden">
            <div class="camera-container">
                <video id="camera-preview" autoplay playsinline></video>
                <canvas id="capture-canvas" class="hidden"></canvas>
            </div>
            
            <div class="status-message" id="status-message">
                Connected. Streaming preview...
            </div>
            
            <div class="live-indicator hidden" id="live-indicator">
                LIVE
            </div>
        </div>
    </div>
    
    <script src="/socket.io/socket.io.js"></script>
    <script src="/js/mobile.js"></script>
</body>
</html>`
    },
    {
        path: 'public/css/styles.css',
        content: `:root {
    --primary-color: #d12028;
    --secondary-color: #2c3e50;
    --text-color: #333;
    --light-color: #ecf0f1;
    --dark-color: #2c3e50;
    --success-color: #27ae60;
    --danger-color: #e74c3c;
}

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    font-family: 'Arial', sans-serif;
    line-height: 1.6;
    color: var(--text-color);
    background-color: var(--light-color);
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
    text-align: center;
}

h1 {
    color: var(--primary-color);
    margin-bottom: 2rem;
}

h2 {
    color: var(--secondary-color);
    margin-bottom: 1rem;
}

.button {
    display: inline-block;
    background-color: var(--primary-color);
    color: white;
    padding: 0.75rem 1.5rem;
    text-decoration: none;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    transition: background-color 0.3s;
    margin: 0.5rem;
}

.button:hover {
    background-color: #b01b22;
}

.qr-code-container {
    margin: 2rem 0;
}

.qr-code-container img {
    max-width: 300px;
    margin: 1rem auto;
    display: block;
}

.hidden {
    display: none !important;
}

.input-field {
    padding: 0.75rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
    width: 100%;
    max-width: 300px;
}`
    },
    {
        path: 'public/css/control-room.css',
        content: `.control-room {
    padding: 1rem;
    height: 100vh;
    display: flex;
    flex-direction: column;
}

header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background-color: var(--secondary-color);
    color: white;
}

.status-info {
    font-size: 1.2rem;
}

main {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
}

.preview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
}

.preview-card {
    border: 1px solid #ddd;
    border-radius: 4px;
    overflow: hidden;
    background-color: white;
    transition: all 0.3s;
}

.preview-card.live {
    border: 3px solid var(--primary-color);
}

.preview-image {
    width: 100%;
    height: 200px;
    object-fit: cover;
    background-color: #f9f9f9;
}

.preview-info {
    padding: 1rem;
}

.preview-name {
    font-weight: bold;
    margin-bottom: 0.5rem;
}

.go-live-btn {
    width: 100%;
    background-color: var(--success-color);
}

.go-live-btn:hover {
    background-color: #219652;
}

footer {
    padding: 1rem;
    background-color: var(--dark-color);
    color: white;
    text-align: center;
}`
    },
    {
        path: 'public/css/arena-display.css',
        content: `.arena-display {
    width: 100vw;
    height: 100vh;
    position: relative;
    background-color: black;
    overflow: hidden;
}

.sponsor-logo {
    position: absolute;
    top: 20px;
    left: 20px;
    max-width: 150px;
    z-index: 10;
}

.sponsor-logo img {
    max-width: 100%;
}

.event-title {
    position: absolute;
    bottom: 20px;
    left: 0;
    right: 0;
    text-align: center;
    color: white;
    font-size: 2.5rem;
    font-weight: bold;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
    z-index: 10;
}

.content-area {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 5;
}

.content-area img {
    max-width: 100%;
    max-height: 100%;
}`
    },
    {
        path: 'public/css/mobile.css',
        content: `.mobile-container {
    max-width: 500px;
    margin: 0 auto;
    padding: 1rem;
    text-align: center;
}

.connection-screen {
    margin: 2rem 0;
}

.form-group {
    margin: 1.5rem 0;
}

.camera-screen {
    width: 100%;
}

.camera-container {
    width: 100%;
    margin-bottom: 1rem;
    position: relative;
}

#camera-preview {
    width: 100%;
    border-radius: 8px;
    background-color: #f1f1f1;
}

.live-indicator {
    position: absolute;
    top: 10px;
    right: 10px;
    background-color: var(--danger-color);
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-weight: bold;
    animation: blink 1s infinite;
}

@keyframes blink {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
}

.status-message {
    margin: 1rem 0;
    font-style: italic;
    color: var(--secondary-color);
}`
    },
    {
        path: 'public/js/control-room.js',
        content: `document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const previewGrid = document.getElementById('preview-grid');
    const deviceCount = document.getElementById('device-count');
    
    let currentLiveDevice = null;
    
    // Connect as control room
    socket.emit('control-room-connected');
    
    // Handle device list update
    socket.on('device-list-update', (devices) => {
        updateDeviceCount(devices.length);
        devices.forEach(device => {
            addDevicePreview(device.id, device.name, device.preview);
        });
    });
    
    // Handle new device connection
    socket.on('device-connected', (device) => {
        updateDeviceCount(previewGrid.children.length + 1);
        addDevicePreview(device.id, device.name);
    });
    
    // Handle device disconnection
    socket.on('device-disconnected', (deviceId) => {
        const deviceElement = document.getElementById(\`preview-\${deviceId}\`);
        if (deviceElement) {
            deviceElement.remove();
            updateDeviceCount(previewGrid.children.length - 1);
        }
    });
    
    // Handle preview updates
    socket.on('preview-update', ({ deviceId, preview }) => {
        updateDevicePreview(deviceId, preview);
    });
    
    // Handle live device update
    socket.on('device-is-live', (deviceId) => {
        updateLiveStatus(deviceId);
    });
    
    // Helper functions
    function updateDeviceCount(count) {
        deviceCount.textContent = count;
    }
    
    function addDevicePreview(deviceId, deviceName, initialPreview = null) {
        // Check if device already exists
        if (document.getElementById(\`preview-\${deviceId}\`)) {
            return;
        }
        
        const previewCard = document.createElement('div');
        previewCard.className = 'preview-card';
        previewCard.id = \`preview-\${deviceId}\`;
        
        const previewImage = document.createElement('img');
        previewImage.className = 'preview-image';
        previewImage.id = \`image-\${deviceId}\`;
        if (initialPreview) {
            previewImage.src = initialPreview;
        } else {
            previewImage.src = '/images/waiting-for-preview.png';
        }
        
        const previewInfo = document.createElement('div');
        previewInfo.className = 'preview-info';
        
        const nameElement = document.createElement('div');
        nameElement.className = 'preview-name';
        nameElement.textContent = deviceName || 'Unknown Device';
        
        const goLiveBtn = document.createElement('button');
        goLiveBtn.className = 'button go-live-btn';
        goLiveBtn.textContent = 'Go Live';
        goLiveBtn.addEventListener('click', () => {
            socket.emit('go-live', deviceId);
        });
        
        previewInfo.appendChild(nameElement);
        previewInfo.appendChild(goLiveBtn);
        
        previewCard.appendChild(previewImage);
        previewCard.appendChild(previewInfo);
        
        previewGrid.appendChild(previewCard);
    }
    
    function updateDevicePreview(deviceId, preview) {
        const previewImage = document.getElementById(\`image-\${deviceId}\`);
        if (previewImage && preview) {
            previewImage.src = preview;
        }
    }
    
    function updateLiveStatus(deviceId) {
        // Remove live status from previous device
        if (currentLiveDevice) {
            const previousCard = document.getElementById(\`preview-\${currentLiveDevice}\`);
            if (previousCard) {
                previousCard.classList.remove('live');
            }
        }
        
        // Add live status to new device
        const newCard = document.getElementById(\`preview-\${deviceId}\`);
        if (newCard) {
            newCard.classList.add('live');
        }
        
        currentLiveDevice = deviceId;
    }
});`
    },
    {
        path: 'public/js/arena-display.js',
        content: `document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const contentArea = document.getElementById('content-area');
    const sponsorLogo = document.getElementById('sponsor-logo');
    const eventTitle = document.getElementById('event-title');
    
    // Connect as arena display
    socket.emit('arena-display-connected');
    
    // Initialize sponsor logo
    const logoImg = document.createElement('img');
    logoImg.src = '/images/dodge-ram-logo.png';
    logoImg.alt = 'Dodge Ram';
    sponsorLogo.appendChild(logoImg);
    
    // Handle display updates
    socket.on('arena-display-update', (data) => {
        // Update content
        contentArea.innerHTML = '';
        if (data.content) {
            const contentImg = document.createElement('img');
            contentImg.src = data.content;
            contentArea.appendChild(contentImg);
        }
        
        // Update overlay elements if provided
        if (data.overlay) {
            if (data.overlay.sponsorLogo) {
                logoImg.src = data.overlay.sponsorLogo;
            }
            
            if (data.overlay.eventTitle) {
                eventTitle.textContent = data.overlay.eventTitle;
            }
        }
    });
});`
    },
    {
        path: 'public/js/mobile.js',
        content: `document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const connectBtn = document.getElementById('connect-btn');
    const userName = document.getElementById('user-name');
    const connectionScreen = document.getElementById('connection-screen');
    const cameraScreen = document.getElementById('camera-screen');
    const cameraPreview = document.getElementById('camera-preview');
    const captureCanvas = document.getElementById('capture-canvas');
    const statusMessage = document.getElementById('status-message');
    const liveIndicator = document.getElementById('live-indicator');
    
    let stream = null;
    let isConnected = false;
    let captureInterval = null;
    
    // Handle connect button click
    connectBtn.addEventListener('click', async () => {
        const name = userName.value.trim() || 'Anonymous';
        
        try {
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' },
                audio: false 
            });
            
            // Show camera screen and hide connection screen
            connectionScreen.classList.add('hidden');
            cameraScreen.classList.remove('hidden');
            
            // Set up video preview
            cameraPreview.srcObject = stream;
            
            // Setup canvas for capturing frames
            captureCanvas.width = 640;
            captureCanvas.height = 480;
            
            // Register device with the server
            socket.emit('register-mobile-device', { name });
            socket.emit('camera-access-approved');
            
            isConnected = true;
            startCapturing();
            
        } catch (err) {
            console.error('Error accessing camera:', err);
            statusMessage.textContent = 'Error: Could not access camera. Please grant permission.';
            statusMessage.style.color = 'red';
        }
    });
    
    // Handle live status
    socket.on('device-is-live', (deviceId) => {
        if (socket.id === deviceId) {
            liveIndicator.classList.remove('hidden');
        } else {
            liveIndicator.classList.add('hidden');
        }
    });
    
    // Handle reconnection
    socket.on('connect', () => {
        if (isConnected) {
            socket.emit('register-mobile-device', { 
                name: userName.value.trim() || 'Anonymous'
            });
            socket.emit('camera-access-approved');
        }
    });
    
    // Capture and send frames
    function startCapturing() {
        const context = captureCanvas.getContext('2d');
        
        captureInterval = setInterval(() => {
            if (cameraPreview.videoWidth > 0) {  // Make sure video is loaded
                context.drawImage(cameraPreview, 0, 0, captureCanvas.width, captureCanvas.height);
                const imageData = captureCanvas.toDataURL('image/jpeg', 0.7);
                socket.emit('preview-update', imageData);
            }
        }, 500); // Send every 500ms
    }
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        if (captureInterval) {
            clearInterval(captureInterval);
        }
        
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    });
});`
    }
];

// Write files
files.forEach(file => {
    fs.writeFileSync(file.path, file.content);
    console.log(`Created file: ${file.path}`);
});

console.log('\nSetup completed successfully!');
console.log('\nTo run the application:');
console.log('1. Run "npm install" to install dependencies');
console.log('2. Run "npm start" to start the server');
console.log('3. Open http://localhost:3000 in your browser');

// Optional: Automatically install dependencies
const installDeps = process.argv.includes('--install');
if (installDeps) {
    console.log('\nInstalling dependencies...');
    exec('npm install', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error installing dependencies: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`stderr: ${stderr}`);
            return;
        }
        console.log(`${stdout}`);
        console.log('Dependencies installed successfully!');
        
        // Start the application
        console.log('\nStarting the application...');
        console.log('Open http://localhost:3000 in your browser');
        exec('npm start');
    });
}
