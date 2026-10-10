const { Server } = require('socket.io');
const { getAllowedOrigins } = require('./config/cors');

let io;

const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: (origin, callback) => {
                const allowed = getAllowedOrigins();
                if (!origin || allowed.includes(origin)) {
                    callback(null, true);
                } else {
                    callback(new Error('Not allowed by CORS'));
                }
            },
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    io.on('connection', (socket) => {
        console.log('New client connected:', socket.id);

        // Join a room based on user ID for targeted notifications
        socket.on('join', (userId) => {
            if (userId) {
                socket.join(userId);
                console.log(`User ${userId} joined their notification room`);
            }
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected');
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        // Return null on Vercel/serverless instead of throwing - callers must handle null
        if (process.env.VERCEL) return null;
        throw new Error('Socket.io not initialized');
    }
    return io;
};

module.exports = { initSocket, getIO };
