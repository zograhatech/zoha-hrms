const { Server } = require('socket.io');

let io;

const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: [
                'http://localhost:5173',
                'http://localhost:5174',
                'http://localhost:3000',
                'https://hrms-delta-eight.vercel.app'
            ],
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
