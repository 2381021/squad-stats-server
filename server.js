const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

// Import Models
const Game = require('./models/game');
const Team = require('./models/Team');

const app = express();

// --- CONFIGURATION ---
const MONGO_URI = process.env.MONGO_URI;
const API_KEY = process.env.GEMINI_API_KEY;

// Initialize AI
const genAI = new GoogleGenerativeAI(API_KEY);

// Middleware
app.use(cors());
app.use(express.json());

// --- DATABASE CONNECTION (Vercel Optimized) ---
// Checks if connection exists before connecting to prevent Vercel crashes
if (mongoose.connection.readyState === 0) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log("✅ Connected to MongoDB"))
        .catch(err => console.error("❌ MongoDB Connection Error:", err));
}

// ==========================================
//                 ROUTES
// ==========================================

// --- TEAM ROUTES ---
app.post('/api/teams', async (req, res) => {
    try {
        const { name } = req.body;
        const newTeam = new Team({ name, players: [] });
        const savedTeam = await newTeam.save();
        res.json(savedTeam);
    } catch (err) {
        res.status(500).json({ error: "Could not create team" });
    }
});

app.get('/api/teams', async (req, res) => {
    try {
        const teams = await Team.find();
        res.json(teams);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch teams" });
    }
});

app.get('/api/teams/:id', async (req, res) => {
    try {
        const team = await Team.findById(req.params.id);
        res.json(team);
    } catch (err) {
        res.status(404).json({ error: "Team not found" });
    }
});

app.post('/api/teams/:id/players', async (req, res) => {
    try {
        const { name, number } = req.body;
        const team = await Team.findById(req.params.id);
        if (!team) return res.status(404).json({ error: "Team not found" });

        team.players.push({ name, number });
        await team.save();
        res.json(team);
    } catch (err) {
        res.status(500).json({ error: "Could not add player" });
    }
});

// --- GAME ROUTES ---
app.post('/api/games', async (req, res) => {
    try {
        const { opponent, date, players, teamId } = req.body;
        const newGame = new Game({ teamId, opponent, date, players });
        const savedGame = await newGame.save();
        res.json({ success: true, gameId: savedGame._id });
    } catch (error) {
        res.status(500).json({ success: false, error: "Failed to create game" });
    }
});

app.get('/api/games/:id', async (req, res) => {
    try {
        const game = await Game.findById(req.params.id);
        res.json(game);
    } catch (error) {
        res.status(404).json({ error: "Game not found" });
    }
});

app.put('/api/games/:id', async (req, res) => {
    try {
        const { players } = req.body;
        const updatedGame = await Game.findByIdAndUpdate(req.params.id, { players: players }, { new: true });
        res.json({ success: true, game: updatedGame });
    } catch (error) {
        res.status(500).json({ error: "Failed to save stats" });
    }
});

app.delete('/api/games/:id', async (req, res) => {
    try {
        await Game.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Could not delete game" });
    }
});

app.get('/api/games/team/:teamId', async (req, res) => {
    try {
        const games = await Game.find({ teamId: req.params.teamId }).sort({ date: -1 });
        res.json(games);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch history" });
    }
});

// --- CRUD EXTENSIONS ---
app.delete('/api/teams/:id', async (req, res) => {
    try {
        const teamId = req.params.id;
        await Team.findByIdAndDelete(teamId);
        await Game.deleteMany({ teamId: teamId });
        res.json({ success: true, message: "Team and history deleted" });
    } catch (err) {
        res.status(500).json({ error: "Could not delete team" });
    }
});

app.put('/api/teams/:id', async (req, res) => {
    try {
        const { name } = req.body;
        const updatedTeam = await Team.findByIdAndUpdate(req.params.id, { name }, { new: true });
        res.json(updatedTeam);
    } catch (err) {
        res.status(500).json({ error: "Could not update team" });
    }
});

app.delete('/api/teams/:teamId/players/:playerId', async (req, res) => {
    try {
        const { teamId, playerId } = req.params;
        const team = await Team.findById(teamId);
        team.players.pull({ _id: playerId }); 
        await team.save();
        res.json(team);
    } catch (err) {
        res.status(500).json({ error: "Could not delete player" });
    }
});

app.put('/api/teams/:teamId/players/:playerId', async (req, res) => {
    try {
        const { teamId, playerId } = req.params;
        const { name, number } = req.body;
        await Team.updateOne(
            { _id: teamId, "players._id": playerId },
            { $set: { "players.$.name": name, "players.$.number": number } }
        );
        const updatedTeam = await Team.findById(teamId);
        res.json(updatedTeam);
    } catch (err) {
        res.status(500).json({ error: "Could not update player" });
    }
});

// --- ANALYTICS ROUTES ---
app.get('/api/stats/:teamId/player/:name', async (req, res) => {
    try {
        const { teamId, name } = req.params;
        const games = await Game.find({ teamId, "players.name": name }).sort({ date: -1 });

        if (games.length === 0) return res.status(404).json({ error: "No games found" });

        const gameLogs = games.map(game => {
            const p = game.players.find(p => p.name === name);
            return { opponent: game.opponent, date: game.date, ...p.toObject() };
        });

        const sum = (key) => gameLogs.reduce((acc, curr) => acc + (curr[key] || 0), 0);
        const totalGames = gameLogs.length;
        
        const averages = {
            points: (sum('points') / totalGames).toFixed(1),
            rebounds: (sum('rebounds') / totalGames).toFixed(1),
            assists: (sum('assists') / totalGames).toFixed(1),
            steals: (sum('steals') / totalGames).toFixed(1),
            blocks: (sum('blocks') / totalGames).toFixed(1),
            minutes: (sum('minutes') / totalGames).toFixed(1)
        };

        res.json({ name, totalGames, averages, history: gameLogs });
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

// --- AI ROUTE (Moved UP so it works!) ---
app.post('/api/ai/analyze', async (req, res) => {
    try {
        const { teamId, userQuestion } = req.body;
        const team = await Team.findById(teamId);
        const games = await Game.find({ teamId: teamId });

        if (!team) return res.status(404).json({ error: "Team not found" });

        let rosterSummary = team.players.map(p => p.name).join(", ");
        
        let playerStats = {};
        games.forEach(game => {
            game.players.forEach(p => {
                if (!playerStats[p.name]) playerStats[p.name] = { gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 };
                playerStats[p.name].gp++;
                playerStats[p.name].pts += p.points;
                playerStats[p.name].reb += p.rebounds;
                playerStats[p.name].ast += p.assists;
                playerStats[p.name].stl += p.steals;
                playerStats[p.name].blk += p.blocks;
            });
        });

        const statsString = JSON.stringify(playerStats);
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        
        const prompt = `
            You are an expert Basketball Assistant Coach. 
            Team: ${team.name}
            Roster: ${rosterSummary}
            Stats JSON: ${statsString}
            Question: "${userQuestion}"
            Answer professionally.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        res.json({ reply: response.text() });

    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ error: "AI Unavailable" });
    }
});

// --- DEFAULT ROUTE (Health Check) ---
app.get('/', (req, res) => {
    res.send('Squad Stats Backend is Running!');
});

// ==========================================
//           VERCEL EXPORT
// ==========================================
// This is required for Vercel to run Express
if (process.env.VERCEL) {
    module.exports = app;
} else {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}