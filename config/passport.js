const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const User = require('../models/user'); // Ajuste o caminho conforme necessário
const bcrypt = require('bcrypt');

// Configuração da estratégia local
passport.use(new LocalStrategy({
    usernameField: 'email', // Campo que será usado como nome de usuário
    passwordField: 'senha'   // Campo da senha
}, async (email, senha, done) => {
    try {
        const user = await User.findOne({ where: { email } });
        if (!user) {
            return done(null, false, { message: 'Email não encontrado!' });
        }

        const match = await bcrypt.compare(senha, user.senha);
        if (!match) {
            return done(null, false, { message: 'Senha incorreta!' });
        }

        return done(null, user); // Autenticação bem-sucedida
    } catch (error) {
        return done(error);
    }
}));

// Serialização do usuário
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Desserialização do usuário
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findByPk(id);
        done(null, user);
    } catch (error) {
        done(error);
    }
});

module.exports = passport;
