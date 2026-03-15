const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
// const dns = require("node:dns/promises");
// dns.setServers(["1.1.1.1", "0.0.0.0"]);
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGO_URI =
  "mongodb+srv://codequestUser:Bagsic2030010@codequest.nd4m0pc.mongodb.net/codequest?retryWrites=true&w=majority";

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected Successfully"))
  .catch((err) => {
    console.error("MongoDB Connection Error:", err.message);
    process.exit(1);
  });

// User Schema
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    age: { type: Number, required: true, min: 5 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 6 },
    currentLevel: { type: Number, default: 1 },
    learningProgress: {
      overallCompletion: { type: Number, default: 0, min: 0, max: 100 },
      levelsCompleted: [{ type: Number }],
    },
    openedLevels: [{ type: Number }],
    badges: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        description: { type: String, required: true },
        earnedDate: { type: Date, default: Date.now },
        icon: { type: String, default: "trophy-award" },
      },
    ],
    leaderboardRank: { type: Number, default: 0 },
    scores: {
      type: Map,
      of: {
        highScore: { type: Number, default: 0 },
        attempts: { type: Number, default: 0 },
        lastAttempt: Date,
      },
      default: () => new Map(),
    },
    xp: { type: Number, default: 0 }, // Total XP para sa leaderboard
  },
  { timestamps: true },
);

const User = mongoose.model("User", userSchema);

const JWT_SECRET = "your-super-secret-jwt-key-12345-change-this-please";

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// Routes

app.get("/", (req, res) => {
  res.json({ message: "Backend is running! Welcome to CodeQuest API" });
});

