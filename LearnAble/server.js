
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = 3000;

const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const usersFile = path.join(dataDir, "users.json");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(usersFile)) {
  fs.writeFileSync(usersFile, "[]");
}

function readUsers() {
  return JSON.parse(fs.readFileSync(usersFile, "utf8"));
}

function saveUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json"
  });
  res.end(JSON.stringify(data));
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 10000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

// Store active login sessions
const sessions = new Map();

function getSessionToken(req) {
  const cookie = req.headers.cookie || "";
  return cookie.match(/(?:^|;\s*)session=([^;]+)/)?.[1];
}

function getCurrentUser(req) {
  const token = getSessionToken(req);
  const userId = sessions.get(token);

  if (!userId) {
    return null;
  }

  return readUsers().find(user => user.id === userId);
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(
    req.url,
    "http://localhost"
  ).pathname;

  try {

    // REGISTER
    if (req.method === "POST" &&
        pathname === "/api/register") {

      const { name, email, password } = await readBody(req);

      if (
        typeof name !== "string" ||
        typeof email !== "string" ||
        typeof password !== "string" ||
        !name.trim() ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        password.length < 8
      ) {
        return sendJSON(res, 400, {
          error: "Please enter valid registration information."
        });
      }

      const users = readUsers();
      const normalizedEmail = email.trim().toLowerCase();

      if (users.some(user => user.email === normalizedEmail)) {
        return sendJSON(res, 409, {
          error: "An account with this email already exists."
        });
      }

      const salt = crypto.randomBytes(16).toString("hex");

      users.push({
        id: crypto.randomUUID(),
        name: name.trim(),
        email: normalizedEmail,
        salt: salt,
        passwordHash: hashPassword(password, salt),
        progress: 0,
        completedLessons: []
      });

      saveUsers(users);

      return sendJSON(res, 201, {
        message: "Account created successfully!"
      });
    }

    // LOGIN
    if (req.method === "POST" &&
        pathname === "/api/login") {

      const { email, password } = await readBody(req);

      if (typeof email !== "string" ||
          typeof password !== "string") {
        return sendJSON(res, 400, {
          error: "Invalid login information."
        });
      }

      const user = readUsers().find(
        u => u.email === email.trim().toLowerCase()
      );

      if (!user ||
          hashPassword(password, user.salt) !== user.passwordHash) {
        return sendJSON(res, 401, {
          error: "Incorrect email or password."
        });
      }

      const token = crypto.randomBytes(32).toString("hex");

      sessions.set(token, user.id);

      res.setHeader(
        "Set-Cookie",
        `session=${token}; HttpOnly; SameSite=Lax; Path=/`
      );

      return sendJSON(res, 200, {
        message: "Login successful!",
        name: user.name
      });
    }

    // GET USER PROGRESS
    if (req.method === "GET" &&
        pathname === "/api/me") {

      const user = getCurrentUser(req);

      if (!user) {
        return sendJSON(res, 401, {
          error: "Please log in."
        });
      }

      return sendJSON(res, 200, {
        name: user.name,
        progress: user.progress || 0,
        completedLessons: user.completedLessons || []
      });
    }

    // SAVE LESSON PROGRESS
    if (req.method === "POST" &&
        pathname === "/api/progress") {

      const currentUser = getCurrentUser(req);

      if (!currentUser) {
        return sendJSON(res, 401, {
          error: "Please log in first."
        });
      }

      const { lesson } = await readBody(req);

      if (!Number.isInteger(lesson) ||
          lesson < 1 || lesson > 4) {
        return sendJSON(res, 400, {
          error: "Invalid lesson."
        });
      }

      const users = readUsers();

      const user = users.find(
        u => u.id === currentUser.id
      );

      if (!Array.isArray(user.completedLessons)) {
        user.completedLessons = [];
      }

      // Prevent counting the same lesson twice
      if (!user.completedLessons.includes(lesson)) {
        user.completedLessons.push(lesson);
      }

      user.progress = user.completedLessons.length;

      saveUsers(users);

      return sendJSON(res, 200, {
        message: "Progress saved successfully!",
        progress: user.progress,
        completedLessons: user.completedLessons
      });
    }

    // LOGOUT
    if (req.method === "POST" &&
        pathname === "/api/logout") {

      const token = getSessionToken(req);

      if (token) {
        sessions.delete(token);
      }

      res.setHeader(
        "Set-Cookie",
        "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
      );

      return sendJSON(res, 200, {
        message: "Logged out successfully!"
      });
    }

    // SERVE WEBSITE FILES
    if (req.method === "GET") {

      const requested =
        pathname === "/" ? "/index.html" : pathname;

      const filePath = path.resolve(
        publicDir,
        "." + requested
      );

      if (!filePath.startsWith(publicDir + path.sep)) {
        return sendJSON(res, 403, {
          error: "Access denied."
        });
      }

      const types = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript"
      };

      const content = await fs.promises.readFile(filePath);

      res.writeHead(200, {
        "Content-Type":
          types[path.extname(filePath)] ||
          "application/octet-stream"
      });

      return res.end(content);
    }

    return sendJSON(res, 404, {
      error: "Not found."
    });

  } catch (error) {

    if (error.code === "ENOENT") {
      return sendJSON(res, 404, {
        error: "File not found."
      });
    }

    if (error.message === "Invalid JSON" ||
        error.message === "Request too large") {
      return sendJSON(res, 400, {
        error: error.message
      });
    }

    console.error(error);

    return sendJSON(res, 500, {
      error: "Server error."
    });
  }
});

server.listen(PORT, () => {
  console.log(
    `LearnAble running at http://localhost:${PORT}`
  );
});
