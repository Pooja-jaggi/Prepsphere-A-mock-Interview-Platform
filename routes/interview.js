const express = require('express');
const router  = express.Router();
const db      = require('../database/db');
const { isAuthenticated }  = require('../middleware/auth');
const { scrapeReadme, buildProjectContext } = require('../utils/scraper');
const { buildSystemPrompt, sendMessage, detectNudge, detectTopics, detectDifficulty, generateScore, generateBodyLanguageTips } = require('../utils/groq');

router.get('/interview', isAuthenticated, (req, res) => {
    res.render('interview', { user: req.session.user });
});

router.post('/interview/start', isAuthenticated, async (req, res) => {
    try {
        const { project_url, mode, difficulty, interviewType, topicFocus, timeLimit } = req.body;
        const user = req.session.user;
        const scraped = await scrapeReadme(project_url);
        const projectContext = buildProjectContext(scraped.projectName, scraped.readmeText, project_url);
        const topics = await detectTopics(projectContext, scraped.readmeText);
        const detectedDiff = difficulty === 'auto'
            ? await detectDifficulty(projectContext, scraped.readmeText)
            : difficulty;
        const systemPrompt = buildSystemPrompt({
            projectContext, mode, difficulty: detectedDiff,
            interviewType: interviewType || 'technical',
            topicFocus: topicFocus || 'auto',
            timeLimit: timeLimit || 'none',
        });
        const result = db.prepare(`
            INSERT INTO interviews (user_id, project_url, mode, difficulty, tech_used, status)
            VALUES (?, ?, ?, ?, ?, 'incomplete')
        `).run(user.id, project_url, mode, detectedDiff, topics.join(', '));
        const interviewId = result.lastInsertRowid;
        req.session.interview = {
            id: interviewId, systemPrompt, projectContext,
            history: [], topics, mode, difficulty: detectedDiff,
        };
        const firstMessage = await sendMessage(systemPrompt, [], 'Hello, I am ready to begin the interview.');
        req.session.interview.history.push(
            { role: 'user', content: 'Hello, I am ready to begin the interview.' },
            { role: 'assistant', content: firstMessage }
        );
        res.redirect(`/interviews/${interviewId}`);
    } catch (err) {
        console.error('Interview start error:', err);
        res.status(500).send('Failed to start interview. Check your project URL and API keys.');
    }
});

router.get('/interviews/:id', isAuthenticated, (req, res) => {
    const interview = db.prepare('SELECT * FROM interviews WHERE id = ? AND user_id = ?')
        .get(req.params.id, req.session.user.id);
    if (!interview) return res.redirect('/dashboard');
    const sessionData = req.session.interview || {};
    const history = sessionData.history || [];
    const sessionUser = { ...req.session.user, name: req.session.user.username };
    res.render('interview-session', {
        user: sessionUser, interview, history, messages: history,
        topics: sessionData.topics || [],
        difficulty: sessionData.difficulty || interview.difficulty,
    });
});

router.post('/interview/message', isAuthenticated, async (req, res) => {
    try {
        const { message } = req.body;
        const sessionData = req.session.interview;
        if (!sessionData) return res.status(400).json({ error: 'No active interview session.' });
        const { systemPrompt, history, mode } = sessionData;
        const nudge = mode == 'explain' ? null : await detectNudge(systemPrompt, history, message);
        const aiReply = await sendMessage(systemPrompt, history, message);
        req.session.interview.history.push(
            { role: 'user', content: message },
            { role: 'assistant', content: aiReply }
        );
        res.json({ reply: aiReply, nudge: nudge || null });
    } catch (err) {
        console.error('Chat error:', err);
        res.status(500).json({ error: 'AI response failed.' });
    }
});

