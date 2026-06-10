const axios   = require('axios');
const cheerio = require('cheerio');

async function scrapeReadme(projectUrl) {
    try {
        let url = projectUrl.trim();
        if (!url.startsWith('http')) url = 'https://' + url;

        if (url.includes('github.com')) {
            const parts = url.replace('https://github.com/', '').split('/');
            const user  = parts[0];
            const repo  = parts[1];
            let readmeText = null;

            try {
                const res = await axios.get(
                    `https://raw.githubusercontent.com/${user}/${repo}/main/README.md`
                );
                readmeText = res.data;
            } catch {
                const res = await axios.get(
                    `https://raw.githubusercontent.com/${user}/${repo}/master/README.md`
                );
                readmeText = res.data;
            }

            return {
                source:      'github',
                projectName: repo,
                readmeText:  readmeText?.slice(0, 3000) || '',
            };
        }

        const res  = await axios.get(url, { timeout: 8000 });
        const $    = cheerio.load(res.data);
        const text = $('body').text().replace(/\s+/g, ' ').slice(0, 3000);

        return {
            source:      'webpage',
            projectName: $('title').text() || 'Unknown Project',
            readmeText:  text,
        };

    } catch (err) {
        return {
            source:      'none',
            projectName: 'Unknown Project',
            readmeText:  '',
            error:       err.message,
        };
    }
}

function buildProjectContext(projectName, readmeText, projectUrl) {
    return `
Project Name: ${projectName}
Project URL: ${projectUrl}
README Summary:
${readmeText?.slice(0, 2000) || 'No README found.'}
`.trim();
}

module.exports = {
    scrapeReadme,
    buildProjectContext,
};