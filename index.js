const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.imn2pwq.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


// Verify JWT token
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    //console.log(authHeader);
    if (!authHeader) {
        return res.status(401).send('unauthorized access');
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: "forbidden access" });
        }
        req.decoded = decoded;
        next();
    })
}


async function run() {
    try {

        const usersCollection = client.db("mobilicity").collection("users");


        // Verify Admin
        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        // Generate JWT token
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);

            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '10h' })
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' });
        })


        // Create User
        app.post('/users', async (req, res) => {

            const user = req.body;
            //console.log(booking);
            const query = {
                email: user.email,
                method: user.method
            }

            const alreadyRegistered = await usersCollection.find(query).toArray();

            if (user.method === "google" && alreadyRegistered.length) {
                const message = `Successfully login with google`;
                return res.send({ acknowledged: true, message })
            }
            else if (user.method !== "google" && alreadyRegistered.length) {
                const message = `Account already exists`;
                return res.send({ acknowledged: false, message })
            }

            const result = await usersCollection.insertOne(user);
            if (result.acknowledged) {
                const message = `Successfully registered`;
                return res.send({ acknowledged: true, message })
            }
        })

        // Checked Login user is admin
        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' });
        })


        // Get all buyers with verify admin and jwt token
        app.get('/admin/buyers', verifyJWT, verifyAdmin, async (req, res) => {
            const query = { role: "buyer" };
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        })

        // Delete a buyer with verify admin and jwt token
        app.delete('/admin/buyers/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            //console.log(id);
            const filter = { _id: ObjectId(id) };
            const result = await usersCollection.deleteOne(filter);
            res.send(result);
        })

        // Get all sellers with verify admin and jwt token
        app.get('/admin/sellers', verifyJWT, verifyAdmin, async (req, res) => {
            const query = { role: "seller" };
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        })

        app.put('/admin/sellers/:id', verifyJWT, verifyAdmin, async (req, res) => {

            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    verified: true
                }
            }

            const result = await usersCollection.updateOne(filter, updatedDoc, options);

            res.send(result);
        })

        // Delete a seller with verify admin and jwt token
        app.delete('/admin/sellers/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            //console.log(id);
            const filter = { _id: ObjectId(id) };
            const result = await usersCollection.deleteOne(filter);
            res.send(result);
        })



    } finally {
        //await client.close(); 
    }
}

run().catch(err => console.error(err));

app.get('/', async (req, res) => {
    res.send('Mobilicity server running');
})


app.listen(port, () => console.log(`Mobilicity running on ${port}`))