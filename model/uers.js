const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
    },
    age: {
      type: Number,
      required: [true, "Age is required"],
      min: [5, "Age must be at least 5"],
      max: [120, "Age cannot exceed 120"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      // Note: Hash this before saving (use bcrypt in your auth route)
    },
    currentLevel: {
      type: Number,
      default: 1,
      min: 1,
    },
    learningProgress: {
      overallCompletion: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      levelsCompleted: [
        {
          type: Number,
          min: 1,
        },
      ],
    },
    badges: [
      {
        id: {
          type: String,
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        description: {
          type: String,
          required: true,
        },
        earnedDate: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    leaderboardRank: {
      type: Number,
      default: 0,
      min: 0,
    },
    scores: {
      type: Map,
      of: new mongoose.Schema(
        {
          highScore: {
            type: Number,
            default: 0,
            min: 0,
          },
          attempts: {
            type: Number,
            default: 0,
            min: 0,
          },
          lastAttempt: {
            type: Date,
            default: null,
          },
        },
        { _id: false },
      ),
    },
  },
  {
    timestamps: true, // automatically adds createdAt & updatedAt
  },
);

// Optional: Index para mas mabilis ang pag-query sa email at leaderboardRank
userSchema.index({ email: 1 });
userSchema.index({ leaderboardRank: -1 }); // para sa sorting ng leaderboard

module.exports = mongoose.model("User", userSchema);
