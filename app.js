const ejs = require('ejs');
const fs = require('fs');
const express    = require('express');
const session    = require('express-session');
const bodyParser = require('body-parser');
const path       = require('path');
const passport   = require('./config/passport');
const flash      = require('connect-flash');
const Sequelize  = require('sequelize');
const bcrypt     = require('bcrypt');
const exphbs     = require('express-handlebars');
const handlebars = require('handlebars');
const moment     = require('moment');
const nodemailer = require('nodemailer');
const jwt        = require('jsonwebtoken');
const dotenv     = require('dotenv');

require('dotenv').config();
dotenv.config();
const app = express();

    // Conexão com o Banco de Dados
const sequelize   = require('./config/database');
const User        = require('./models/user');
const Event       = require('./models/event');
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
            const today     = moment().startOf('day');  // Considera apenas a data
            return eventDate.diff(today, 'days');
        },
        lt       : (a, b) => a < b,
        canCancel: (eventDate) => {
            const  today = moment().startOf('day');                                                // Considera apenas a data
            const  eventMoment = moment(eventDate).startOf('day');                                 // Fazendo a comparação de datas
            return eventMoment.isAfter(today) || eventMoment.isSame(today.add(1, 'days'), 'day');  // Permite cancelar se for amanhã ou em dias futuros
        }
    },
    runtimeOptions: {
        allowProtoPropertiesByDefault: true,
        allowProtoMethodsByDefault   : true
    }
});

app.use(express.static(__dirname + '/views'));
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
    res.redirect('/login?error=' + encodeURIComponent('Acesso restrito.'));
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
                return null;  // Ignora o evento se a data de início estiver ausente
            }

                // Converte o start e end para ISO
            const startDate = new Date(event.start);
            if (isNaN(startDate.getTime())) {
                console.error(`Invalid start date for event ID ${event.id}: ${event.start}`);
                return null;  // Ignora o evento se a data de início for inválida
            }

            const endDate = event.end ? new Date(event.end) : null;
            if (endDate && isNaN(endDate.getTime())) {
                console.error(`Invalid end date for event ID ${event.id}: ${event.end}`);
                return null;  // Ignora o evento se a data de término for inválida
            }

            return {
                id           : event.id,
                title        : event.title,
                start        : startDate.toISOString(),
                end          : endDate ? endDate.toISOString(): null,
                extendedProps: {
                    user    : event.user ? event.user.nome    : 'Desconhecido',
                    telefone: event.user ? event.user.telefone: 'N/A',
                    email   : event.user ? event.user.email   : 'N/A'
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
      // Verifica se o usuário já está logado
    if (req.isAuthenticated()) {
        return res.redirect(req.user.isAdmin ? '/calendar' : '/agendamento');  // Redireciona para a página correspondente
    }

    const { nome, telefone, email, senha } = req.body;

    try {
        const userExists = await User.findOne({ where: { email } });
        if (userExists) {
              // Redireciona com mensagem de erro
            return res.redirect(`/cadastrar-form?error=${encodeURIComponent('Email já registrado!')}`);
        }

        const hashedPassword = await bcrypt.hash(senha, 10);
        await User.create({ nome, telefone, email, senha: hashedPassword });

          // Redireciona com mensagem de sucesso
        return res.redirect(`/login?success=${encodeURIComponent('Cadastro realizado com sucesso!')}`);

    } catch (error) {
        console.error('Erro ao gravar os dados na entidade:', error);
          // Redireciona com mensagem de erro
        return res.redirect(`/cadastrar-form?error=${encodeURIComponent('Erro ao gravar os dados na entidade.')}`);
    }
});



    // Rota para a página de cadastro (GET)
