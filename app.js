const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const passport = require('./config/passport');
const flash = require('connect-flash');
const Sequelize = require('sequelize');
const bcrypt = require('bcrypt');
const exphbs = require('express-handlebars');
const moment = require('moment');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

require('dotenv').config();
dotenv.config();
const app = express();

// Conexão com o Banco de Dados
const sequelize = require('./config/database');
const User = require('./models/user');
const Event = require('./models/event');
const eventRouter = require('./routes/eventRoutes');

// Associações de modelos
User.associate({ Event });
Event.associate({ User });

// Configurações do Handlebars
const hbs = exphbs.create({
    helpers: {
        formatDate: (date) => moment(date).format('DD/MM/YYYY, HH:mm:ss'),
        diffInDays: (date) => {
            const eventDate = moment(date);
            const today = moment().startOf('day'); // Considera apenas a data
            return eventDate.diff(today, 'days');
        },
        lt: (a, b) => a < b,
        canCancel: (eventDate) => {
            const today = moment().startOf('day'); // Considera apenas a data
            const eventMoment = moment(eventDate).startOf('day'); // Fazendo a comparação de datas
            return eventMoment.isAfter(today) || eventMoment.isSame(today.add(1, 'days'), 'day'); // Permite cancelar se for amanhã ou em dias futuros
        }
    },
    runtimeOptions: {
        allowProtoPropertiesByDefault: true,
        allowProtoMethodsByDefault: true
    }
});


app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: 'seu-segredo', resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// Função para verificar se o usuário é admin
function isAdmin(req, res, next) {
    if (req.user && req.user.isAdmin) {
        return next();
    }
    req.flash('error_msg', 'Acesso restrito.');
    res.redirect('/profile');
}

// Middleware para garantir que o usuário está autenticado
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

// Rota para a página inicial (GET)
app.get('/', (req, res) => {
    res.render('primeira_pagina');
});

// Rota para a página de cadastro (GET)
app.get('/cadastrar-form', (req, res) => {
    res.render('cadastrar', { error: req.flash('error_msg') });
});

// Rota para a página de agendamento (GET)
app.get('/agendamento', isAuthenticated, (req, res) => {
    res.render('agendamento');
});

// Rota para a página de calendário (somente para admin)
app.get('/calendar', isAdmin, async (req, res) => {
    try {
        const events = await Event.findAll({
            include: [{ model: User, as: 'user' }]
        });

        // Formata os eventos para o formato esperado pelo FullCalendar
        const formattedEvents = events.map(event => {
            // Valida se event.start é válido
            if (!event.start) {
                console.error(`Start date is missing for event ID: ${event.id}`);
                return null; // Ignora o evento se a data de início estiver ausente
            }

            // Converte o start e end para ISO
            const startDate = new Date(event.start);
            if (isNaN(startDate.getTime())) {
                console.error(`Invalid start date for event ID ${event.id}: ${event.start}`);
                return null; // Ignora o evento se a data de início for inválida
            }

            const endDate = event.end ? new Date(event.end) : null;
            if (endDate && isNaN(endDate.getTime())) {
                console.error(`Invalid end date for event ID ${event.id}: ${event.end}`);
                return null; // Ignora o evento se a data de término for inválida
            }

            return {
                id: event.id,
                title: event.title,
                start: startDate.toISOString(),
                end: endDate ? endDate.toISOString() : null,
                extendedProps: {
                    user: event.user ? event.user.nome : 'Desconhecido',
                    telefone: event.user ? event.user.telefone : 'N/A',
                    email: event.user ? event.user.email : 'N/A'
                }
            };
        }).filter(event => event !== null); // Remove eventos inválidos

        res.render('calendar', { events: formattedEvents });
    } catch (error) {
        console.error('Erro ao buscar eventos:', error);
        res.status(500).send('Erro ao carregar o calendário');
    }
});

