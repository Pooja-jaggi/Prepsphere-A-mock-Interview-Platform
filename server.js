require('dotenv').config();
console.log("EMAIL_USER =", process.env.EMAIL_USER);
console.log("EMAIL_PASS =", process.env.EMAIL_PASS ? "Loaded" : "Missing");
const express = require('express');
const session = require('express-session');
const db      = require('./database/db');

const app = express();

app.set('view engine', 'ejs');
app.set('views', './views');

const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret:            ['prepsphere_secret123'],
    resave:            false,
    saveUninitialized: false,
    cookie:            { maxAge: 1000 * 60 * 60 * 24 }
}));

app.use(express.static('public'));

const authRoutes      = require('./routes/auth');
const interviewRoutes = require('./routes/interview');

app.use('/', authRoutes);
app.use('/', interviewRoutes);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});