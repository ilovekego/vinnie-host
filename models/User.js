const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    },
    logging: false
});

const User = sequelize.define('User', {
    displayName: { type: DataTypes.STRING, allowNull: true },
    googleId: { type: DataTypes.STRING, allowNull: true, unique: true },
    githubId: { type: DataTypes.STRING, allowNull: true, unique: true },
    githubAccessToken: { type: DataTypes.STRING, allowNull: true },
    avatar: { type: DataTypes.TEXT, allowNull: true },
    activeUnit: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
    hasDeployed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    plan: { type: DataTypes.STRING, allowNull: false, defaultValue: 'free' },
    deployLimit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 2 },
    deployedApps: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    officialBotDeployed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    
    // --- DARAJA M-PESA BILLING COLUMNS ---
    planExpiresAt: { type: DataTypes.DATE, allowNull: true },
    mpesaReceiptNumber: { type: DataTypes.STRING, allowNull: true },
    pendingCheckoutId: { type: DataTypes.STRING, allowNull: true }
});

module.exports = { User, sequelize };