// Rota para o cadastro (POST)
app.post('/cadastrar', async (req, res) => {
    const { nome, telefone, email, senha } = req.body;

    try {
        const userExists = await User.findOne({ where: { email } });
        if (userExists) {
            req.flash('error_msg', 'Email já registrado!');
            return res.redirect('/cadastrar-form');
        }

        const hashedPassword = await bcrypt.hash(senha, 10);
        await User.create({ nome, telefone, email, senha: hashedPassword });

        res.redirect('/login');
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
app.post('/login', passport.authenticate('local', {
    failureRedirect: '/login',
    failureFlash: true
}), (req, res) => {
    req.session.user = {
        id: req.user.id,
        username: req.user.nome,
        isAdmin: req.user.isAdmin
    };
    res.redirect(req.user.isAdmin ? '/calendar' : '/agendamento');
});

// Rota de logout
app.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/');
    });
});

// Adicionar o router de eventos
app.use('/', eventRouter);

// Rota para editar evento
app.post('/edit-event/:id', async (req, res) => {
    const { title, start } = req.body; // Extraindo título e start do corpo da requisição
    const eventId = req.params.id;

    console.log('Atualizando evento:', { eventId, title, start }); // Verifique os dados que estão sendo recebidos

    try {
        await Event.update({ title, start }, { where: { id: eventId } });
        res.status(200).send('Evento atualizado com sucesso');
    } catch (error) {
        console.error('Erro ao atualizar evento:', error);
        res.status(500).send('Erro ao atualizar evento');
    }
});
app.get('/edit-event/:id', async (req, res) => {
    const eventId = req.params.id;

    try {
        const event = await Event.findByPk(eventId);
        if (event) {
            res.render('edit-event', { event }); // Renderize uma página de edição
        } else {
            res.status(404).send('Evento não encontrado');
        }
    } catch (error) {
        console.error('Erro ao buscar evento:', error);
        res.status(500).send('Erro ao buscar evento');
    }
});

// Rota de perfil
app.get('/profile', isAuthenticated, async (req, res) => {
    const userId = req.user.id;

    try {
        // Busca todos os eventos do usuário
        const userEvents = await Event.findAll({ where: { userId } });

        // Verificar se os eventos possuem o campo professionalName
        const eventsWithProfessionalNames = userEvents.map(event => ({
            ...event.dataValues, // Inclui todos os dados do evento
            professionalName: event.professionalName || 'Profissional não informado' // Verifica se existe professionalName
        }));

        res.render('profile', {
            events: eventsWithProfessionalNames,
            username: req.user.nome, // Corrige para pegar o nome do usuário autenticado
            success_msg: req.flash('success_msg'),
            error_msg: req.flash('error_msg')
        });
    } catch (error) {
        console.error('Erro ao buscar eventos do usuário:', error);
        res.status(500).send('Erro ao buscar eventos');
    }
});


// Rota para deletar evento do usuário
app.post('/delete-event-user/:id', async (req, res) => {
    const eventId = req.params.id;

    try {
        await Event.destroy({ where: { id: eventId } });
        req.flash('success_msg', 'Sessão cancelada com sucesso!');
        res.redirect('/profile');
    } catch (error) {
        console.error('Erro ao deletar evento:', error);
        req.flash('error_msg', 'Erro ao cancelar sessão.');
        res.redirect('/profile');
    }
});
app.delete('/delete-event/:id', async (req, res) => {
    const eventId = req.params.id;

    try {
        await Event.destroy({ where: { id: eventId } });
        res.status(204).send(); // Retorna uma resposta sem conteúdo
    } catch (error) {
        console.error('Erro ao deletar evento:', error);
        res.status(500).send('Erro ao cancelar sessão.');
    }
});


