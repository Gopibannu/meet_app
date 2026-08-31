const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const frontendDist = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(frontendDist));

app.get("*", (req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

const rooms = new Map();

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("join-room", ({ roomId, userName }) => {
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.userName = userName;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(socket.id);

    const users = [];
    rooms.get(roomId).forEach((id) => {
      const userSocket = io.sockets.sockets.get(id);
      if (userSocket) {
        users.push({ id, name: userSocket.data.userName });
      }
    });

    socket.to(roomId).emit("user-joined", {
      userId: socket.id,
      userName,
      users,
    });

    socket.emit("room-users", users.filter((u) => u.id !== socket.id));
    console.log(`${userName} joined room ${roomId}`);
  });

  socket.on("offer", ({ to, offer }) => {
    io.to(to).emit("offer", { from: socket.id, offer });
  });

  socket.on("answer", ({ to, answer }) => {
    io.to(to).emit("answer", { from: socket.id, answer });
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("ice-candidate", { from: socket.id, candidate });
  });

  socket.on("chat-message", ({ roomId, message, userName }) => {
    io.to(roomId).emit("chat-message", {
      message,
      userName,
      timestamp: Date.now(),
    });
  });

  socket.on("toggle-video", ({ roomId, muted }) => {
    socket.to(roomId).emit("user-toggle-video", {
      userId: socket.id,
      muted,
    });
  });

  socket.on("toggle-audio", ({ roomId, muted }) => {
    socket.to(roomId).emit("user-toggle-audio", {
      userId: socket.id,
      muted,
    });
  });

  socket.on("leave-room", () => {
    handleLeave(socket);
  });

  socket.on("disconnect", () => {
    handleLeave(socket);
    console.log(`User disconnected: ${socket.id}`);
  });

  function handleLeave(sock) {
    const roomId = sock.data.roomId;
    if (!roomId) return;

    const roomUsers = rooms.get(roomId);
    if (roomUsers) {
      roomUsers.delete(sock.id);
      if (roomUsers.size === 0) {
        rooms.delete(roomId);
      }
    }

    sock.to(roomId).emit("user-left", {
      userId: sock.id,
      userName: sock.data.userName,
    });
    sock.leave(roomId);
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
