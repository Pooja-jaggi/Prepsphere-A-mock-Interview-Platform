const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const db      = require('../database/db');
const { sendVerificationCode } = require('../middleware/mailer');
const { isAuthenticated } = require('../middleware/auth');

router.get('/', (req, res) => {
    res.render('landing');
});

// ── Register ──
router.get('/register', (req, res) => {
    res.render('register');
});

router.post('/register', async (req, res) => {
    const { firstname, lastname, email } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.verificationCode = code;
    req.session.tempUser = { firstname, lastname, email };
    try {
        await sendVerificationCode(email, code);
        res.redirect('/verify');
    } catch (err) {
        console.error(err);
        res.send('Failed to send email. Check your .env');
    }
});

// ── Verify ──
router.get('/verify', (req, res) => {
    res.render('verify');
});

router.post('/verify', (req, res) => {
    const { code } = req.body;
    if (code === req.session.verificationCode) {
        res.redirect('/set-password');
    } else {
        res.send('Invalid code. Please try again.');
    }
});

// ── Set Password ──
router.get('/set-password', (req, res) => {
    res.render('set-password');
});

router.post('/set-password', async (req, res) => {
    const { password, confirmpassword } = req.body;
    if (password !== confirmpassword) {
        return res.send('Passwords do not match. Please try again.');
    }
    const { firstname, lastname, email } = req.session.tempUser;
    const hashedPassword = await bcrypt.hash(password, 10);
    db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)')
      .run(`${firstname} ${lastname}`, email, hashedPassword);
    req.session.verificationCode = null;
    req.session.tempUser = null;
    res.redirect('/login');
});
router.get('/forgot-password', (req,res) =>{
    res.render('forgot-password');
});
router.post('/forgot-password', async (req, res) =>{
    const {email} =req.body;
    const user =db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if(!user)return res.send("NO account found with that email");

    const code = Math.floor(100000 + Math.random()* 900000).toString();
    req.session.resetCode = code;
    req.session.resetEmail =email;
    
    try{
        await sendVerificationCode(email, code);
        res.redirect('/reset-password');

    }catch(err){
        console.error(err);
        res.send('Failed to send email.Check you .env')
    }
})
router.get('/reset-password',(req,res)=>{
    res.render('reset-password',{error:req.query.error || null

    });
});
router.post('/reset-password', async (req,res)=>{
    const {code, password ,confirmpassword}=req.body;

    if(code!=req.session.resetCode){
        return res.redirect('/reset-password?error=invalidcode');

    }
    if (password != confirmpassword){
        return res.redirect('/reset-password?error=nomatch');

    }
    const hashedPassword=await bcrypt.hash(password,10);
    db.prepare('UPDATE users SET password =? WHERE email=?')
    .run(hashedPassword, req.session.resetEmail);
    req.session.resetCode = null;
    req.session.resetEmail =null;
    res.redirect('/login');

});
router.get('/login', (req, res) => {
    res.render('login',{error:req.query.error ||null});
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.redirect('/login?error=notfound');
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.redirect('/login?error=incorrect');
    req.session.user = {
        id:       user.id,
        username: user.username,
        email:    user.email,
        name:     user.username,
        avatar:   user.avatar || null,
        college:  user.college || null,
    };
    res.redirect('/dashboard');
});

// ── Dashboard ──
router.get('/dashboard', isAuthenticated, (req, res) => {
    const user = req.session.user;
    const interviews = db.prepare('SELECT * FROM interviews WHERE user_id=? ORDER BY created_at DESC').all(user.id);

    const completed = interviews.filter(i => i.status === 'completed');
    const scores    = completed.map(i => i.score).filter(Boolean);
    const avgScore  = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const bestScore = scores.length ? Math.max(...scores) : 0;

    // Difficulty breakdown
    const difficultyCount = { Easy: 0, Medium: 0, Hard: 0 };
    interviews.forEach(i => {
        if (i.difficulty && difficultyCount[i.difficulty] !== undefined)
            difficultyCount[i.difficulty]++;
    });

    // Mode avg score
    const modeMap = {};
    interviews.forEach(i => {
        if (!i.mode) return;
        if (!modeMap[i.mode]) modeMap[i.mode] = { total: 0, scoreSum: 0 };
        modeMap[i.mode].total++;
        if (i.score) modeMap[i.mode].scoreSum += i.score;
    });
    const modeStats = Object.entries(modeMap).map(([mode, data]) => ({
        mode,
        avg: data.total ? Math.round(data.scoreSum / data.total) : 0
    }));

    // Last 7 days
    const last7 = [];
    for (let d = 6; d >= 0; d--) {
        const date = new Date();
        date.setDate(date.getDate() - d);
        const label = date.toISOString().slice(0, 10);
        const count = interviews.filter(i => i.created_at && i.created_at.startsWith(label)).length;
        last7.push({ label, count });
    }

    const stats = { total: interviews.length, completed: completed.length, avgScore, bestScore, difficultyCount, modeStats, last7 };
    res.render('dashboard', { user, interviews, stats });
});

// ── Profile GET ──
router.get('/profile', isAuthenticated, (req, res) => {
    const user       = req.session.user;
    const interviews = db.prepare('SELECT * FROM interviews WHERE user_id=? ORDER BY created_at DESC').all(user.id);
    const completed  = interviews.filter(iv => iv.status === 'completed');
    const scores     = completed.map(iv => iv.score).filter(Boolean);
    const stats = {
        total:     interviews.length,
        completed: completed.length,
        avgScore:  scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
        bestScore: scores.length ? Math.max(...scores) : 0,
    };
    res.render('profile', { user, stats });
});

// ── Profile UPDATE ──
router.post('/profile/update', isAuthenticated, (req, res) => {
    const { name, college, target_role, avatar } = req.body;
    db.prepare('UPDATE users SET username=?, college=?, target_role=?, avatar=? WHERE id=?')
      .run(name, college, target_role, avatar, req.session.user.id);
    req.session.user.username    = name;
    req.session.user.name        = name;
    req.session.user.college     = college;
    req.session.user.target_role = target_role;
    req.session.user.avatar      = avatar;
    res.json({ success: true });
});

// ── Delete history ──
router.post('/profile/delete-history', isAuthenticated, (req, res) => {
    db.prepare('DELETE FROM interviews WHERE user_id=?').run(req.session.user.id);
    res.json({ success: true });
});

// ── Logout ──
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

module.exports = router;