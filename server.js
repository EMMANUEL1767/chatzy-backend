const http = require('http');
const socketIO = require('socket.io');
const app = require('./src/app');
const { initDatabase } = require('./src/config/database');
const { setupSocketHandlers } = require('./src/config/socketHandler');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketIO(server, {
    cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Database and server initialization
async function startServer() {
    try {
        // Initialize database
        await initDatabase();
        console.log('Database initialized successfully');

        // Setup Socket.IO handlers
        setupSocketHandlers(io);
        console.log('Socket handlers initialized');

        // Start server
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
    process.exit(1);
});

startServer();