(() => {
    const FORMAT_REGEX = /^\d{3}\.\d{2}$/;
    const STORAGE_KEY = 'dd_mastermind_stats';

    // Load and parse CSV file at data/mastermind.csv
    async function loadMastermindCSV() {
        try {
            const res = await fetch('data/mastermind.csv');
            if (!res.ok) return [];
            const txt = await res.text();
            const lines = txt.split(/\r?\n/).filter(l => l.trim() !== '');
            if (lines.length <= 1) return [];
            // remove header
            lines.shift();
            return lines.map(line => {
                const parts = line.split(',').map(p => p.trim());
                return {
                    puzzle_number: parts[0] || '',
                    dewey_number: parts[1] || '',
                    description: parts[2] || '',
                    puzzle_date: parts[3] || ''
                };
            });
        } catch (e) {
            console.error('Failed to load mastermind.csv', e);
            return [];
        }
    }

    function getTodayString() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    // Deterministic pseudo-random generator from a seed
    function lcg(seed) {
        let state = seed >>> 0;
        return () => {
            state = (1664525 * state + 1013904223) >>> 0;
            return state / 0x100000000;
        };
    }

    function dailyCodeForDate(dateStr) {
        // seed from date string chars
        let seed = 0;
        for (let i = 0; i < dateStr.length; i++) seed = (seed * 31 + dateStr.charCodeAt(i)) >>> 0;
        const rand = lcg(seed);
        const intPart = Math.floor(rand() * 1000); // 0-999
        const fracPart = Math.floor(rand() * 100); // 0-99
        return `${String(intPart).padStart(3, '0')}.${String(fracPart).padStart(2, '0')}`;
    }

    function loadStats() {
        const s = localStorage.getItem(STORAGE_KEY);
        if (s) return JSON.parse(s);
        return { history: {}, played: 0, wins: 0, streak: 0, totalGuesses: 0, lastPlayed: null };
    }

    function saveStats(stats) { localStorage.setItem(STORAGE_KEY, JSON.stringify(stats)); }

    function compareGuess(secret, guess) {
        // Remove dot and compare digits (5 digits)
        const sDigits = secret.replace('.', '').split('');
        const gDigits = guess.replace('.', '').split('');

        const result = []; // 'green'|'yellow'|'red'

        // count available digits for yellows
        const avail = {};
        for (let i = 0; i < sDigits.length; i++) {
            if (sDigits[i] === gDigits[i]) {
                result.push('green');
            } else {
                result.push(null);
                avail[sDigits[i]] = (avail[sDigits[i]] || 0) + 1;
            }
        }

        // second pass for yellows
        for (let i = 0; i < gDigits.length; i++) {
            if (result[i]) continue; // already green
            const d = gDigits[i];
            if (avail[d] && avail[d] > 0) {
                result[i] = 'yellow';
                avail[d]--;
            } else {
                result[i] = 'red';
            }
        }

        // unordered pegs: we will shuffle for display so order isn't positional
        return result;
    }

    // UI helpers
    const inputEl = document.getElementById('guess-input');
    const keypadEl = document.getElementById('keypad');
    const guessListEl = document.getElementById('guess-list');
    const msgEl = document.getElementById('message');
    const btnSubmit = document.getElementById('btn-submit');
    const btnGiveup = document.getElementById('btn-giveup');
    const btnNew = document.getElementById('btn-newgame');
    const statsModal = document.getElementById('stats-modal');
    const statsClose = statsModal.querySelector('.close-modal');
    const descriptionEl = document.getElementById('puzzle-description');

    let secret = null;
    let guesses = [];
    let finished = false;
    let stats = loadStats();

    async function init() {
        const today = getTodayString();
        // Try to load CSV rows and pick today's puzzle if present
        const rows = await loadMastermindCSV();
        const todayRow = rows.find(r => r.puzzle_date === today);
        if (todayRow && todayRow.dewey_number) {
            secret = todayRow.dewey_number.trim();
            if (descriptionEl) descriptionEl.textContent = todayRow.description || '';
        } else {
            secret = dailyCodeForDate(today);
            if (descriptionEl) descriptionEl.textContent = '';
        }
        setupKeypad();
        btnSubmit.addEventListener('click', submitGuess);
        btnGiveup.addEventListener('click', giveUp);
        if (btnNew) btnNew.addEventListener('click', newPuzzle);
        statsClose.addEventListener('click', () => statsModal.classList.add('hidden'));
        document.getElementById('btn-stats').addEventListener('click', showStats);

        // If already played today, mark finished so they can't continue.
        // If they solved it, show the secret message as well.
        if (stats.history[today]) {
            finished = true; // user already played today (solved or not)
            if (stats.history[today].solved) {
                msgEl.textContent = `Today's Dewey: ${secret}`;
            }
            setTimeout(() => showStats(), 200);
        }

        updateUI();
        startCountdown();
    }

    function setupKeypad() {
        const keys = ['1','2','3','4','5','6','7','8','9','.','0','⌫'];
        keypadEl.innerHTML = '';
        keys.forEach(k => {
            const b = document.createElement('button');
            b.className = 'btn k';
            b.textContent = k;
            b.addEventListener('click', () => {
                if (finished) return;
                if (k === '⌫') inputEl.value = inputEl.value.slice(0, -1);
                else inputEl.value = (inputEl.value + k).slice(0,6);
            });
            keypadEl.appendChild(b);
        });
    }

    function submitGuess() {
        if (finished) return;
        const val = inputEl.value.trim();
        if (!FORMAT_REGEX.test(val)) {
            alert('Enter a valid Dewey in format DDD.DD (e.g. 917.21)');
            return;
        }
        guesses.push({ guess: val, feedback: compareGuess(secret, val) });
        inputEl.value = '';
        updateUI();

        const today = getTodayString();
        // Save immediate progress but only finalize stats on win/giveup
        if (val === secret) {
            finished = true;
            msgEl.textContent = `Correct! Today's Dewey: ${secret}`;
            saveTodayStats(true);
            setTimeout(() => showStats(), 800);
        }
        updateUI();
    }

    function giveUp() {
        if (finished) return;
        finished = true;
        msgEl.textContent = `You gave up — the number was ${secret}`;
        saveTodayStats(false);
        updateUI();
        setTimeout(() => showStats(), 800);
    }

    function newPuzzle() {
        // allow new puzzle only after finishing (not daily)
        guesses = [];
        finished = false;
        // new random code for session (not daily) based on random seed
        const r = Math.floor(Math.random()*1000);
        const f = Math.floor(Math.random()*100);
        secret = `${String(r).padStart(3,'0')}.${String(f).padStart(2,'0')}`;
        msgEl.textContent = '';
        if (btnNew) btnNew.classList.add('hidden');
        updateUI();
    }

    function saveTodayStats(isWin) {
        const today = getTodayString();
        if (stats.history[today]) return; // don't double-save
        stats.history[today] = { solved: !!isWin, guesses: guesses.length, secret };
        stats.played++;
        if (isWin) {
            stats.wins++;
            stats.totalGuesses += guesses.length;
            const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
            const ystr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
            if (stats.lastPlayed === ystr) stats.streak++; else stats.streak = 1;
            stats.lastPlayed = today;
        } else {
            stats.streak = 0;
        }
        saveStats(stats);
    }

    function updateUI() {
        guessListEl.innerHTML = '';
        guesses.forEach(g => {
            const row = document.createElement('div');
            row.className = 'guess-row';

            const codeBox = document.createElement('div');
            codeBox.className = 'code-box';
            // render each character (including dot)
            g.guess.split('').forEach(ch => {
                const d = document.createElement('div'); d.className='digit'; d.textContent = ch; codeBox.appendChild(d);
            });

            const pegs = document.createElement('div'); pegs.className='pegs';
            // show pegs unordered: shuffle feedback array
            const fb = g.feedback.slice();
            for (let i = fb.length -1; i>0; i--) { const j = Math.floor(Math.random()*(i+1)); [fb[i],fb[j]]=[fb[j],fb[i]]; }
            fb.forEach(col => {
                const p = document.createElement('div'); p.className='peg ' + col; pegs.appendChild(p);
            });

            row.appendChild(codeBox);
            row.appendChild(pegs);
            guessListEl.appendChild(row);
        });

        // If the puzzle is finished and today's entry was solved, show the secret
        // as a filled-in solved row (only if the secret isn't already among guesses).
        const today = getTodayString();
        const todayEntry = stats.history[today];
        if (finished && todayEntry && todayEntry.solved) {
            const alreadyShown = guesses.some(g => g.guess === secret);
            if (!alreadyShown) {
                const row = document.createElement('div');
                row.className = 'guess-row solved';

                const codeBox = document.createElement('div');
                codeBox.className = 'code-box';
                secret.split('').forEach(ch => {
                    const d = document.createElement('div'); d.className='digit'; d.textContent = ch; codeBox.appendChild(d);
                });

                const pegs = document.createElement('div'); pegs.className='pegs';
                for (let i = 0; i < 5; i++) {
                    const p = document.createElement('div'); p.className='peg green'; pegs.appendChild(p);
                }

                row.appendChild(codeBox);
                row.appendChild(pegs);
                guessListEl.insertBefore(row, guessListEl.firstChild);
            }
        }

        // Update buttons visibility
        if (finished) {
            btnGiveup.classList.add('hidden');
            btnSubmit.disabled = true;
            if (btnNew) btnNew.classList.remove('hidden');
        } else {
            btnGiveup.classList.remove('hidden');
            btnSubmit.disabled = false;
            if (btnNew) btnNew.classList.add('hidden');
        }
    }

    function showStats() {
        document.getElementById('stat-streak').textContent = stats.streak;
        document.getElementById('stat-played').textContent = stats.played;
        const avg = stats.wins ? (stats.totalGuesses / stats.wins).toFixed(1) : 0;
        document.getElementById('stat-avg-guesses').textContent = avg;
        const winRate = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
        document.getElementById('stat-win-rate').textContent = winRate + '%';

        const historyEl = document.getElementById('stats-history');
        historyEl.innerHTML = '<h3>Recent History</h3>';
        Object.keys(stats.history).sort().reverse().slice(0,5).forEach(date => {
            const e = stats.history[date];
            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `<span>${date}</span><span>${e.solved? 'Solved ✓' : 'Failed ✗'} (${e.guesses} guesses)</span>`;
            historyEl.appendChild(div);
        });

        statsModal.classList.remove('hidden');
    }

    function startCountdown() {
        const timerEl = document.getElementById('countdown-timer');
        const update = () => {
            const now = new Date();
            const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1); tomorrow.setHours(0,0,0,0);
            const diff = tomorrow - now;
            const h = Math.floor(diff/3600000);
            const m = Math.floor((diff%3600000)/60000);
            const s = Math.floor((diff%60000)/1000);
            timerEl.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        };
        update(); setInterval(update,1000);
    }

    window.addEventListener('DOMContentLoaded', init);

})();
