const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' }, // <--- ADD THIS
    opponent: String,
    date: Date,
    players: [{
        name: String,
        number: Number,
        points: { type: Number, default: 0 },
        rebounds: { type: Number, default: 0 },
        assists: { type: Number, default: 0 },
        steals: { type: Number, default: 0 },
        blocks: { type: Number, default: 0 },
        minutes: { type: Number, default: 0 },
        secondsPlayed: { type: Number, default: 0 }
    }],
    isFinished: { type: Boolean, default: false }
});

module.exports = mongoose.model('Game', gameSchema);