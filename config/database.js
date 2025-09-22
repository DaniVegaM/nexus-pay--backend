import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config({path: '.env'});

const db = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    logging: false, //Disable logs
    define: {
        timestamps: true //CreatedAt, UpdatedAt
    },
    pool: {
        max: 5,
        min: 0,
        acquire: 30000, //Max 30 seconds to connect
        idle: 10000 //Max inactvity time
    }
});

export default db;