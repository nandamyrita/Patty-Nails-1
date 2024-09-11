const db = require("./banco");

const Cadastro = db.sequelize.define("cadastro", {
    nome: {
        type: db.Sequelize.STRING
    },
    telefone: {
        type: db.Sequelize.STRING
    },
    email: {
        type: db.Sequelize.STRING
    },
    senha: {
        type: db.Sequelize.STRING
    }
});

module.exports = Cadastro;

// Cadastro.sync({ force: true }).then(() => {
//     console.log('Tabela sincronizada!');
// }).catch(error => {
//     console.error('Erro ao sincronizar a tabela:', error);
// });
