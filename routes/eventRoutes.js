const express    = require('express');
const router     = express.Router();
const Event      = require('../models/event');  // Ajuste para o caminho do seu modelo de eventos
const User       = require('../models/user');   // Importação do modelo de usuários
const nodemailer = require('nodemailer');       // Certifique-se de ter nodemailer instalado
const fs = require('fs'); // Para anexar arquivos
const path = require('path');
const Handlebars = require('handlebars');


    // Configuração do transportador para envio de email
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth   : {
        user: 'projetopi.agendamento@gmail.com',
        pass: 'seyf bmel gmnq dpie',               // Senha de aplicativo
    },
});

// Função para carregar e compilar templates de email
async function loadTemplate(templateName, context) {
    const filePath = path.join(__dirname, `../views/emails/${templateName}.handlebars`);
    const source = fs.readFileSync(filePath, 'utf-8');
    const template = Handlebars.compile(source);
    return template(context);
}

// Rota para criar o evento e enviar emails
router.post('/add-event', async (req, res) => {
    const { title, start, hora, professionalName } = req.body;
    const userId = req.user ? req.user.id : null;

    console.log('Dados do evento:', { title, start, hora, professionalName, userId });

    if (!userId) {
        return res.status(401).json({ message: 'Você precisa estar logado para criar um evento.' });
    }

    if (!title || !start || !hora || !professionalName) {
        return res.status(400).json({ message: 'Título, início, horário e profissional são obrigatórios.' });
    }

    try {
        // Verificar se o profissional existe
        const professional = await User.findOne({ where: { nome: professionalName } });
        if (!professional) {
            console.log('Profissional não encontrado. Criando evento com nome do profissional fornecido:', professionalName);
        }

        // Verificar se já existe um evento para o mesmo horário
        const existingEvent = await Event.findOne({
            where: {
                professionalName: professional ? professional.nome : professionalName,
                start,
                hora
            }
        });

        if (existingEvent) {
            console.log('Já existe um evento agendado para este horário:', existingEvent);
            return res.status(400).json({ message: 'Já existe um evento agendado para este horário.' });
        }

        // Criar o evento
        const event = await Event.create({
            title,
            start,
            hora,
            professionalName: professional ? professional.nome : professionalName,
            userId
        });

        console.log('Evento criado com sucesso!', event);

        // Dados de contexto para o template
        const context = {
            event: {
                title: event.title,
                start: event.start,
                hora: event.hora,
                professionalName: event.professionalName
            },
            user: {
                nome: req.user.nome,
                email: req.user.email
            }
        };

        // Anexo
        const attachment = {
            filename: 'logoPattyNails.png', // Nome do arquivo
            path: path.join(__dirname, '../views/img/logo 2 preto.png'), // Caminho para o arquivo de imagem
            cid: 'logoPattyNails' // Usado como referência para a tag <img src="cid:logoPattyNails">
        };

        // Enviar e-mail para os administradores
        const admins = await User.findAll({ where: { isAdmin: true } });
        for (const admin of admins) {
            const emailHtmlAdmin = await loadTemplate('add-event-admin', { ...context, admin: { nome: admin.nome } });
            const mailOptionsAdmin = {
                from: 'projetopi.agendamento@gmail.com',
                to: admin.email,
                subject: 'Novo Agendamento Criado',
                html: emailHtmlAdmin,
                attachments: [attachment]
            };
            await transporter.sendMail(mailOptionsAdmin);
        }

        // Enviar e-mail de confirmação para o usuário
        const emailHtmlUser = await loadTemplate('add-event-user', { ...context });
        const mailOptionsUser = {
            from: 'projetopi.agendamento@gmail.com',
            to: req.user.email,
            subject: 'Confirmação de Agendamento',
            html: emailHtmlUser,
            attachments: [attachment]
        };
        await transporter.sendMail(mailOptionsUser);

        return res.status(200).json({ message: 'Evento criado com sucesso!' });
    } catch (error) {
        console.error('Erro ao criar evento:', error);
        return res.status(500).json({ message: 'Erro ao criar evento: ' + error.message });
    }
});


module.exports = router;