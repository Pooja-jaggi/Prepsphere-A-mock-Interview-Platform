const axios = require('axios');
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

function buildSystemPrompt({ projectContext, mode, difficulty, interviewType, topicFocus, timeLimit }) {

  const difficultyGuide = {
    auto: 'Auto-detect difficulty from the project and adjust questions accordingly.',
    beginner: 'Ask beginner-level questions. Focus on basic concepts and fundamentals.',
    intermediate: 'Ask intermediate questions. Expect solid understanding of core concepts.',
    advanced: 'Ask advanced questions. Dig into architecture, edge cases, performance.',
  };

  const interviewTypeGuide = {
    technical: 'Focus entirely on technical questions — code, architecture, databases, algorithms.',
    hr: 'Focus on behavioural questions — teamwork, challenges, motivation, learnings.',
    both: 'Mix technical and HR. Start with 1-2 HR questions then go technical.',
  };

  const topicGuide = {
    auto: 'Auto-detect topics from the project and ask from those areas.',
    dsa: 'Focus on Data Structures and Algorithms.',
    dbms: 'Focus on Database design, normalization, indexing, queries.',
    os: 'Focus on OS concepts — processes, threads, memory, scheduling.',
    networks: 'Focus on Networking — HTTP, TCP/IP, REST, WebSockets.',
    fullstack: 'Focus on full-stack — frontend, backend, APIs, deployment.',
  };

  const timeLimitLine = timeLimit && timeLimit !== 'none'
    ? `Each question has a ${timeLimit} second time limit. If the user takes too long, nudge them.`
    : '';

  if (mode === 'explain') {
    return `
You are ARIA-3, a technical mentor at PrepSphere.
The candidate has submitted their project and wants you to explain it deeply.
RESPONSE STYLE: Be concise.Max 3-4 sentences per reply . No long paragraphs .Get to teh point fast .
PROJECT CONTEXT:
${projectContext}

YOUR JOB:
- Start by giving a thorough, structured explanation of the project covering:
  1. What the project does and its purpose
  2. The tech stack and why each technology is used
  3. How the core features work under the hood
  4. The database/data flow
  5. Authentication and security approach
  6. Any interesting or advanced implementation details
- Be detailed, clear, and educational — like a senior dev explaining to a junior.
- After your explanation, ask: "Do you have any questions about how any part of this works?"
- Answer follow-up questions thoroughly.
- Never rush. Go deep on every topic the candidate asks about.
`.trim();
  }

  if (mode === 'interview') {
    return `
You are ARIA-3, a strict and professional technical interviewer at PrepSphere.
You are conducting a real interview about the candidate's project.
RESPOND STYLE: Be firm and realistic ,like an actual company interviewer .
No long paragraphs .Kepp it concise and to the point .Ask one question at a time and wait for the answer before asking another .
PROJECT CONTEXT:
${projectContext}

DIFFICULTY: ${difficultyGuide[difficulty] || difficultyGuide.auto}
INTERVIEW TYPE: ${interviewTypeGuide[interviewType] || interviewTypeGuide.technical}
TOPIC FOCUS: ${topicGuide[topicFocus] || topicGuide.auto}
${timeLimitLine}

YOUR JOB:
- Start by greeting the candidate warmly and saying "Let's begin.Tell me a bit about yourself ."
-After they intorduce themselves ,say"Great !Now let's talk about your project."and guve a 1-2 line summary of what you read.
-Then ask your first technical question 
- Ask ONE question at a time. Never ask multiple questions together.
- Wait for the answer before moving to the next question.
- If the answer is wrong or incomplete, give a short nudge — do NOT give the answer away.
- Ask 8-10 questions total covering different aspects of the project.
- Be professional, firm, and realistic — like an actual company interviewer.
- After all questions, say: "That concludes the interview. Your results will be evaluated now."
`.trim();
  }

  if (mode === 'both') {
    return `
You are ARIA-3, a technical mentor and interviewer at PrepSphere.
You will first explain the project deeply, then conduct a real interview about it.

PROJECT CONTEXT:
${projectContext}

DIFFICULTY: ${difficultyGuide[difficulty] || difficultyGuide.auto}
INTERVIEW TYPE: ${interviewTypeGuide[interviewType] || interviewTypeGuide.technical}
TOPIC FOCUS: ${topicGuide[topicFocus] || topicGuide.auto}
${timeLimitLine}

YOUR JOB - TWO PHASES:

PHASE 1 — EXPLANATION:
- Give a thorough structured explanation of the project covering tech stack, features, data flow, auth, and implementation details.
- After explaining, ask: "Do you have questions before we move to the interview?"
- Answer any follow-up questions clearly.
- When the candidate says they are ready, move to Phase 2.

PHASE 2 — INTERVIEW:
- Say:"Greate ! let's begin the interview now .First ,tell me a bit about yourself ."
-After they introduce themselves,transition into project question naturally.
-Ask ONE question at a time like a real interviewer .
- Wait for each answer before asking the next.
- If an answer is wrong or incomplete, give a short nudge — do NOT give the answer away.
- Ask 8-10 questions total.
- After all questions, say: "That concludes the interview. Your results will be evaluated now."
`.trim();
  }

  // fallback
  return `
You are ARIA-3, a professional AI interviewer at PrepSphere.
PROJECT CONTEXT: ${projectContext}
Ask the candidate questions about their project one at a time.
RESPOND STYLE:Be firma nd realistic like an actual company interviewer .NO long paragraphs .Ask question shortly .
`.trim();
}
// SEND MESSAGES (with conversation memory)
async function sendMessage(systemPrompt, conversationHistory, userMessage) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];
  const res = await axios.post(GROQ_API_URL, {
    model: MODEL,
    messages,
    temperature: 0.7,
    max_tokens: 300,
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    }
  });
  return res.data.choices[0].message.content;
}