// Signup
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, age, email, password } = req.body;
    if (!name || !age || !email || !password)
      return res.status(400).json({ message: "All fields required" });

    let user = await User.findOne({ email });
    if (user)
      return res.status(400).json({ message: "Email already registered" });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({ name, age, email, password: hashedPassword });
    await user.save();

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({
      message: "User registered",
      token,
      user: { id: user._id, name, email, currentLevel: 1 },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "All fields required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email,
        currentLevel: user.currentLevel,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Get Profile
app.get("/api/user/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const highestScores = {};
    if (user.scores && user.scores instanceof Map) {
      user.scores.forEach((value, key) => {
        highestScores[key] = value.highScore || 0;
      });
    }

    const totalCompleted = user.learningProgress.levelsCompleted.length;

    res.json({
      user: {
        ...user.toObject(),
        highestScores,
        totalCompleted,
      },
    });
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Update Progress & Score + Award Badges
app.post("/api/user/progress", authMiddleware, async (req, res) => {
  try {
    const { levelId, score } = req.body;
    if (!levelId || score === undefined)
      return res.status(400).json({ message: "levelId and score required" });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.scores || !(user.scores instanceof Map)) {
      user.scores = new Map();
    }

    const levelKey = `level${levelId}`;

    const current = user.scores.get(levelKey) || {
      highScore: 0,
      attempts: 0,
      lastAttempt: null,
    };
    user.scores.set(levelKey, {
      highScore: Math.max(current.highScore, score),
      attempts: current.attempts + 1,
      lastAttempt: new Date(),
    });

    // Update total XP (for leaderboard)
    user.xp = (user.xp || 0) + score;

    let levelJustCompleted = false;
    if (!user.learningProgress.levelsCompleted.includes(levelId)) {
      user.learningProgress.levelsCompleted.push(levelId);
      user.learningProgress.overallCompletion = Math.min(
        100,
        user.learningProgress.overallCompletion + 20,
      );
      levelJustCompleted = true;
    }

    // Auto-open current level
    if (!user.openedLevels.includes(levelId)) {
      user.openedLevels.push(levelId);
    }

    // Auto-unlock next level
    const nextLevel = levelId + 1;
    const minScoreToUnlock = 70;
    if (levelJustCompleted || score >= minScoreToUnlock) {
      if (!user.openedLevels.includes(nextLevel)) {
        user.openedLevels.push(nextLevel);
      }
    }

    // ────────────────────────────────────────────────
    // BADGE AWARDING LOGIC
    // ────────────────────────────────────────────────
    const awardedBadges = [];

    // Badge 1: First Steps – Level 1 completed
    if (levelId === 1 && levelJustCompleted) {
      const badgeId = "first-steps";
      if (!user.badges.some((b) => b.id === badgeId)) {
        user.badges.push({
          id: badgeId,
          name: "First Steps",
          description: "Completed your very first coding level!",
          icon: "foot-print",
        });
        awardedBadges.push("First Steps");
      }
    }

    // Badge 2: Perfect Loop – Perfect score in Level 2 (900+)
    if (levelId === 2 && score >= 900) {
      const badgeId = "perfect-loop";
      if (!user.badges.some((b) => b.id === badgeId)) {
        user.badges.push({
          id: badgeId,
          name: "Perfect Loop",
          description: "Achieved a perfect score in the For Loop challenge!",
          icon: "star-circle",
        });
        awardedBadges.push("Perfect Loop");
      }
    }

    // Badge 3: Quick Learner – Completed first 2 levels
    if (levelId === 2 && user.learningProgress.levelsCompleted.length >= 2) {
      const badgeId = "quick-learner";
      if (!user.badges.some((b) => b.id === badgeId)) {
        user.badges.push({
          id: badgeId,
          name: "Quick Learner",
          description: "Mastered the first two levels!",
          icon: "rocket-launch",
        });
        awardedBadges.push("Quick Learner");
      }
    }

    // Badge 4: Decision Master – Completed Level 3
    if (levelId === 3 && levelJustCompleted) {
      const badgeId = "decision-master";
      if (!user.badges.some((b) => b.id === badgeId)) {
        user.badges.push({
          id: badgeId,
          name: "Decision Master",
          description: "Mastered conditional logic in Level 3!",
          icon: "logic-gate",
        });
        awardedBadges.push("Decision Master");
      }
    }

    // Badge 5: Function Wizard – Completed Level 4
    if (levelId === 4 && levelJustCompleted) {
      const badgeId = "function-wizard";
      if (!user.badges.some((b) => b.id === badgeId)) {
        user.badges.push({
          id: badgeId,
          name: "Function Wizard",
          description: "Mastered functions & scope in Level 4!",
          icon: "function",
        });
        awardedBadges.push("Function Wizard");
      }
    }

    // Badge 6: Array Alchemist – Completed Level 5
    if (levelId === 5 && levelJustCompleted) {
      const badgeId = "array-alchemist";
      if (!user.badges.some((b) => b.id === badgeId)) {
        user.badges.push({
          id: badgeId,
          name: "Array Alchemist",
          description: "Conquered arrays & objects in Level 5!",
          icon: "array",
        });
        awardedBadges.push("Array Alchemist");
      }
    }

    // Badge 7: Ultimate Coder – Completed Final Boss (Level 6)
    if (levelId === 6 && levelJustCompleted) {
      const badgeId = "ultimate-coder";
      if (!user.badges.some((b) => b.id === badgeId)) {
        user.badges.push({
          id: badgeId,
          name: "Ultimate Coder",
          description: "Defeated the Final Boss – True CodeQuest Champion!",
          icon: "crown",
        });
        awardedBadges.push("Ultimate Coder");
      }
    }

    user.currentLevel = Math.max(user.currentLevel, levelId + 1);

    // Update leaderboard rank (simple: rank by XP descending)
    const allUsers = await User.find().sort({ xp: -1 });
    const rank =
      allUsers.findIndex((u) => u._id.toString() === user._id.toString()) + 1;
    user.leaderboardRank = rank;

    await user.save();

    res.json({
      message: "Progress updated",
      awardedBadges,
      user: {
        ...user.toObject(),
        highestScores: Object.fromEntries(
          [...user.scores.entries()].map(([k, v]) => [k, v.highScore]),
        ),
      },
    });
  } catch (err) {
    console.error("Progress update error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Mark Level as Opened (optional manual call)
app.post("/api/user/open-level", authMiddleware, async (req, res) => {
  try {
    const { levelId } = req.body;
    if (!levelId) return res.status(400).json({ message: "levelId required" });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.openedLevels.includes(levelId)) {
      user.openedLevels.push(levelId);
      await user.save();
      return res.json({
        message: `Level ${levelId} opened`,
        openedLevels: user.openedLevels,
      });
    }

    res.json({
      message: `Level ${levelId} already opened`,
      openedLevels: user.openedLevels,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Get Opened Levels
app.get("/api/user/opened-levels", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("openedLevels");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ openedLevels: user.openedLevels || [] });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Get Badges
app.get("/api/user/badges", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("badges");
    res.json({ badges: user.badges || [] });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Leaderboard (updated with XP-based ranking)
// GET /api/leaderboard
app.get("/api/leaderboard", async (req, res) => {
  try {
    const topUsers = await User.find()
      .sort({ "learningProgress.overallCompletion": -1 }) // Highest completion first
      .limit(10)
      .select("name learningProgress.overallCompletion badges");

    // Add rank manually
    const leaderboard = topUsers.map((user, index) => ({
      rank: index + 1,
      name: user.name,
      completion: Math.round(user.learningProgress?.overallCompletion || 0),
      badges: user.badges?.length || 0,
    }));

    res.json({ leaderboard });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

const PORT = 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
