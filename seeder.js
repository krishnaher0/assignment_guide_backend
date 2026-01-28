import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.js';
import bcrypt from 'bcryptjs';
import connectDB from './config/db.js';

dotenv.config();

connectDB();

const importData = async () => {
    try {
        await User.deleteMany();

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('123456', salt);
        const adminPassword = await bcrypt.hash('admin123', salt);

        const users = [
            {
                name: 'Admin User',
                email: 'sabin@gmail.com',
                password: adminPassword,
                role: 'admin',
                isEmailVerified: true,
                authMethod: 'manual',
            },
        ];

        await User.insertMany(users);

        console.log('Data Imported!');
        process.exit();
    } catch (error) {
        console.error(`${error}`);
        process.exit(1);
    }
};

importData();
