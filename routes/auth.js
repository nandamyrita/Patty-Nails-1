const express = require('express');
const router = express.Router();
const passport = require('passport');
const bcrypt = require('bcrypt');
const User = require('./models/user'); // Ajuste o caminho se necessário
const flash = require('connect-flash');

// Rota para a página de login (GET)
router.get('/login', (req, res) => {
    res.render('login', { error: req.flash('error_msg') });
});

// Rota para o login (POST)
router.post('/login', async (req, res) => {
    const { email, senha } = req.body;

    try {
        // Encontrar o usuário pelo email
        const user = await User.findOne({ where: { email: email } });
        if (!user) {
            req.flash('error_msg', 'Email não encontrado!');
            return res.redirect('/login');
        }

        // Verificar a senha
        const match = await bcrypt.compare(senha, user.senha);
        if (!match) {
            req.flash('error_msg', 'Senha incorreta!');
            return res.redirect('/login');
        }

        // Autenticação bem-sucedida
        req.session.userId = user.id;
        res.redirect('/agendamento');
    } catch (error) {
        console.error('Erro ao autenticar o usuário:', error);
        res.send('Erro ao autenticar o usuário');
    }
});

// Rota para a página de cadastro (GET)
router.get('/cadastrar-form', (req, res) => {
    res.render('cadastrar', { error: req.flash('error_msg') });
});

// Rota para o cadastro (POST)
router.post('/cadastrar', async (req, res) => {
    const { nome, telefone, email, senha } = req.body;

    try {
        // Verificar se o email já está registrado
        const userExists = await User.findOne({ where: { email: email } });
        if (userExists) {
            req.flash('error_msg', 'Email já registrado!');
            return res.redirect('/cadastrar-form');
        }

        // Hash da senha
        const hashedPassword = await bcrypt.hash(senha, 10);

        // Criar novo usuário
        await User.create({
            nome: nome,
            telefone: telefone,
            email: email,
            senha: hashedPassword
        });

        console.log('Dados Cadastrados com sucesso!');
        res.redirect('/login');
    } catch (error) {
        console.error('Erro ao gravar os dados na entidade:', error);
        res.send('Erro ao gravar os dados na entidade');
    }
});

// Rota de logout
router.get('/logout', (req, res) => {
    req.logout();
    res.redirect('/login');
});

module.exports = router;
