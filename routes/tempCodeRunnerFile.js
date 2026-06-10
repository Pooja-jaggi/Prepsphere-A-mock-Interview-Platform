const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { sendVerificationCode } = require('../middleware/mailer');
const{isAuthenticated}=require('../middleware/auth');
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
    const stmt = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)');
    stmt.run(`${firstname} ${lastname}`, email, hashedPassword);
    req.session.verificationCode = null;
    req.session.tempUser = null;
    res.redirect('/dashboard');
});
router.get('/login', (req, res) => {
    res.render('login');
});

router.post('/login', async (req, res) => {
    console.log('login body:', req.body);
    const { email, password } = req.body;
    
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
        return res.send('No account found with that email.');
    }
    
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
        return res.send('Incorrect password.');
    }
    
    req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email
    };
    
    res.redirect('/dashboard');
});
router.get('/dashboard',isAuthenticated,(req,res)=>{
    const user=req.session.user;
    const interviews=db.prepare('SELECT * FROM interviews WHERE user_id =? ORDER BY created_at DESC').all(user.id);
    res.render('dashboard',{user,interviews});
});
router.get('/logout',(req,res)=>{
    req.session.destroy();
    res.redirect('/login');
});
module.exports=router;