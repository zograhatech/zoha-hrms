const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const http = require('http');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const app = require('../server');

async function runCorsCurlTests() {
    const port = 5001;
    const server = http.createServer(app);

    await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
    console.log(`Test backend listening on http://127.0.0.1:${port}\n`);

    const tests = [
        {
            name: '1. Vercel Preview Deployment Origin (Preflight OPTIONS)',
            origin: 'https://zoha-hrms-cwie-git-feature-chat-status-sync-zograha.vercel.app',
            expectedAllowOrigin: 'https://zoha-hrms-cwie-git-feature-chat-status-sync-zograha.vercel.app',
            cmd: `curl.exe -s -i -X OPTIONS http://127.0.0.1:${port}/api/auth/login -H "Origin: https://zoha-hrms-cwie-git-feature-chat-status-sync-zograha.vercel.app" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type"`
        },
        {
            name: '2. Production Frontend Origin (Preflight OPTIONS)',
            origin: 'https://zoha-hrms-cwie.vercel.app',
            expectedAllowOrigin: 'https://zoha-hrms-cwie.vercel.app',
            cmd: `curl.exe -s -i -X OPTIONS http://127.0.0.1:${port}/api/auth/login -H "Origin: https://zoha-hrms-cwie.vercel.app" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type"`
        },
        {
            name: '3. Localhost Origin (Preflight OPTIONS, dev only)',
            origin: 'http://localhost:5173',
            expectedAllowOrigin: 'http://localhost:5173',
            cmd: `curl.exe -s -i -X OPTIONS http://127.0.0.1:${port}/api/auth/login -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type"`
        },
        {
            name: '4. Unauthorized Origin (Preflight OPTIONS from evil.example.com)',
            origin: 'https://evil.example.com',
            expectedAllowOrigin: null, // MUST NOT HAVE Access-Control-Allow-Origin
            cmd: `curl.exe -s -i -X OPTIONS http://127.0.0.1:${port}/api/auth/login -H "Origin: https://evil.example.com" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type"`
        },
        {
            name: '5. Vercel Preview Origin Actual GET /api/settings/branding',
            origin: 'https://zoha-hrms-cwie-git-feature-chat-status-sync-zograha.vercel.app',
            expectedAllowOrigin: 'https://zoha-hrms-cwie-git-feature-chat-status-sync-zograha.vercel.app',
            cmd: `curl.exe -s -i -X GET http://127.0.0.1:${port}/api/settings/branding -H "Origin: https://zoha-hrms-cwie-git-feature-chat-status-sync-zograha.vercel.app"`
        },
        {
            name: '6. Error Response (401 Unauthorized on invalid login with Preview Origin)',
            origin: 'https://zoha-hrms-cwie-git-feature-chat-status-sync-zograha.vercel.app',
            expectedAllowOrigin: 'https://zoha-hrms-cwie-git-feature-chat-status-sync-zograha.vercel.app',
            cmd: `curl.exe -s -i -X POST http://127.0.0.1:${port}/api/auth/login -H "Origin: https://zoha-hrms-cwie-git-feature-chat-status-sync-zograha.vercel.app" -H "Content-Type: application/json" -d "{\\"email\\":\\"fake@zograha.com\\",\\"password\\":\\"wrongpass\\"}"`
        }
    ];

    const results = [];

    for (const t of tests) {
        console.log(`====================================================`);
        console.log(`RUNNING: ${t.name}`);
        console.log(`COMMAND: ${t.cmd}`);
        console.log(`====================================================`);
        try {
            const { stdout, stderr } = await execAsync(t.cmd, { maxBuffer: 10 * 1024 * 1024 });
            const rawOutput = stdout || stderr;
            console.log(rawOutput);

            const hasAllowOrigin = rawOutput.toLowerCase().includes('access-control-allow-origin:');
            const lines = rawOutput.split(/\r?\n/);
            const statusLine = lines[0] || '';
            const matchLine = lines.find(l => l.toLowerCase().startsWith('access-control-allow-origin:')) || '';
            const varyLine = lines.find(l => l.toLowerCase().startsWith('vary:')) || '';
            const allowMethodsLine = lines.find(l => l.toLowerCase().startsWith('access-control-allow-methods:')) || '';
            const allowHeadersLine = lines.find(l => l.toLowerCase().startsWith('access-control-allow-headers:')) || '';

            let passed = false;
            if (t.expectedAllowOrigin) {
                passed = matchLine.toLowerCase().includes(t.expectedAllowOrigin.toLowerCase());
            } else {
                passed = !hasAllowOrigin;
            }

            results.push({
                test: t.name,
                status: statusLine,
                origin: t.origin,
                expected: t.expectedAllowOrigin || 'NONE (Header omitted)',
                actual: matchLine || 'NONE (Header omitted)',
                vary: varyLine,
                methods: allowMethodsLine,
                headers: allowHeadersLine,
                passed
            });
        } catch (err) {
            console.error('Execution error:', err.message);
            results.push({
                test: t.name,
                origin: t.origin,
                expected: t.expectedAllowOrigin,
                actual: 'ERROR: ' + err.message,
                passed: false
            });
        }
        console.log('\n');
    }

    await new Promise((resolve) => server.close(resolve));
    console.log('Server closed.\n');

    console.log('====================================================');
    console.log('CURL VERIFICATION RESULTS TABLE');
    console.log('====================================================');
    console.table(results.map(r => ({
        Test: r.test,
        Origin: r.origin,
        Status: r.status,
        Expected: r.expected,
        Actual: r.actual,
        Passed: r.passed ? 'PASS' : 'FAIL'
    })));

    const allPassed = results.every(r => r.passed);
    console.log(`\nOVERALL STATUS: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
    process.exit(allPassed ? 0 : 1);
}

runCorsCurlTests();
