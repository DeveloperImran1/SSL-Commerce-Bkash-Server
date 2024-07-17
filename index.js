const express = require("express");
const bcrypt = require("bcryptjs")
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
require('dotenv').config();
const jwt = require('jsonwebtoken');

// middleware
app.use(cors({
    origin: ["http://localhost:5173", "https://bkash-project-server.vercel.app"],
    credentials: true
}));
app.use(express.json())


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mr9mnat.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {

        //  token related kaj
        app.post("/jwt", async (req, res) => {
            const user = req.body;
            console.log("Token er user", user)
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })

            res.send({ token })
        })

        // middleware
        const verifyToken = (req, res, next) => {
            // console.log("Inside verify token: --", req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: "unauthorizedaccess" });
            }

            const token = req.headers.authorization.split(" ")[1];
            // console.log("token holo", token)
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: "unauthorizedaccess" });
                }
                req.decoded = decoded;
                next()
            })

        }



        const usersCollection = client.db("Bkash").collection("userCollection");


        app.get("/users", async (req, res) => {
            const users = usersCollection.find()
            const result = await users.toArray();
            res.send(result)
        })

        app.post('/users', async (req, res) => {
            const userInfo = req.body;

            // checking already user exist
            const isExistEmail = await usersCollection.findOne({ email: userInfo.email })
            if (isExistEmail) {
                return res.send("This Email Already have an acount")
            }
            const isExistPhone = await usersCollection.findOne({ phone: userInfo.phone })
            if (isExistPhone) {
                return res.send("This Phone Already have an acount")
            }

            // generate hased pin
            const salt = await bcrypt.genSalt(10);
            const hasedPin = await bcrypt.hash(userInfo?.pin, salt)
            const updateInfo = { ...userInfo, pin: hasedPin }

            const result = await usersCollection.insertOne(updateInfo);
            res.send(result)
        })


        // login korar somoi check
        app.post('/login', async (req, res) => {
            const data = req.body;
            console.log(data)

            const isExistPhone = await usersCollection.findOne({ phone: data?.phone })
            const isExistEmail = await usersCollection.findOne({ email: data?.phone })

            const user = isExistEmail || isExistPhone;
            console.log(user)

            if (user) {

                const isMatch = await bcrypt.compare(data.pin, user.pin);
                console.log(isMatch)

                return res.send({ status: 200 })
            }

            if (!user) {
                return res.send({ status: 404 })
            }
        })


        // get individual userInfo
        app.get('/user/:phone', async (req, res) => {
            const phone = req.params.phone;
            console.log(phone)
            const result = await usersCollection.findOne({ $or: [{ email: phone }, { phone: phone }] })
            res.send(result)
        })


        // user send money korbe jekono email er acount a
        app.post('/sendmoney', verifyToken, async (req, res) => {
            const userData = req.body;
            console.log(userData)

            // reciver email valid kina checking
            const reciverIsExist = await usersCollection.findOne({ phone: userData?.phone })
            console.log(reciverIsExist?.balance, "jake pathabo tar data")
            if (!reciverIsExist) {
                return res.send({ status: 404, data: "user not found" })
            }

            // sender er balance theke taka minus korte hobe
            const senderData = await usersCollection.findOne({ email: userData?.senderEmail })
            console.log("sender er data update korob", senderData)

            const isPinMatched = await bcrypt.compare(userData.pin, senderData.pin);
            console.log("Pin matched", isPinMatched)

            const totalAmount = parseInt(parseInt(userData?.balance) >= 100 ? parseInt(userData?.balance) + 5 : userData?.balance);
            console.log("total amount", totalAmount)
            const updatedDocSender = {
                $set: {
                    balance: senderData?.balance - totalAmount,
                    transition: [{ type: "sendMoney", taka: totalAmount, reciverPhone: userData?.phone }]
                }
            }
            const resultSender = await usersCollection.updateOne({ email: userData?.senderEmail }, updatedDocSender)

            //reciver er phone a taka send or amount plus
            const updatedDoc = {
                $set: {
                    balance: reciverIsExist?.balance + parseInt(userData?.balance)
                }
            }
            const result = await usersCollection.updateOne({ phone: userData?.phone }, updatedDoc)

            return res.send(result)
        })

        // user Cashout korbe jekono email er acount a
        app.post('/cashout', verifyToken, async (req, res) => {
            const userData = req.body;
            console.log(userData)

            // agent email valid kina checking
            const reciverIsExist = await usersCollection.findOne({ phone: userData?.phone })
            console.log(reciverIsExist, "jake pathabo tar data")
            if (!reciverIsExist || reciverIsExist?.role !== "agent") {
                return res.send({ status: 404, data: "Agent not found" })
            }

            // sender er balance theke taka minus korte hobe
            const senderData = await usersCollection.findOne({ email: userData?.senderEmail })
            console.log("sender er data update korob", senderData)

            const isPinMatched = await bcrypt.compare(userData.pin, senderData.pin);
            console.log("Pin matched", isPinMatched)



            //reciver er phone a taka recive korar request korbo.
            const updatedCashOutReq = reciverIsExist?.transition ? [...reciverIsExist?.transition, { type: "cashout", taka: userData?.balance, senderEmail: userData?.senderEmail, status: "pending" }] : [{ type: "cashout", taka: userData?.balance, senderEmail: userData?.senderEmail, status: "pending" }]
            const updatedDoc = {
                $set: {
                    transition: updatedCashOutReq
                }
            }
            const result = await usersCollection.updateOne({ phone: userData?.phone }, updatedDoc)



            return res.send(result)

        })

        // user Cashout korbe jekono email er acount a
        app.post('/cashin', verifyToken, async (req, res) => {
            const userData = req.body;
            console.log(userData)

            // agent email valid kina checking
            const reciverIsExist = await usersCollection.findOne({ phone: userData?.phone })
            console.log(reciverIsExist, "jake pathabo tar data")
            if (!reciverIsExist || reciverIsExist?.role !== "agent") {
                return res.send({ status: 404, data: "Agent not found" })
            }

            // sender er data get korobo
            const senderData = await usersCollection.findOne({ email: userData?.senderEmail })
            console.log("sender er data ", senderData)

            const isPinMatched = await bcrypt.compare(userData.pin, senderData.pin);
            console.log("Pin matched", isPinMatched)



            //reciver er phone a taka recive korar request korbo.
       
            const updatedCashInReq = reciverIsExist?.transition ? [...reciverIsExist?.transition, { type: "cashin", taka: userData?.balance, senderEmail: userData?.senderEmail, status: "pending" }] : [{ type: "cashin", taka: userData?.balance, senderEmail: userData?.senderEmail, status: "pending" }]
            const updatedDoc = {
                $set: {
                    transition: updatedCashInReq
                }
            }

            const result = await usersCollection.updateOne({ phone: userData?.phone }, updatedDoc)



            return res.send(result)

        })

        // agent er action a status changed and taka transfer korbo
        // app.post("/agentAction", verifyToken, async(req, res)=> {
        //     const data = req.body;
        //     console.log(data)

        //     const myData = await usersCollection.findOne({phone: data?.myPhone})
        //     const agentBalance = myData?.balance + parseInt(data?.transitionInfo?.taka)
        //     const updatedDocAgent = {
        //         $set: {
        //             balance: agentBalance,
        //             "transition.$[elem].status": data?.action
        //         }
        //     }
        //     const result = await usersCollection.updateOne({phone: data?.myPhone}, updatedDocAgent)
        //     res.send(result)
        // })

        app.post("/agentAction", verifyToken, async (req, res) => {
            const data = req.body;
            console.log(data);
        
            const myData = await usersCollection.findOne({ phone: data?.myPhone });
            if (!myData) {
                return res.status(404).send("User not found");
            }
        
            const agentBalance = myData.balance + parseInt(data?.transitionInfo?.taka);
        
            // Update the status of the specific transaction within the transition array
            const updatedDocAgent = {
                $set: {
                    balance: agentBalance,
                    "transition.$[elem].status": data?.action
                }
            };
        
            // Array filter to match the specific transition object to update
            const arrayFilters = [{ "elem.type": data?.transitionInfo?.type, "elem.senderEmail": data?.transitionInfo?.senderEmail }];
        
            const result = await usersCollection.updateOne(
                { phone: data?.myPhone },
                updatedDocAgent,
                { arrayFilters }
            );
        
            res.send(result);
        });

        

        // With admin
        // user k active korbo and bonus dibo
        app.put('/active', async(req, res)=> {
            const data = req.body;
            console.log(data)

            const user = await usersCollection.findOne({_id: new ObjectId(data?._id)})
            console.log( "aita holo matching user" , user)
            const updateBalance = user?.bonus ? user?.balance : user?.balance + 40;
            const updatedDoc = {
                $set: {
                    status: "active",
                    bonus: true,
                    balance: updateBalance
                }
            }
            const result = await usersCollection.updateOne({_id: new ObjectId(data?._id)}, updatedDoc)
            res.send(result)
        })


        // user k disable korbo 
        app.put('/disable', async(req, res)=> {
            const data = req.body;
            console.log(data)

            const user = await usersCollection.findOne({_id: new ObjectId(data?._id)})
            console.log( "aita holo matching user" , user)
            const updatedDoc = {
                $set: {
                    status: "pending",
                  
                }
            }
            const result = await usersCollection.updateOne({_id: new ObjectId(data?._id)}, updatedDoc)
            res.send(result)
        })



        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

    }
}
run().catch(console.dir);





app.get('/', (rq, res) => {
    res.send("server is running")
})

app.listen(port, () => {
    console.log("Bkash server is running in port", port)
})




