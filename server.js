const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// Import Models
const Game = require('./models/game');
const Team = require('./models/Team');

const app = express();

const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config(); // Load environment variables
const genAI = new GoogleGenerativeAI("AIzaSyAg0TEQelgYyzii50tgLW-iITZLFcs6HHU");

// Middleware
app.use(cors());
app.use(express.json());

// --- DATABASE CONNECTION ---
mongoose.connect('mongodb://127.0.0.1:27017/squad-stats')
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));


// ==========================================
//               TEAM ROUTES
// ==========================================

// 1. Create a new Team
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

// 2. Get All Teams (For the selection screen)
app.get('/api/teams', async (req, res) => {
    try {
        const teams = await Team.find();
        res.json(teams);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch teams" });
    }
});

// 3. Get a specific Team (with roster)
app.get('/api/teams/:id', async (req, res) => {
    try {
        const team = await Team.findById(req.params.id);
        res.json(team);
    } catch (err) {
        res.status(404).json({ error: "Team not found" });
    }
});

// 4. Add a Player to a Team Roster
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


// ==========================================
//               GAME ROUTES
// ==========================================

// 1. Create a New Game
app.post('/api/games', async (req, res) => {
    try {
        // We now extract teamId here so we can link the game to the team
        const { opponent, date, players, teamId } = req.body;

        const newGame = new Game({
            teamId, // Save the link to the team
            opponent,
            date,
            players
        });

        const savedGame = await newGame.save();
        
        console.log(`Game vs ${opponent} created with ID: ${savedGame._id}`);
        res.json({ success: true, gameId: savedGame._id });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: "Failed to create game" });
    }
});

// 2. Get Game Data (For the Tracker)
app.get('/api/games/:id', async (req, res) => {
    try {
        const game = await Game.findById(req.params.id);
        res.json(game);
    } catch (error) {
        res.status(404).json({ error: "Game not found" });
    }
});

// 3. Update Game Stats (The "Save" Button)
app.put('/api/games/:id', async (req, res) => {
    try {
        const { players } = req.body;
        
        const updatedGame = await Game.findByIdAndUpdate(
            req.params.id, 
            { players: players },
            { new: true }
        );

        if (!updatedGame) {
            return res.status(404).json({ error: "Game not found" });
        }

        console.log(`Stats updated for game: ${updatedGame.opponent}`);
        res.json({ success: true, game: updatedGame });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to save stats" });
    }
});


// ==========================================
//             ANALYTICS ROUTES
// ==========================================

