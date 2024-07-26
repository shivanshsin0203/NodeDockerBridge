const mongoose = require("mongoose");
// Schema for user
const userSchema = new mongoose.Schema({
    email: String,
    projectId: String,
    framework: String,
    isActive: Boolean,
    lastModified: { type: Date, default: Date.now }
});

const User = mongoose.model("user", userSchema);
module.exports = User;