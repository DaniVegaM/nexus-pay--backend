import express from 'express';
import dotenv from 'dotenv';

import apiRoutes from './router/apiRoutes.js';
import db from './config/database.js';

dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS (opcional, para desarrollo)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

//Sync DB
try {
    await db.authenticate(); //Async function
    await db.sync();
    console.log("Connection to DB established");
} catch (error) {
    console.log(error);
}

// Ruta base
app.get('/', (req, res) => {
  res.json({ 
    message: 'Project Nexus Pay API',
    endpoints: [
      'GET /api/member/ - Get all members',
    ]
  });
});

app.use('/api', apiRoutes);

// Start Server
const port = process.env.PORT || 4000;

const startServer = async () => {
  app.listen(port, () => {
    console.log(`Servidor ejecutándose en http://localhost:${port}`);
  });
};

startServer();