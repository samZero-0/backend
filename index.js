const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();    
const app = express();
const port = process.env.PORT || 5000;

// CORS Setup
app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        'https://taskify-68caf.web.app'
    ], 
    credentials: true,
}));

app.use(express.json());

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.k2nj4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// Create an HTTP server for Express
const server = http.createServer(app);

// WebSocket Server
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
    console.log("New WebSocket connection");

    ws.on("message", (message) => {
        console.log("Received:", message.toString());
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message.toString());
            }
        });
    });

    ws.on("close", () => {
        console.log("WebSocket connection closed");
    });
});

async function run() {
    try {
        await client.connect();
        const database = client.db("Taskify");
        const userCollection = database.collection("users");
        const taskCollection = database.collection("tasks");

        // REST API Routes
        app.get("/", (req, res) => res.send("Backend connected"));

        app.post('/users', async (req, res) => {
            const newUser = req.body;
            const existingUser = await userCollection.findOne({ email: newUser.email });
            if (existingUser) {
                res.status(200).send({ message: "User already exists", user: existingUser });
            } else {
                const result = await userCollection.insertOne(newUser);
                res.status(201).send({ message: "User created successfully", user: result.ops[0] });
            }
        });

        app.get('/users', async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        app.post('/tasks', async (req, res) => {
            const newTask = req.body;
            const result = await taskCollection.insertOne(newTask);
            res.send(result);
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: "NEW_TASK", task: newTask }));
                }
            });
        });

        app.get('/tasks', async (req, res) => {
            const result = await taskCollection.find().sort({ order: 1 }).toArray();
            res.send(result);
        });

        app.put('/tasks/:id', async (req, res) => {
            const id = req.params.id;
            const updatedTask = req.body;
        
            console.log("Updating task with ID:", id); // Log the ID
            console.log("Updated task data:", updatedTask); // Log the task data
        
            try {
                const filter = { _id: new ObjectId(id) };
                const update = { $set: { ...updatedTask, lastModified: Date.now() } };
        
                const result = await taskCollection.updateOne(filter, update);
                console.log("Update result:", result); // Log the update result
        
                res.send(result);
        
                // Notify WebSocket clients
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: "UPDATE_TASK", task: updatedTask }));
                    }
                });
            } catch (error) {
                console.error("Error updating task:", error);
                res.status(500).send({ error: "Failed to update task" });
            }
        });
        

        app.delete('/tasks/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await taskCollection.deleteOne(query);
            res.send(result);

            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: "DELETE_TASK", taskId: id }));
                }
            });
        });

    } catch (error) {
        console.error("Error:", error);
    }
}
run().catch(console.dir);

// Start HTTP & WebSocket server
server.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});