// Rota para listar eventos
app.get('/events', async (req, res) => {
    try {
        const events = await Event.findAll({
            include: [{ model: User, as: 'user', attributes: ['id', 'nome', 'telefone', 'email'] }]
        });

        const formattedEvents = events.map(event => {
            // Combine a data e a hora
            const dataHora = new Date(`${event.start}T${event.hora}`);
            
            // Verifique se a data/hora é válida
            if (isNaN(dataHora.getTime())) {
                console.error(`Data/hora inválida para o evento ${event.id}: ${event.start}T${event.hora}`);
                return null; // Ou trate o erro como preferir
            }

            return {
                id: event.id,
                title: event.title,
                start: dataHora.toISOString(), // Converte para ISO 8601
                hora: event.hora, // Certifique-se de que isso está correto
                professionalName: event.professionalName || 'Profissional não especificado',
                user: {
                    id: event.user.id,
                    nome: event.user.nome,
                    telefone: event.user.telefone,
                    email: event.user.email
                }
            };
        }).filter(event => event !== null); // Remove eventos com data/hora inválida

        res.json(formattedEvents);
    } catch (error) {
        console.error('Erro ao buscar eventos:', error);
        res.status(500).json({ error: 'Erro ao buscar eventos' });
    }
});



// Rota para detalhes do evento
app.get("/event-details/:id", async (req, res) => {
    try {
        const event = await Event.findOne({
            where: { id: req.params.id },
            include: [{ model: User, as: 'user' }]
        });

        if (!event) return res.status(404).json({ error: "Evento não encontrado" });

        res.json(event);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro ao buscar evento" });
    }
});

// Rota para verificar horários disponíveis por data e profissional
app.post('/check-availability', async (req, res) => {
    const { date, professionalName } = req.body;

    console.log('Dados recebidos:', req.body); // Verifique o que está sendo recebido

    if (!professionalName) {
        return res.status(400).json({ error: 'Nome do profissional não fornecido' });
    }

    try {
        const events = await Event.findAll({
            where: {
                professionalName: professionalName,
                start: date
            }
        });

        res.json(events);
    } catch (error) {
        console.error('Erro ao buscar eventos:', error);
        res.status(500).json({ error: 'Erro ao buscar eventos' });
    }
});
// Rota para selecionar horário e criar o evento
app.post('/select-time', isAuthenticated, async (req, res) => {
    const {  professionalName, date, time } = req.body;

    try {
        // Lógica para criar um novo evento com os dados do horário selecionado
        await Event.create({
            professionalName,
            start: moment(`${date} ${time}`).toISOString(),
            title: 'Serviço de Manicure', // Altere conforme necessário
            userId: req.user.id // ID do usuário autenticado
        });

        req.flash('success_msg', 'Agendamento realizado com sucesso!');
        res.redirect('/profile');
    } catch (error) {
        console.error('Erro ao criar evento:', error);
        req.flash('error_msg', 'Erro ao realizar agendamento.');
        res.redirect('/agendamento');
    }
});

// Rota para página de esqueci minha senha (GET)
app.get('/forgot-password', (req, res) => {
    res.render('forgot-password'); // Certifique-se de ter um arquivo Handlebars 'forgot-password.handlebars'
});

// Rota para processar a solicitação de redefinição de senha (POST)
app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ where: { email } });
        if (!user) {
            req.flash('error_msg', 'Email não encontrado!');
            return res.redirect('/forgot-password');
        }

        // Gerar token JWT para redefinição de senha
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        // Link para redefinir a senha
        const resetLink = `http://localhost:3000/reset-password?token=${token}`;

        // Configurar transporte do nodemailer
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              type: 'OAuth2',
              user: 'seu-email@gmail.com',
              clientId: 'CLIENT_ID',
              clientSecret: 'CLIENT_SECRET',
              refreshToken: 'REFRESH_TOKEN',
              accessToken: 'ACCESS_TOKEN',
            },
          });

        // Configuração do email
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Redefinição de senha',
            html: `<p>Clique <a href="${resetLink}">aqui</a> para redefinir sua senha.</p>`
        };

        // Enviar o email
        await transporter.sendMail(mailOptions);

        req.flash('success_msg', 'Email de redefinição de senha enviado com sucesso!');
        res.redirect('/login');
    } catch (error) {
        console.error('Erro ao processar a solicitação de redefinição de senha:', error);
        res.status(500).send('Erro ao processar a solicitação de redefinição de senha');
    }
});
// Inicializa o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