app.get('/cadastrar-form', (req, res) => {
        // Verifica se o usuário já está logado
    if (req.isAuthenticated()) {
        return res.redirect(req.user.isAdmin ? '/calendar' : '/agendamento');  // Redireciona para a página correspondente
    }
    res.render('cadastrar', { error: req.flash('error_msg') });
});


    // Rota para o login (POST)
  app.post('/login', async (req, res, next) => {
    const { email, senha } = req.body;

      // Verifique se o email existe
    const user = await User.findOne({ where: { email } });
    if (!user) {
          // Se o usuário não existir, redirecione com mensagem de erro
        return res.redirect(`/login?error=${encodeURIComponent('Email não encontrado!')}`);
    }

      // Use passport.authenticate para verificar a senha
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error('Erro durante a autenticação:', err);
            return next(err);
        }
        if (!user) {
              // Se a senha estiver incorreta, redirecione com mensagem de erro
            return res.redirect(`/login?error=${encodeURIComponent('Senha incorreta!')}`);
        }
        req.logIn(user, (err) => {
            if (err) {
                console.error('Erro ao logar:', err);
                return next(err);
            }
            req.session.user = {
                id      : user.id,
                username: user.nome,
                isAdmin : user.isAdmin
            };
              // Direciona para a página correta
            return res.redirect(user.isAdmin ? '/calendar' : '/agendamento');
        });
    })(req, res, next);
});


    // Rota para a página de login (GET)
