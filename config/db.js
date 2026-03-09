// backend/config/db.js
const mongoose = require("mongoose");

// MongoDB connection function
const connectDB = async () => {
  try {
    // Hardcoded MongoDB URI (palitan mo ito ng totoong connection string mo)
    // Halimbawa: mongodb+srv://username:password@cluster0.abcde.mongodb.net/learning-app?retryWrites=true&w=majority
    const MONGO_URI =
      "mongodb+srv://codequestUser:Bagsic2030010@codequest.nd4m0pc.mongodb.net/?appName=codequest";

    const conn = await mongoose.connect(MONGO_URI, {
      //   useNewUrlParser: true,
      //   useUnifiedTopology: true,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`.cyan.underline);
  } catch (error) {
    console.error(`Error: ${error.message}`.red.underline.bold);
    // I-exit ang process kung hindi makakonekta
    process.exit(1);
  }
};

module.exports = connectDB;
