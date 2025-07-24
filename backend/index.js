import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import axios from "axios";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const rooms = new Map();

io.on("connection", (socket) => {
  console.log("User Connected", socket.id);

  let currentRoom = null;

  socket.on("join", ({ roomId, userName }) => {
    if (currentRoom) {
      socket.leave(currentRoom);
      const room = rooms.get(currentRoom);
      if (room) {
        room.users.delete(socket.id);
        io.to(currentRoom).emit("userJoined", Array.from(room.users.values()));
      }
    }

    currentRoom = roomId;
    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, { users: new Map(), code: "// start code here" });
    }

    const room = rooms.get(roomId);
    room.users.set(socket.id, userName);

    socket.emit("codeUpdate", room.code);
    io.to(roomId).emit("userJoined", Array.from(room.users.values()));
  });

  socket.on("codeChange", ({ roomId, code }) => {
    const room = rooms.get(roomId);
    if (room) {
      room.code = code;
      socket.to(roomId).emit("codeUpdate", code);
    }
  });

  socket.on("leaveRoom", () => {
    const room = rooms.get(currentRoom);
    if (room) {
      room.users.delete(socket.id);
      io.to(currentRoom).emit("userJoined", Array.from(room.users.values()));
      socket.leave(currentRoom);
    }
    currentRoom = null;
  });

  socket.on("typing", ({ roomId, userName }) => {
    socket.to(roomId).emit("userTyping", userName);
  });

  socket.on("languageChange", ({ roomId, language }) => {
    io.to(roomId).emit("languageUpdate", language);
  });

  socket.on("compileCode", async ({ code, roomId, language, version, input }) => {
    const room = rooms.get(roomId);
    if (room) {
      try {
        const response = await axios.post(
          "https://emkc.org/api/v2/piston/execute",
          {
            language,
            version,
            files: [{ content: code }],
            stdin: input,
          }
        );

        room.output = response.data.run.output;
        io.to(roomId).emit("codeResponse", response.data);
      } catch (error) {
        console.error("Code execution failed:", error.message);
      }
    }
  });

  socket.on("disconnect", () => {
    const room = rooms.get(currentRoom);
    if (room) {
      room.users.delete(socket.id);
      io.to(currentRoom).emit("userJoined", Array.from(room.users.values()));
    }
    console.log("User Disconnected", socket.id);
  });
});

const port = process.env.PORT || 5001;
const __dirname = path.resolve();

server.listen(port, () => {
  console.log("server is working on port", port);
});
