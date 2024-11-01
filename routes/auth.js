const express  = require('express');
const router   = express.Router();
const passport = require('passport');
const bcrypt   = require('bcrypt');
const User     = require('./models/user');  // Ajuste o caminho se necessário
const flash    = require('connect-flash');

  // Rota para o login (GET)
router.get('/login', (req, res) => {
      // Verificar se o usuário já está logado
    if (req.session.userId) {
        return res.redirect('/agendamento');  // Redireciona para a página de agendamento
    }
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
      // Verificar se o usuário já está logado
    if (req.session.userId) {
        return res.redirect('/calendario');  // Redireciona para a página do calendário
    }
    res.render('cadastrar', { error: req.flash('error_msg') });
});


  // Rota para o cadastro (POST)// Rota para o login (POST)
router.post('/login', async (req, res) => {
      // Verificar se o usuário já está logado
    if (req.session.userId) {
        return res.redirect('/agendamento');  // Redireciona para a página de agendamento
    }

    const { email, senha } = req.body;

    try {
          // Encontrar o usuário pelo email
        const user = await User.findOne({ where: { email: email } });
        if (!user) {
            return res.render('login', { error_msg: 'Email não encontrado!' });  // Renderiza a página de login com a mensagem de erro
        }

          // Verificar a senha
        const match = await bcrypt.compare(senha, user.senha);
        if (!match) {
            return res.render('login', { error_msg: 'Senha incorreta!' });  // Renderiza a página de login com a mensagem de erro
        }

          // Autenticação bem-sucedida
        req.session.userId = user.id;
        res.redirect('/agendamento');
    } catch (error) {
        console.error('Erro ao autenticar o usuário:', error);
        res.send('Erro ao autenticar o usuário');
    }
});



  // Rota de logout
router.get('/logout', (req, res) => {
    req.logout();
    res.redirect('/login');
});

module.exports = router;
