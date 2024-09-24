const { DataTypes } = require('sequelize'); 
const sequelize = require('../config/database');
const User = require('./user');

const Event = sequelize.define('Event', {
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    start: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    hora: {
        type: DataTypes.STRING, // Horário como string, por exemplo, '09:00'
        allowNull: false
    },
    professionalName: { // Alterado para armazenar o nome do profissional
        type: DataTypes.STRING,
        allowNull: false
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    }
}, {
    tableName: 'events',
    timestamps: false
});

Event.associate = (models) => {
    Event.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
};

module.exports = Event;