app.get('/login', (req, res) => {
        // Verifica se o usuário já está logado
    if (req.isAuthenticated()) {
        return res.redirect(req.user.isAdmin ? '/calendar' : '/agendamento');  // Redireciona para a página correspondente
    }
    res.render('login', { error: req.flash('error_msg') });
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
        const { title, start, professionalName: newProfessionalName } = req.body; // Captura o novo nome do profissional
        const eventId = req.params.id;
    
        console.log('Atualizando evento:', { eventId, title, start, newProfessionalName }); // Log da nova informação
    
        try {
            const event = await Event.findByPk(eventId, { include: [{ model: User, as: 'user' }] });
            if (!event) {
                return res.status(404).send('Evento não encontrado');
            }
    
            const oldTitle = event.title;
            const oldStart = event.start;
            const oldHour = event.hora;
            const oldProfessionalName = event.professionalName; // Captura o nome do profissional antigo
            const user = event.user;
    
            // Atualiza o evento com os novos dados
            await Event.update(
                { title, start, professionalName: newProfessionalName }, // Atualiza o nome do profissional
                { where: { id: eventId } }
            );
    
            // Ler e compilar o template Handlebars
            const templatePath = path.join(__dirname, 'views', 'emails', 'event-update.handlebars');
            const templateSource = fs.readFileSync(templatePath, 'utf8');
            const template = handlebars.compile(templateSource);
    
            // Extrair propriedades do usuário
            const userData = {
                id: user.id,
                nome: user.nome,
                telefone: user.telefone,
                email: user.email
            };
    
            // Dados a serem enviados ao template
            const emailHtml = template({
                user: userData,
                oldTitle,
                oldStart,
                oldHour,
                oldProfessionalName, // Nome do profissional antigo
                newProfessionalName,  // Nome do profissional novo
                title,
                start,
                formatDate: (date) => moment(date).format('DD/MM/YYYY'),
                formatTime: (date) => moment(date).format('HH:mm'),
            });
    
            // Configurações do e-mail
            const mailOptions = {
                from: 'projetopi.agendamento@gmail.com',
                to: user.email,
                subject: 'Atualização de Agendamento',
                html: emailHtml,
                attachments: [
                    {
                        filename: 'logoPattyNails.png',
                        path: path.join(__dirname, '/views/img/logo1.png'),
                        cid: 'logoPattyNails'
                    }
                ]
            };
    
            await transporter.sendMail(mailOptions);
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
            res.render('edit-event', { event });  // Renderize uma página de edição
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
                                                   // Busca os dados do usuário autenticado
        const user = await User.findByPk(userId);  // Supondo que você tenha um modelo User

            // Busca todos os eventos do usuário
        const userEvents = await Event.findAll({ where: { userId } });

            // Verificar se os eventos possuem o campo professionalName
        const eventsWithProfessionalNames = userEvents.map(event => ({
            ...event.dataValues,                                                          // Inclui todos os dados do evento
            professionalName    : event.professionalName || 'Profissional não informado'  // Verifica se existe professionalName
        }));

        res.render('profile', {
            events: eventsWithProfessionalNames,
            user  : { // Passa os dados do usuário para o template
                nome    : user.nome,
                email   : user.email,
                telefone: user.telefone
            },
            username   : req.user.nome,              // Correção para pegar o nome do usuário autenticado
            success_msg: req.flash('success_msg'),
            error_msg  : req.flash('error_msg')
        });
    } catch (error) {
        console.error('Erro ao buscar dados do usuário:', error);
        res.status(500).send('Erro ao buscar dados do usuário');
    }
});


    // Rota para deletar evento do usuário
    app.delete('/delete-event/:id', async (req, res) => {
        const eventId = req.params.id;
    
        try {
            // Busca o evento
            const event = await Event.findOne({ where: { id: eventId } });
            if (!event) {
                return res.status(404).send('Evento não encontrado.');
            }
    
            // Busca o usuário associado ao evento
            const user = await User.findOne({ where: { id: event.userId } });
            if (!user) {
                return res.status(404).send('Usuário não encontrado.');
            }
    
            // Deleta o evento
            await Event.destroy({ where: { id: eventId } });
    
            // Carregar e compilar o template Handlebars para o usuário
            const userTemplatePath = path.join(__dirname, 'views', 'emails', 'delete-event-user.handlebars');
            const userTemplateSource = fs.readFileSync(userTemplatePath, 'utf8');
            const userTemplate = handlebars.compile(userTemplateSource);
    
            // Dados para o email do usuário
            const userEmailHtml = userTemplate({
                user: { nome: user.nome },
                title: event.title,
                start: event.start,
                formatDate: (date) => moment(date).format('DD/MM/YYYY'),
                formatTime: (date) => moment(date).format('HH:mm'),
            });
    
            // Configurações do e-mail com a imagem embutida
            const mailOptionsUser = {
                from: 'projetopi.agendamento@gmail.com',
                to: user.email,
                subject: 'Cancelamento de Sessão pelo Administrador',
                html: userEmailHtml,
                attachments: [
                    {
                        filename: 'logoPattyNails.png', // Nome do arquivo
                        path: path.join(__dirname, '/views/img/logo1.png'), // Caminho para o arquivo de imagem
                        cid: 'logoPattyNails' // Usado como referência para a tag <img src="cid:logoPattyNails">
                    }
                ]
            };
    
            // Envia o email para o usuário
            await transporter.sendMail(mailOptionsUser);
    
            res.status(204).send();  // Retorna uma resposta sem conteúdo
        } catch (error) {
            console.error('Erro ao deletar evento:', error);
            res.status(500).send('Erro ao cancelar sessão.');
        }
    });
    

  //Rota para cancelamento do Usuario
  // Rota para cancelamento do Usuario
  app.post('/delete-event-user/:id', async (req, res) => {
    const eventId = req.params.id;

    try {
        // Busca o evento
        const event = await Event.findOne({ where: { id: eventId } });
        if (!event) {
            return res.status(404).json({ error: 'Evento não encontrado.' });
        }

        // Busca o usuário associado ao evento
        const user = await User.findOne({ where: { id: event.userId } });
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        // Deleta o evento
        await Event.destroy({ where: { id: eventId } });

        // Carregar e compilar o template Handlebars para o usuário
        const userTemplatePath = path.join(__dirname, 'views', 'emails', 'delete-event-user.handlebars');
        const userTemplateSource = fs.readFileSync(userTemplatePath, 'utf8');
        const userTemplate = handlebars.compile(userTemplateSource);

        // Dados para o email do usuário
        const userEmailHtml = userTemplate({
            user: { nome: user.nome },
            title: event.title,
            start: event.start,
            formatDate: (date) => moment(date).format('DD/MM/YYYY'),
            formatTime: (date) => moment(date).format('HH:mm'),
        });

        // Configuração do email para o usuário com anexo
        const mailOptionsUser = {
            from: 'projetopi.agendamento@gmail.com',
            to: user.email,
            subject: 'Cancelamento de Sessão',
            html: userEmailHtml,
            attachments: [
                {
                    filename: 'logoPattyNails.png',
                    path: path.join(__dirname, '/views/img/logo1.png'),
                    cid: 'logoPattyNails'
                }
            ]
        };
        await transporter.sendMail(mailOptionsUser);

        // Carregar e compilar o template Handlebars para os administradores
        const adminTemplatePath = path.join(__dirname, 'views', 'emails', 'delete-event-admin.handlebars');
        const adminTemplateSource = fs.readFileSync(adminTemplatePath, 'utf8');
        const adminTemplate = handlebars.compile(adminTemplateSource);

        // Dados para o email do administrador
        const adminEmailHtml = adminTemplate({
            admin: { nome: user.nome }, // Exemplo de dados do usuário cancelador
            user: { nome: user.nome },
            title: event.title,
            start: event.start,
            formatDate: (date) => moment(date).format('DD/MM/YYYY'),
            formatTime: (date) => moment(date).format('HH:mm'),
        });

        // Envia email para todos os administradores com o anexo
        const admins = await User.findAll({ where: { isAdmin: true } });
        for (const admin of admins) {
            const mailOptionsAdmin = {
                from: 'projetopi.agendamento@gmail.com',
                to: admin.email,
                subject: 'Sessão Cancelada pelo Usuário',
                html: adminEmailHtml,
                attachments: [
                    {
                        filename: 'logoPattyNails.png',
                        path: path.join(__dirname, '/views/img/logo1.png'),
                        cid: 'logoPattyNails'
                    }
                ]
            };
            await transporter.sendMail(mailOptionsAdmin);
        }

        // Redireciona para a página de perfil com a mensagem de sucesso
        res.redirect('/profile?status=success&message=Sessão cancelada com sucesso!');
    } catch (error) {
        console.error('Erro ao deletar evento:', error);
        res.status(500).json({ error: 'Erro ao cancelar sessão.' });
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
                return null;  // Ou trate o erro como preferir
            }

            return {
                id              : event.id,
                title           : event.title,
                start           : dataHora.toISOString(),                                      // Converte para ISO 8601
                hora            : event.hora,                                                  // Certifique-se de que isso está correto
                professionalName: event.professionalName || 'Profissional não especificado',
                user            : {
                    id      : event.user.id,
                    nome    : event.user.nome,
                    telefone: event.user.telefone,
                    email   : event.user.email
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
            where  : { id: req.params.id },
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

    console.log('Dados recebidos:', req.body);  // Verifique o que está sendo recebido

    if (!professionalName) {
        return res.status(400).json({ error: 'Nome do profissional não fornecido' });
    }

    try {
        const events = await Event.findAll({
            where: {
                professionalName: professionalName,
                start           : date
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
            start : moment(`${date} ${time}`).toISOString(),
            title : 'Serviço de Manicure',                     // Altere conforme necessário
            userId: req.user.id                                // ID do usuário autenticado
        });

        req.flash('success_msg', 'Agendamento realizado com sucesso!');
        res.redirect('/profile');
    } catch (error) {
        console.error('Erro ao criar evento:', error);
        req.flash('error_msg', 'Erro ao realizar agendamento.');
        res.redirect('/agendamento');
    }
});

require('dotenv').config();


app.use(express.json());  // Para interpretar JSON no body das requisições

    // Configurar transporte do Nodemailer com Gmail
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth   : {
        user: 'projetopi.agendamento@gmail.com',
        pass: 'seyf bmel gmnq dpie',               // Senha de aplicativo
    },
});

    // Rota para página de esqueci minha senha (GET)
app.get('/forgot-password', (req, res)=> {
    res.render('forgot-password');  // Certifique-se de ter o arquivo Handlebars 'forgot-password.handlebars'
});
    // Rota para processar a solicitação de redefinição de senha (POST)
  app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ where: { email } });
        if (!user) {
            return res.status(404).json({ error: 'Email não encontrado!' });
        }

          // Gerar token JWT para redefinição de senha
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

          // Link para redefinir a senha
        const resetLink = `http://localhost:3003/reset-password?token=${token}`;

          // Configuração do email
        const mailOptions = {
            from   : 'projetopi.agendamento@gmail.com',
            to     : email,
            subject: 'Redefinição de senha',
            html   : `<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: auto; background-color: #f9f9f9; border-radius: 8px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);">
                <h2 style = "color: #333;">Redefinição de Senha</h2>
                <p>Olá ${user.nome},</p>
                <p>Recebemos um pedido para redefinir sua senha. Clique no link abaixo para criar uma nova senha: </p>
                <a      href  = "${resetLink}" style                       = "display: inline-block; margin: 20px 0; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">Redefinir Senha</a>
                <p      style = "color: #777;">Se você não fez esse pedido, pode ignorar este e-mail.</p>
                <footer style = "margin-top: 20px; font-size: 12px; color: #999;">
                    <p>Obrigado,</p>
                    <p>Equipe PattyNails</p>
                </footer>
            </div>`,
        };

          // Enviar o email
        await transporter.sendMail(mailOptions);
        return res.json({ message: 'Email de redefinição de senha enviado com sucesso!' });
    } catch (error) {
        console.error('Erro ao processar a solicitação de redefinição de senha:', error);
        return res.status(500).json({ message: 'Erro ao processar a solicitação de redefinição de senha' });
    }
});

    // Rota para a página de redefinição de senha (GET)
