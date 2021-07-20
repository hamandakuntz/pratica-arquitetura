import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import connection from "./database.js";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/sign-up", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.sendStatus(400);
    }

    const user = await signUp(name, email, password);

    if(user === null) {
      return res.sendStatus(409);
    }

    res.sendStatus(201);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

async function signUp(name, email, password){
  const existingUserWithGivenEmail = await getUser(email);

    if (existingUserWithGivenEmail.rows[0]) {
      return null;
    }

    const hashedPassword = bcrypt.hashSync(password, 12);

    return await createUser(name, email, hashedPassword);   
}

async function getUser(email) {
  const existingUserWithGivenEmail = await connection.query(
    `SELECT * FROM "users" WHERE "email"=$1`,
    [email]
  );
  return existingUserWithGivenEmail;
}

async function createUser(name, email, hashedPassword) {
  const result = await connection.query(
    `INSERT INTO "users" ("name", "email", "password") VALUES ($1, $2, $3) RETURNING *`,
    [name, email, hashedPassword]
  );
  return result.rows[0];
}

app.post("/sign-in", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.sendStatus(400);
    }

   const response = await signIn(email, password);
   if(response === null) {
     return res.sendStatus(401);
   }  

   res.send({
    response
  });

  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

async function signIn(email, password) {
  const user = await getUser(email);

    if (!user.rows[0] || !bcrypt.compareSync(password, user.rows[0].password)) {
      return null;
    }

    const token = jwt.sign({
      id: user.rows[0].id
    }, process.env.JWT_SECRET);

    return token;
}

app.post("/financial-events", async (req, res) => {
  try {
    const authorization = req.headers.authorization || "";
    const token = authorization.split('Bearer ')[1];

    if (!token) {
      return res.sendStatus(401);
    }

    let user;

    try {
      user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.sendStatus(401);
    }

    const { value, type } = req.body;

    if (!value || !type) {
      return res.sendStatus(400);
    }

    if (!['INCOME', 'OUTCOME'].includes(type)) {
      return res.sendStatus(400);
    }

    if (value < 0) {
      return res.sendStatus(400);
    }

    await insertFinancialEvent(user, value, type);
    

    res.sendStatus(201);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

async function insertFinancialEvent(user, value, type) {
  await connection.query(
    `INSERT INTO "financialEvents" ("userId", "value", "type") VALUES ($1, $2, $3)`,
    [user.id, value, type]
  );
}

app.get("/financial-events", async (req, res) => {
  try {
    const authorization = req.headers.authorization || "";
    const token = authorization.split('Bearer ')[1];

    if (!token) {
      return res.sendStatus(401);
    }

    let user;

    try {
      user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.sendStatus(401);
    }

    const events = await getFinancialEvents(user);

    res.send(events.rows);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

async function getFinancialEvents(user){
  const events = await connection.query(
    `SELECT * FROM "financialEvents" WHERE "userId"=$1 ORDER BY "id" DESC`,
    [user.id]
  );
  return events;
}

app.get("/financial-events/sum", async (req, res) => {
  try {
    const authorization = req.headers.authorization || "";
    const token = authorization.split('Bearer ')[1];

    if (!token) {
      return res.sendStatus(401);
    }

    let user;

    try {
      user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.sendStatus(401);
    }

    const events = await getFinancialEvents(user);


    const sum = events.rows.reduce((total, event) => event.type === 'INCOME' ? total + event.value : total - event.value, 0);

    res.send({ sum });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

export default app;
