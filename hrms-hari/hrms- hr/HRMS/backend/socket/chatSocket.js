const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

const chatSocket = (io) => {
    io.on('connection', (socket) => {
        console.log('User connected:', socket.id);

        socket.on('join_room', (roomId) => {
            socket.join(roomId);
            console.log(`User ${socket.id} joined room: ${roomId}`);
        });

        socket.on('send_message', async (data) => {
            const { conversationId, senderId, text, fileUrl, fileType } = data;

            try {
                const message = await Message.create({
                    conversationId,
                    sender: senderId,
                    text,
                    fileUrl,
                    fileType
                });

                await Conversation.findByIdAndUpdate(conversationId, {
                    lastMessage: message._id
                });

                // Populate sender info for the frontend
                const populatedMessage = await Message.findById(message._id)
                    .populate('sender', 'name id profile_image');

                io.to(conversationId).emit('receive_message', populatedMessage);

                // Also notify participants who are not in the room? (future enhancement)
            } catch (err) {
                console.error('Socket send_message error:', err);
            }
        });

        socket.on('typing', ({ conversationId, userName }) => {
            socket.to(conversationId).emit('user_typing', { userName });
        });

        socket.on('stop_typing', (conversationId) => {
            socket.to(conversationId).emit('user_stop_typing');
        });

        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.id);
        });
    });
};

module.exports = chatSocket;
