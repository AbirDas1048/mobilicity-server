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


        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);

            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' });
        })


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

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' });

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