router.post('/interview/end', isAuthenticated, async (req, res) => {
    try {
        const sessionData = req.session.interview;
        if (!sessionData) return res.json({ score: 0, confidence_level: 'N/A', improvement_areas: [] });
        const { id, history, projectContext } = sessionData;
        const evaluation = await generateScore(history, projectContext);
        const bodyTips=await generateBodyLanguageTips(history);
        evaluation.body_tips=bodyTips;
        db.prepare(`
            UPDATE interviews
            SET score=?, confidence_level=?, improvement_areas=?, status='completed'
            WHERE id=?
        `).run(evaluation.score, evaluation.confidence_level, evaluation.improvement_areas.join(', '), id);
        req.session.interview = null;
        res.json(evaluation);
    } catch (err) {
        console.error('End error:', err);
        res.status(500).json({ score: 0, confidence_level: 'N/A', improvement_areas: ['Error generating score.'] });
    }
});

router.get('/interviews/:id/report', isAuthenticated, async (req, res) => {
    try {
        const interview = db.prepare('SELECT * FROM interviews WHERE id = ? AND user_id = ?')
            .get(req.params.id, req.session.user.id);
        if (!interview) return res.redirect('/dashboard');
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=prepsphere-report-${interview.id}.pdf`);
        doc.pipe(res);
        doc.rect(0, 0, doc.page.width, 80).fill('#050816');
        doc.fontSize(24).fillColor('#00d4ff').font('Helvetica-Bold')
           .text('PREPSPHERE', 50, 25);
        doc.fontSize(10).fillColor('#8892b0').font('Helvetica')
           .text('AI Mock Interview Report', 50, 55);
        doc.fontSize(10).fillColor('#8892b0')
           .text(`Generated: ${new Date().toLocaleDateString()}`, 0, 55, { align: 'right' });
        doc.moveDown(3);
        doc.fontSize(14).fillColor('#7b2ff7').font('Helvetica-Bold').text('INTERVIEW DETAILS');
        doc.moveDown(0.5);
        doc.fontSize(11).fillColor('#333333').font('Helvetica');
        doc.text(`Project URL:  ${interview.project_url}`);
        doc.text(`Mode:         ${interview.mode}`);
        doc.text(`Difficulty:   ${interview.difficulty}`);
        doc.text(`Status:       ${interview.status}`);
        doc.text(`Date:         ${interview.created_at}`);
        doc.moveDown(1);
        doc.fontSize(14).fillColor('#7b2ff7').font('Helvetica-Bold').text('PERFORMANCE SCORE');
        doc.moveDown(0.5);
        doc.fontSize(32).fillColor('#00d4ff').font('Helvetica-Bold')
           .text(`${interview.score || 'N/A'} / 100`, { align: 'center' });
        doc.fontSize(11).fillColor('#333333').font('Helvetica')
           .text(`Confidence Level: ${interview.confidence_level || 'N/A'}`, { align: 'center' });
        doc.moveDown(1);
        if (interview.improvement_areas) {
            doc.fontSize(14).fillColor('#7b2ff7').font('Helvetica-Bold').text('AREAS TO IMPROVE');
            doc.moveDown(0.5);
            interview.improvement_areas.split(',').forEach((area, i) => {
                doc.fontSize(11).fillColor('#333333').font('Helvetica')
                   .text(`${i + 1}. ${area.trim()}`);
            });
            doc.moveDown(1);
        }
        if (interview.tech_used) {
            doc.fontSize(14).fillColor('#7b2ff7').font('Helvetica-Bold').text('TOPICS COVERED');
            doc.moveDown(0.5);
            doc.fontSize(11).fillColor('#333333').font('Helvetica').text(interview.tech_used);
            doc.moveDown(1);
        }
        doc.fontSize(9).fillColor('#8892b0')
           .text('Generated by PrepSphere — AI Mock Interview Platform', 50, doc.page.height - 40, { align: 'center' });
        doc.end();
    } catch (err) {
        console.error('PDF error:', err);
        res.status(500).send('Failed to generate PDF report.');
    }
});

module.exports = router;