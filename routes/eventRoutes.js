const express = require('express');
const router = express.Router();
const Event = require('../models/event'); // Ajuste para o caminho do seu modelo de eventos
const User = require('../models/user'); // Importação do modelo de usuários

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
        res.redirect('/profile');
    } catch (error) {
        console.error('Erro ao criar evento:', error);
        res.status(500).send('Erro ao criar evento: ' + error.message);
    }
});

module.exports = router;