// Get Player Stats (Scoped to a specific Team)
app.get('/api/stats/:teamId/player/:name', async (req, res) => {
    try {
        const { teamId, name } = req.params;

        // Find games matching BOTH the Team ID and the Player Name
        const games = await Game.find({ 
            teamId: teamId, 
            "players.name": name 
        }).sort({ date: -1 });

        if (games.length === 0) {
            return res.status(404).json({ error: "No games found for this player in this team." });
        }

        // Extract logs from the matching games
        const gameLogs = games.map(game => {
            const p = game.players.find(p => p.name === name);
            return {
                opponent: game.opponent,
                date: game.date,
                ...p.toObject()
            };
        });

        // Helper function to sum up a specific stat key
        const sum = (key) => gameLogs.reduce((acc, curr) => acc + (curr[key] || 0), 0);
        const totalGames = gameLogs.length;
        
        // Calculate Averages
        const averages = {
            points: (sum('points') / totalGames).toFixed(1),
            rebounds: (sum('rebounds') / totalGames).toFixed(1),
            assists: (sum('assists') / totalGames).toFixed(1),
            steals: (sum('steals') / totalGames).toFixed(1),
            blocks: (sum('blocks') / totalGames).toFixed(1),
            minutes: (sum('minutes') / totalGames).toFixed(1)
        };

        res.json({ 
            name, 
            totalGames, 
            averages, 
            history: gameLogs 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});

// ==========================================
//             CRUD EXTENSIONS
// ==========================================

// --- TEAM MANAGEMENT ---

// DELETE TEAM (And optionally their games)
app.delete('/api/teams/:id', async (req, res) => {
    try {
        const teamId = req.params.id;
        
        // 1. Delete the Team
        await Team.findByIdAndDelete(teamId);
        
        // 2. (Optional) Delete all games belonging to this team to keep DB clean
        await Game.deleteMany({ teamId: teamId });

        res.json({ success: true, message: "Team and history deleted" });
    } catch (err) {
        res.status(500).json({ error: "Could not delete team" });
    }
});

// EDIT TEAM NAME
app.put('/api/teams/:id', async (req, res) => {
    try {
        const { name } = req.body;
        const updatedTeam = await Team.findByIdAndUpdate(
            req.params.id, 
            { name }, 
            { new: true }
        );
        res.json(updatedTeam);
    } catch (err) {
        res.status(500).json({ error: "Could not update team" });
    }
});


// --- PLAYER MANAGEMENT ---

// DELETE PLAYER from Roster
app.delete('/api/teams/:teamId/players/:playerId', async (req, res) => {
    try {
        const { teamId, playerId } = req.params;
        
        const team = await Team.findById(teamId);
        // "pull" removes an item from an array that matches the ID
        team.players.pull({ _id: playerId }); 
        await team.save();

        res.json(team);
    } catch (err) {
        res.status(500).json({ error: "Could not delete player" });
    }
});

// EDIT PLAYER (Name/Number)
app.put('/api/teams/:teamId/players/:playerId', async (req, res) => {
    try {
        const { teamId, playerId } = req.params;
        const { name, number } = req.body;

        // Update a specific item in the array using array filters ($)
        // This is advanced MongoDB syntax!
        await Team.updateOne(
            { _id: teamId, "players._id": playerId },
            { 
                $set: { 
                    "players.$.name": name,
                    "players.$.number": number
                }
            }
        );

        const updatedTeam = await Team.findById(teamId);
        res.json(updatedTeam);
    } catch (err) {
        res.status(500).json({ error: "Could not update player" });
    }
});


// --- GAME MANAGEMENT ---

// DELETE GAME
app.delete('/api/games/:id', async (req, res) => {
    try {
        await Game.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Could not delete game" });
    }
});

// GET GAME HISTORY (For a specific team)
// We need this so you can see a list of games to delete!
app.get('/api/games/team/:teamId', async (req, res) => {
    try {
        const games = await Game.find({ teamId: req.params.teamId }).sort({ date: -1 });
        res.json(games);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch history" });
    }
});

// --- SERVER START ---
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

app.post('/api/ai/analyze', async (req, res) => {
    try {
        const { teamId, userQuestion } = req.body;

        // 1. Fetch the Team and ALL their Games
        const team = await Team.findById(teamId);
        const games = await Game.find({ teamId: teamId });

        if (!team) return res.status(404).json({ error: "Team not found" });

        // 2. Aggregate Stats Programmatically
        // We create a summary string to "teach" the AI about the team
        let rosterSummary = team.players.map(p => p.name).join(", ");
        
        // Calculate raw totals to feed the AI
        let playerStats = {};
        games.forEach(game => {
            game.players.forEach(p => {
                if (!playerStats[p.name]) {
                    playerStats[p.name] = { gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 };
                }
                playerStats[p.name].gp++;
                playerStats[p.name].pts += p.points;
                playerStats[p.name].reb += p.rebounds;
                playerStats[p.name].ast += p.assists;
                playerStats[p.name].stl += p.steals;
                playerStats[p.name].blk += p.blocks;
            });
        });

        const statsString = JSON.stringify(playerStats);

        // 3. Construct the Prompt
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        
        const prompt = `
            You are an expert Basketball Assistant Coach. 
            Here is the raw data for the team "${team.name}":
            Roster: ${rosterSummary}
            
            Current Season Stats (JSON format): 
            ${statsString}

            Based ONLY on this data, please answer this question from the head coach: 
            "${userQuestion}"

            Keep the answer concise, professional, and highlight specific numbers to back up your claims.
        `;

        // 4. Generate Response
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        res.json({ reply: text });

    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ error: "The AI Coach is currently unavailable." });
    }
});