const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const session = require('express-session');
const Cadastro = require('./modules/post');
const bcrypt = require('bcrypt');
const flash = require('connect-flash'); // Importar connect-flash
const handlebars = require('express-handlebars').engine;

// Configuração do body-parser
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Configuração do express-session
app.use(session({
    secret: 'seu-segredo', // Altere para uma chave secreta segura
    resave: false,
    saveUninitialized: true
}));

// Configuração do connect-flash
app.use(flash());

// Configuração do template engine
app.engine('handlebars', handlebars({ defaultLayout: 'main' }));
app.set('view engine', 'handlebars');

// Rota para a página inicial (GET)
app.get('/', (req, res) => {
    res.render('primeira_pagina'); // Renderiza a página inicial
});

// Rota para a página de cadastro (GET)
app.get('/cadastrar-form', (req, res) => {
    res.render('cadastrar', { error: req.flash('error_msg') });
});

// Rota para a página de agendamento (GET)
app.get('/agendamento', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login'); // Redirecionar para login se o usuário não estiver autenticado
    }
    res.render('agendamento'); // Renderiza a página de agendamento
});

// Rota para o cadastro (POST)
app.post('/cadastrar', async (req, res) => {
    const { nome, telefone, email, senha } = req.body;

    try {
        // Verificar se o email já está registrado
        const userExists = await Cadastro.findOne({ where: { email: email } });
        if (userExists) {
            req.flash('error_msg', 'Email já registrado!');
            return res.redirect('/cadastrar-form');
        }

        // Hash da senha
        const hashedPassword = await bcrypt.hash(senha, 10);

        // Criar novo usuário
        await Cadastro.create({
            nome: nome,
            telefone: telefone,
            email: email,
            senha: hashedPassword
        });

        console.log('Dados Cadastrados com sucesso!');
        res.redirect('/login'); // Redirecionar para a página de login após o cadastro
    } catch (error) {
        console.error('Erro ao gravar os dados na entidade:', error);
        res.send('Erro ao gravar os dados na entidade');
    }
});

// Rota para a página de login (GET)
app.get('/login', (req, res) => {
    res.render('login', { error: req.flash('error_msg') });
});

// Rota para o login (POST)
app.post('/login', async (req, res) => {
    const { email, senha } = req.body;

    try {
        // Encontrar o usuário pelo email
        const user = await Cadastro.findOne({ where: { email: email } });
        if (!user) {
            req.flash('error_msg', 'Email não encontrado!');
            return res.redirect('/login'); // Redireciona com mensagem de erro
        }

        // Verificar a senha
        const match = await bcrypt.compare(senha, user.senha);
        if (!match) {
            req.flash('error_msg', 'Senha incorreta!');
            return res.redirect('/login'); // Redireciona com mensagem de erro
        }

        // Autenticação bem-sucedida
        req.session.userId = user.id;
        res.redirect('/agendamento'); // Redirecionar para a página de agendamento após o login bem-sucedido
    } catch (error) {
        console.error('Erro ao autenticar o usuário:', error);
        res.send('Erro ao autenticar o usuário');
    }
});

// Iniciar o servidor
app.listen(3010, () => {
    console.log('Servidor Ativo!');
});