async function detectNudge(systemPrompt, conversationHistory, userMessage) {
  const prompt = `
The candidate just answered: "${userMessage}"

Based on the conversation so far, is this answer wrong, incomplete, or missing something important?
If yes, reply with a short one-line hint to guide them WITHOUT giving away the answer.
If the answer is fine, reply with exactly: NULL
`;

  const res = await axios.post(GROQ_API_URL, {
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: prompt }
    ],
    temperature: 0.4,
    max_tokens: 100,
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    }
  });

  const reply = res.data.choices[0].message.content.trim();
  return reply === 'NULL' ? null : reply;
}

async function detectTopics(projectContext, readmeText) {
  const prompt = `
Based on this project context and README, list the top 3-5 technical topics this project covers.
Choose only from: DSA, DBMS, OS, Networks, Full-Stack, Flask, React, Node.js, Auth, REST API, SQL, Docker.
Reply with ONLY a JSON array. Example: ["Flask", "SQL", "Auth"]

PROJECT: ${projectContext}
README: ${readmeText?.slice(0, 800) || 'Not available'}
`;

  const res = await axios.post(GROQ_API_URL, {
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 100,
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    }
  });

  try {
    const text = res.data.choices[0].message.content.trim();
    return JSON.parse(text);
  } catch {
    return [];
  }
}

async function detectDifficulty(projectContext, readmeText) {
  const prompt = `
Based on this project, classify the difficulty as one of: beginner, intermediate, advanced.
Reply with ONLY one word.

PROJECT: ${projectContext}
README: ${readmeText?.slice(0, 600) || 'Not available'}
`;

  const res = await axios.post(GROQ_API_URL, {
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 10,
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    }
  });

  const result = res.data.choices[0].message.content.trim().toLowerCase();
  return ['beginner', 'intermediate', 'advanced'].includes(result) ? result : 'intermediate';
}

async function generateScore(conversationHistory, projectContext) {
  const prompt = `
You just finished interviewing a candidate about their project: ${projectContext}

Here is the full conversation:
${conversationHistory.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}

Now evaluate the candidate and reply with ONLY a valid JSON object like this:
{
  "score": 74,
  "confidence_level": "Moderate",
  "improvement_areas": [
    "Needs to explain database indexing more clearly",
    "Should understand session vs JWT trade-offs",
    "Could elaborate more on error handling"
  ]
}
`;

  const res = await axios.post(GROQ_API_URL, {
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 400,
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    }
  });

  try {
    const text = res.data.choices[0].message.content.trim();
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return { score: 50, confidence_level: 'Moderate', improvement_areas: ['Could not evaluate session.'] };
  }
}
async function generateBodyLanguageTips(conversationHistory){
  const prompt =`
  Based on this interview conversation,generate 3 short personalized body language and communication tips for the candidate.
  Focus on things like: eye contact,speaking pace,confidence ,clarity ,pausing before answering .
  Reply with ONLY a JSON array of 3 strings .Example:
  ["You tend to rush answers -pause and breateh before responding .","Maintain eye contact with the camera to project confidence .","Your answers were clear but try to smile more naturally."]
  CONVERSATION:
  ${conversationHistory.map(m => `$ {m.role.toUpperCase()}: ${m.content}`).join('\n').slice(0,2000)}
  `;
  const res =await axios.post(GROQ_API_URL,{
    model: MODEL ,
    messages: [{ role:'user',content:prompt}],
    temperature:0.4,
    max_tokens:200,
  },
  {
    headers: {
      'Authorization':`Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type':'application/json',
    }
  });
  try{
    const text =res.data.choices[0].message.content.trim();
    const clean = text.replace(/```json|```/g,'').trim();
    return JSON.parse(clean);
  }catch{
    return [
      'Maintain eye contact with the camera.',
      'Take a breathe before answering -composure is key .',
      'Sit upright and speat at a steadt pace.',
    ];
  }
}

module.exports = {
  buildSystemPrompt,
  sendMessage,
  detectNudge,
  detectTopics,
  detectDifficulty,
  generateScore,
  generateBodyLanguageTips
};