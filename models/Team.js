const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
    name: String, // e.g., "UNAI Eagles"
    players: [{
        name: String,
        number: Number,
        position: String
    }],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Team', teamSchema);