app.get('/reset-password', (req, res) => {
    const { token } = req.query;  // Pega o token da query string
    if (!token) {
        req.flash('error_msg', 'Token inválido ou expirado!');
        return res.redirect('/forgot-password');
    }
    
        // Verifica se o token é válido
    try {
        jwt.verify(token, process.env.JWT_SECRET);  // Verifica o token sem decodificar para ver se ainda é válido
        res.render('reset-password', { token });    // Carrega a página de redefinição com o token
    } catch (error) {
        req.flash('error_msg', 'Token inválido ou expirado!');
        return res.redirect('/forgot-password');
    }
});

    // Rota POST para processar a redefinição de senha
  app.post('/reset-password', async (req, res) => {
    const { newPassword, token } = req.body;

    try {
          // Verificar o token JWT e obter o ID do usuário
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user    = await User.findOne({ where: { id: decoded.id } });

        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado!' });
        }

          // Atualizar a senha do usuário (criptografar a senha)
        user.senha = await bcrypt.hash(newPassword, 10);
        await user.save();

          // Retorna uma resposta de sucesso
        return res.json({ message: 'Senha redefinida com sucesso!' });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(400).json({ error: 'Token expirado! Por favor, solicite uma nova redefinição de senha.' });
        }

        console.error('Erro ao redefinir a senha:', error);
        return res.status(500).json({ error: 'Erro ao redefinir a senha' });
    }
});

app.post('/update-profile', async (req, res) => {
    const { name, email, phone } = req.body;
    const userId                 = req.user.id;

    try {
        await User.update({ nome: name, email: email, telefone: phone }, { where: { id: userId } });
        res.redirect('/profile?status=success&message=Perfil atualizado com sucesso!');
    } catch (error) {
        console.error(error);
        res.redirect('/profile?status=error&message=Erro ao atualizar o perfil.');
    }
});

app.use('/img', express.static(__dirname + './views/img'));


    // Inicializa o servidor
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});