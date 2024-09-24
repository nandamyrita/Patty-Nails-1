const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const Event = require('../models/event'); // Caminho corrigido
const moment = require('moment');

// Middleware para verificar se o usuário está autenticado
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

// Rota para exibir a página de calendário (apenas para admin)
router.get('/calendar', isAuthenticated, async (req, res) => {
    if (req.user.isAdmin) {
        const events = await Event.findAll({
            include: [{ model: User, as: 'user' }] // Inclua o usuário aqui
        });
        res.render('calendar', { events });
    } else {
        res.redirect('/profile');
    }
});

// Rota para exibir o perfil do usuário com seus agendamentos
router.get('/profile', isAuthenticated, async (req, res) => {
    const userId = req.session.user.id;

    const events = await Event.findAll({
        where: { userId }
    });

    res.render('profile', { events, moment });
});

// Rota para deletar evento com restrição de tempo
router.post('/delete-event-user/:id', isAuthenticated, async (req, res) => {
    const { id } = req.params;
    const userId = req.session.user.id;

    const event = await Event.findOne({
        where: { id, userId }
    });

    if (!event) {
        return res.status(404).send('Evento não encontrado.');
    }

    const eventDate = moment(event.start);
    const today = moment();
    const diff = eventDate.diff(today, 'days');

    if (diff >= 1) {
        return res.status(400).send('Você só pode excluir eventos com no máximo 1 dia de antecedência.');
    }

    await event.destroy();
    res.redirect('/profile');
});

module.exports = router;
