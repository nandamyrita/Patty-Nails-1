const express = require('express');
const router = express.Router();
const Event = require('../models/event'); // Ajuste para o caminho do seu modelo de eventos
const User = require('../models/user'); // Importação do modelo de usuários
const nodemailer = require('nodemailer'); // Certifique-se de ter nodemailer instalado

// Configuração do transportador para envio de email
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'projetopi.agendamento@gmail.com',
        pass: 'seyf bmel gmnq dpie', // Senha de aplicativo
    },
});

router.post('/add-event', async (req, res) => {
    const { title, start, hora, professionalName } = req.body;
    const userId = req.user ? req.user.id : null;

    console.log('Dados do evento:', { title, start, hora, professionalName, userId });

    if (!userId) {
        req.flash('error_msg', 'Você precisa estar logado para criar um evento.');
        return res.redirect('/login');
    }

    if (!title || !start || !hora || !professionalName) {
        return res.status(400).send('Título, início, horário e profissional são obrigatórios.');
    }

    try {
        // Verificar se o profissional existe
        const professional = await User.findOne({ where: { nome: professionalName } });
        
        if (!professional) {
            console.log('Profissional não encontrado. Criando evento com nome do profissional fornecido:', professionalName);
        } else {
            console.log('Profissional encontrado:', professional.nome);
        }

        // Verificar se já existe um evento para o mesmo horário
        const existingEvent = await Event.findOne({ 
            where: { 
                professionalName: professional ? professional.nome : professionalName, // Usar o nome fornecido se o profissional não existir
                start,
                hora
            }
        });

        if (existingEvent) {
            console.log('Já existe um evento agendado para este horário:', existingEvent);
            return res.status(400).send('Já existe um evento agendado para este horário.');
        }

        // Criar o evento
        const event = await Event.create({
            title,
            start,
            hora,
            professionalName: professional ? professional.nome : professionalName, // Usar o nome fornecido se o profissional não existir
            userId
        });

        console.log('Evento criado com sucesso!', event);

        // Enviar e-mail para os administradores sobre a criação do evento
        const admins = await User.findAll({ where: { isAdmin: true } });
        for (const admin of admins) {
            const mailOptionsAdmin = {
                from: 'projetopi.agendamento@gmail.com',
                to: admin.email,
                subject: 'Novo Agendamento Criado',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: auto; background-color: #f9f9f9; border-radius: 8px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);">
                        <h2 style="color: #333;">Novo Agendamento Criado</h2>
                        <p>Olá ${admin.nome},</p>
                        <p>Um novo agendamento foi criado:</p>
                        <ul>
                            <li><strong>Serviço:</strong> ${event.title}</li>
                            <li><strong>Data:</strong> ${event.start}</li>
                            <li><strong>Horário:</strong> ${event.hora}</li>
                            <li><strong>Profissional:</strong> ${event.professionalName}</li>
                            <li><strong>Usuário:</strong> ${req.user.nome}</li>
                        </ul>
                        <footer style="margin-top: 20px; font-size: 12px; color: #999;">
                            <p>Obrigado,</p>
                            <p>Equipe PattyNails</p>
                        </footer>
                    </div>
                `,
            };
            await transporter.sendMail(mailOptionsAdmin);
        }

        // Enviar e-mail de confirmação para o usuário
        const mailOptionsUser = {
            from: 'projetopi.agendamento@gmail.com',
            to: req.user.email,
            subject: 'Confirmação de Agendamento',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: auto; background-color: #f9f9f9; border-radius: 8px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);">
                    <h2 style="color: #333;">Confirmação de Agendamento</h2>
                    <p>Olá ${req.user.nome},</p>
                    <p>Seu agendamento foi criado com sucesso. Aqui estão os detalhes:</p>
                    <ul>
                        <li><strong>Serviço:</strong> ${event.title}</li>
                        <li><strong>Data:</strong> ${event.start}</li>
                        <li><strong>Horário:</strong> ${event.hora}</li>
                        <li><strong>Profissional:</strong> ${event.professionalName}</li>
                    </ul>
                    <footer style="margin-top: 20px; font-size: 12px; color: #999;">
                        <p>Obrigado por agendar conosco!</p>
                        <p>Equipe PattyNails</p>
                    </footer>
                </div>
            `,
        };
        await transporter.sendMail(mailOptionsUser);

        res.redirect('/profile');
    } catch (error) {
        console.error('Erro ao criar evento:', error);
        res.status(500).send('Erro ao criar evento: ' + error.message);
    }
});

module.exports = router;