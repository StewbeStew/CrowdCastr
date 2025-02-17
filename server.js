const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const socketIo = require('socket.io');
const QRCode = require('qrcode');

const app = express();

// SSL Certificate configuration
const options = {
    key: fs.readFileSync('cert.key'),
    cert: fs.readFileSync('cert.crt')
};

const server = https.createServer(options, app);
const io = socketIo(server);

// Your specific IP address
const IP_ADDRESS = '192.168.0.13';

// Store streams, active device and settings
const streams = new Map();
let activeLiveDevice = null;
let displaySettings = {
    margins: { left: 0, right: 0, top: 0, bottom: 0 },
    colors: {
        background: '#000000',
        font: '#FFFFFF'
    }
};

let mobileSettings = {
    cameraFlip: false,
    demoMode: false,
    mainboardPopup: false
};

// Serve static files
app.use(express.static('public'));

// Generate QR code with specific IP
app.get('/api/qr-code', async (req, res) => {
    try {
        const url = `https://${IP_ADDRESS}:3000/mobile`;
        const qrCode = await QRCode.toDataURL(url);
        res.json({ qrCode });
    } catch (err) {
        console.error('QR Code generation error:', err);
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/mobile', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

app.get('/control-room', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'control-room.html'));
});

app.get('/arena-display', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'arena-display.html'));
});

// Get current settings
app.get('/api/settings', (req, res) => {
    res.json({
        display: displaySettings,
        mobile: mobileSettings
    });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('New device connected:', socket.id);
    
    // Send current settings to new connections
    socket.emit('initial-settings', {
        display: displaySettings,
        mobile: mobileSettings
    });
    
    socket.on('register-mobile-device', (data) => {
        console.log('Mobile device registered:', data.name);
        io.emit('device-connected', {
            id: socket.id,
            name: data.name
        });
        // Send current mobile settings to new device
        socket.emit('mobile-settings-updated', mobileSettings);
    });

    socket.on('camera-stream', (data) => {
        // Store the stream data
        streams.set(socket.id, data);
        
        // Send preview to control room
        io.emit('preview-update', {
            id: socket.id,
            stream: data
        });

        // If this is the active device, send to arena
        if (socket.id === activeLiveDevice) {
            io.emit('arena-update', {
                stream: data
            });
        }
    });

    socket.on('go-live', (deviceId) => {
        console.log('Setting device live:', deviceId);
        activeLiveDevice = deviceId;
        
        // Send initial frame if available
        const stream = streams.get(deviceId);
        if (stream) {
            io.emit('arena-update', {
                stream: stream
            });
        }

        // Notify all clients about the active device
        io.emit('live-device-changed', deviceId);
    });

    // Handle sponsor updates
    socket.on('update-sponsors', (sponsors) => {
        console.log('Updating sponsors:', sponsors);
        socket.broadcast.emit('update-sponsors', sponsors);
    });

    // Handle display settings updates
    socket.on('update-display-settings', (settings) => {
        console.log('Updating display settings:', settings);
        // Update stored settings
        if (settings.margins) displaySettings.margins = settings.margins;
        if (settings.colors) displaySettings.colors = settings.colors;
        // Broadcast to all clients
        socket.broadcast.emit('display-settings-updated', settings);
    });

    // Handle mobile settings updates
    socket.on('update-mobile-settings', (settings) => {
        console.log('Updating mobile settings:', settings);
        // Update stored settings
        mobileSettings = { ...mobileSettings, ...settings };
        // Broadcast to all clients
        socket.broadcast.emit('mobile-settings-updated', settings);
    });

    // Handle file uploads
    socket.on('upload-sponsor', (data) => {
        const { fileName, fileData } = data;
        const filePath = path.join(__dirname, 'public', 'uploads', fileName);
        
        // Ensure uploads directory exists
        if (!fs.existsSync(path.join(__dirname, 'public', 'uploads'))) {
            fs.mkdirSync(path.join(__dirname, 'public', 'uploads'), { recursive: true });
        }

        // Save the file
        fs.writeFileSync(filePath, Buffer.from(fileData.split(',')[1], 'base64'));
        
        // Send back the public URL
        const publicUrl = `/uploads/${fileName}`;
        socket.emit('sponsor-uploaded', { url: publicUrl });
    });

    socket.on('disconnect', () => {
        console.log('Device disconnected:', socket.id);
        streams.delete(socket.id);
        
        // Clear active device if it disconnected
        if (socket.id === activeLiveDevice) {
            activeLiveDevice = null;
            io.emit('live-device-changed', null);
        }
    });
});

// Start server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on https://${IP_ADDRESS}:${PORT}`);
    console.log(`QR code will point to: https://${IP_ADDRESS}:${PORT}/mobile`);
});