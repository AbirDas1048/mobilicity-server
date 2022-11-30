const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);

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
        const categoriesCollection = client.db("mobilicity").collection("categories");
        const productsCollection = client.db("mobilicity").collection("products");
        const bookingsCollection = client.db("mobilicity").collection("bookings");
        const paymentsCollection = client.db("mobilicity").collection("payments");
        const reportsCollection = client.db("mobilicity").collection("reports");

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

        // Verify Seller
        const verifySeller = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'seller') {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        // Verify Buyer
        const verifyBuyer = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'buyer') {
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

        // Checked Login user is seller
        app.get('/users/seller/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            res.send({ isSeller: user?.role === 'seller' });
        })

        // Checked Login user is buyer
        app.get('/users/buyer/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            res.send({ isBuyer: user?.role === 'buyer' });
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

        // Get all categories
        app.get('/categories', async (req, res) => {
            const query = {};
            const result = await categoriesCollection.find(query).toArray();
            res.send(result);
        })

        app.get('/advertisedProducts', async (req, res) => {

            const query = {
                $and: [
                    { advertise: { $eq: true } },
                    { availability: { $eq: true } }
                ]
            }

            //const result = await productsCollection.find(query).toArray();
            const result2 = await productsCollection.aggregate([
                { $match: query },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'email',
                        foreignField: 'email',
                        as: 'seller'
                    }
                },

            ]).toArray();
            res.send(result2);
        })

        app.get('/categories/:id', async (req, res) => {
            const id = req.params.id;
            const query = {
                categoryId: id,
                availability: true
            };

            const query2 = {
                _id: ObjectId(id)
            };

            //const result = await productsCollection.find(query).toArray();

            const products = await productsCollection.aggregate([
                { $match: query },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'email',
                        foreignField: 'email',
                        as: 'seller'
                    }
                },

            ]).toArray();

            const category = await categoriesCollection.findOne(query2);

            res.send({ products, category });
        })

        app.post('/buyer/bookings', verifyJWT, verifyBuyer, async (req, res) => {
            const booking = req.body;

            const query = {
                buyerEmail: booking.buyerEmail,
                productId: booking.productId
            }

            const alreadyBooked = await bookingsCollection.find(query).toArray();

            if (alreadyBooked.length) {
                const message = `You already booked this product`;
                return res.send({ acknowledged: false, message });
            }
            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        })

        app.post('/buyer/reportToAdmin', verifyJWT, verifyBuyer, async (req, res) => {
            const report = req.body;

            const query = {
                buyerEmail: report.buyerEmail,
                productId: report.productId
            }

            const alreadyReported = await reportsCollection.find(query).toArray();

            if (alreadyReported.length) {
                const message = `You already report this product`;
                return res.send({ acknowledged: false, message });
            }
            const result = await reportsCollection.insertOne(report);
            res.send(result);
        })

        app.get('/buyer/bookingsCheck', async (req, res) => {
            const booking = req.query;
            //console.log(booking);
            const query = {
                buyerEmail: booking.buyerEmail,
                productId: booking.productId
            }

            // console.log(query);
            const alreadyBooked = await bookingsCollection.findOne(query);
            if (alreadyBooked) {
                res.send({ acknowledged: true });
            }
            else {
                res.send({ acknowledged: false });
            }

        })

        app.get('/buyer/reportsCheck', async (req, res) => {
            const report = req.query;
            //console.log(booking);
            const query = {
                buyerEmail: report.buyerEmail,
                productId: report.productId
            }

            // console.log(query);
            const alreadyReported = await reportsCollection.findOne(query);
            if (alreadyReported) {
                res.send({ acknowledged: true });
            }
            else {
                res.send({ acknowledged: false });
            }

        })

        app.get('/buyers/orders', verifyJWT, verifyBuyer, async (req, res) => {
            const email = req.query.email;
            //console.log(booking);
            const query = {
                buyerEmail: email
            }
            // 
            const result = await bookingsCollection.aggregate([
                { $match: query },
                {
                    "$project": {
                        "productId": {
                            "$toObjectId": "$productId"
                        },
                        productName: 1,
                        price: 1,
                        paid: 1
                    }
                },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'productId',
                        foreignField: '_id',
                        as: 'productInfo'
                    }
                },


            ]).toArray();
            res.send(result);

        })

        app.get('/buyer/productPayment/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await bookingsCollection.findOne(query);
            res.send(result);
        })

        app.post('/create-payment-intent', async (req, res) => {
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                "payment_method_types": [
                    "card"
                ]
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });

        })

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);
            const id = payment.bookingId;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }

            const productId = payment.productId;
            const filter2 = { _id: ObjectId(productId) };
            const updatedDoc2 = {
                $set: {
                    availability: false
                }
            }

            const buyerEmail = payment.buyerEmail;

            const deleteQuery = {
                $and: [
                    { buyerEmail: { $ne: buyerEmail } },
                    { productId: { $eq: productId } }
                ]
            };


            const deletedResult = await bookingsCollection.deleteMany(deleteQuery);

            const updatedResult = await bookingsCollection.updateOne(filter, updatedDoc);
            const updatedResult2 = await productsCollection.updateOne(filter2, updatedDoc2);
            res.send(result);
        })

        app.post('/sellers/products', verifyJWT, verifySeller, async (req, res) => {
            const product = req.body;
            const result = await productsCollection.insertOne(product);
            res.send(result);
        })

        app.get('/sellers/products', verifyJWT, verifySeller, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;

            if (email !== decodedEmail) {
                return res.status(403).send({ message: "forbidden access" });
            }
            //console.log(decodedEmail);
            const query = {
                email: email
            };

            const products = await productsCollection.find(query).toArray();
            res.send(products);
        })

        app.put('/sellers/products/:id', verifyJWT, verifySeller, async (req, res) => {

            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    advertise: true
                }
            }

            const result = await productsCollection.updateOne(filter, updatedDoc);

            res.send(result);
        })

        app.delete('/sellers/products/:id', verifyJWT, verifySeller, async (req, res) => {
            const id = req.params.id;
            //console.log(id);
            const filter = { _id: ObjectId(id) };
            const result = await productsCollection.deleteOne(filter);
            res.send(result);
        })

        // app.get('/updatePrice', async (req, res) => {
        //     const filter = {};
        //     const options = { upsert: true };
        //     const updatedDoc = {
        //         $set: {
        //             originalPrice: "3000",
        //             postedOn: "Nov 28, 2022"
        //         }
        //     }

        //     const result = await productsCollection.updateMany(filter, updatedDoc, options);

        //     res.send(result);

        // })


    } finally {
        //await client.close(); 
    }
}

run().catch(err => console.error(err));

app.get('/', async (req, res) => {
    res.send('Mobilicity server running');
})


app.listen(port, () => console.log(`Mobilicity running on ${port}`))