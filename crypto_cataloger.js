class CryptoGame {
    constructor() {
        this.records = [];
        this.currentRecord = null;
        this.cipherMap = {}; // Maps 'A' -> Number (1, 23, etc.)
        this.reverseCipherMap = {}; // Maps Number -> 'A'
        this.userGuesses = {}; // Maps Number -> 'A' (char guessed by user)
        this.revealedNumbers = new Set(); // Numbers that are permanently revealed (hints)
        this.selectedNumber = null;

        // Fields to display
        this.displayFields = [
            '245', '100', '264', '520', '600', '650', '651', '655', '700'
        ];

        this.fieldLabels = {
            '245': 'Title',
            '100': 'Author',
            '264': 'Publication',
            '600': 'Topic',
            '650': 'Topic',
            '520': 'Summary',
            '651': 'Geographic',
            '655': 'Genre',
            '700': 'Contributor'
        };

        this.subfieldConfig = {
            '100': ['a', 'd'],
            '264': ['c'],
            'default': ['a']
        };
        this.dates = [];
        this.totalAttempts = 0;
        this.correctAttempts = 0;
        this.stats = this.loadStats();
    }

    async init() {
        await this.loadData();
        this.setupControls();
        this.setupStatsModal();
        this.startNewRound();
        this.startCountdown();

        // Global keyboard listener
        document.addEventListener('keydown', (e) => this.handleKeyInput(e));
    }

    async loadData() {
        try {
            const response = await fetch('data/test.mrc');
            if (!response.ok) throw new Error("Failed to load data");
            const buffer = await response.arrayBuffer();
            const parser = new MarcParser();
            this.records = parser.parse(buffer);
        } catch (e) {
            console.error(e);
            document.getElementById('message').textContent = "Error loading MARC data.";
        }
    }

    async loadDatesCSV() {
        try {
            const response = await fetch('data/dates.csv');
            if (!response.ok) {
                throw new Error(`Failed to fetch dates.csv: ${response.status}`);
            }
            const text = await response.text();
            const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
            this.dates = lines.map(line => {
                const [recordNumber, title, date, puzzle] = line.split(',').map(s => s.trim());
                return { recordNumber, title, date, puzzle };
            });
            console.log(`Loaded ${this.dates.length} date entries.`);
        } catch (e) {
            console.error('Error loading dates.csv', e);
            this.dates = [];
        }
    }

    async startNewRound() {
        if (this.records.length === 0) return;

        // Ensure dates are loaded
        if (this.dates.length === 0) {
            await this.loadDatesCSV();
        }

        // Use local date 
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const today = `${year}-${month}-${day}`;

        console.log(`Checking for cypher puzzle on: ${today}`);

        const entry = this.dates.find(e => e.date === today && e.puzzle === 'cypher');
        let recordNumber = null;
        if (entry && entry.recordNumber) {
            recordNumber = entry.recordNumber;
            console.log(`Found daily cypher for ${today}: Record ${recordNumber}`);
        } else {
            console.warn(`No matching date entry for ${today} (cypher); falling back to random record`);
        }

        // Check already solved
        const alreadySolved = this.stats.history[today] && this.stats.history[today].solved;

        if (recordNumber) {
            const match = this.records.find(r => {
                const field001 = r.fields.find(f => f.tag === '001');
                return field001 && field001.text === recordNumber;
            });
            if (match) {
                this.currentRecord = match;
            } else {
                console.error(`Record number ${recordNumber} not found in MARC data; using random`);
                this.currentRecord = this.records[Math.floor(Math.random() * this.records.length)];
            }
        } else {
            this.currentRecord = this.records[Math.floor(Math.random() * this.records.length)];
        }

        if (alreadySolved && entry) {
            this.documentSolved = true;
            console.log("Today's cypher already solved!");
        }

        this.generateCipher();
        this.revealHints();
        this.render();
        this.updateMessage("Click any blank and type a letter to solve.");

        if (alreadySolved && entry) {
            this.showStatsModal();
        }
    }

    generateCipher() {
        // Create random mapping for A-Z
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
        const numbers = Array.from({ length: 26 }, (_, i) => i + 1);

        // Shuffle numbers
        for (let i = numbers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
        }

        this.cipherMap = {};
        this.reverseCipherMap = {};

        alphabet.forEach((char, index) => {
            const num = numbers[index];
            this.cipherMap[char] = num;
            this.reverseCipherMap[num] = char;
        });
    }

    revealHints() {
        // Collect all used letters in the puzzle first.
        const allUsedLetters = new Set();
        let summaryFound = false;

        this.currentRecord.fields.forEach(field => {
            if (this.displayFields.includes(field.tag) && field.subfields) {
                if (field.tag === '520') {
                    if (summaryFound) return;
                    summaryFound = true;
                }
                const subfieldsToShow = this.subfieldConfig[field.tag] || this.subfieldConfig['default'];
                subfieldsToShow.forEach(code => {
                    const sf = field.subfields.find(s => s.code === code);
                    if (sf) {
                        sf.data.toUpperCase().split('').forEach(c => {
                            if (/[A-Z]/.test(c)) allUsedLetters.add(c);
                        });
                    }
                });
            }
        });

        // Convert to array and shuffle
        const distinctLetters = Array.from(allUsedLetters);
        // Fisher-Yates shuffle
        for (let i = distinctLetters.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [distinctLetters[i], distinctLetters[j]] = [distinctLetters[j], distinctLetters[i]];
        }

        // Pick first 4 unique letters (or fewer if total unique < 4)
        const lettersToReveal = distinctLetters.slice(0, 4);

        lettersToReveal.forEach(char => {
            const num = this.cipherMap[char];
            this.revealedNumbers.add(num);
        });
    }

    render() {
        const container = document.getElementById('puzzle-container');
        container.innerHTML = '';

        let summaryDisplayed = false;

        this.currentRecord.fields.forEach(field => {
            if (this.displayFields.includes(field.tag) && field.subfields) {
                if (field.tag === '520') {
                    if (summaryDisplayed) return;
                    summaryDisplayed = true;
                }

                const fieldContainer = document.createElement('div');
                fieldContainer.classList.add('crypto-field');

                // Label
                const label = document.createElement('div');
                label.classList.add('field-label');
                label.textContent = this.fieldLabels[field.tag] || field.tag;
                fieldContainer.appendChild(label);

                // Content
                const contentDiv = document.createElement('div');
                contentDiv.classList.add('field-content');

                // Build text
                let textSegments = [];
                const subfieldsToShow = this.subfieldConfig[field.tag] || this.subfieldConfig['default'];
                subfieldsToShow.forEach(code => {
                    const sf = field.subfields.find(s => s.code === code);
                    if (sf) textSegments.push(sf.data);
                });
                const fullText = textSegments.join(' ');

                // Split into words to prevent breaking mid-word weirdly
                const words = fullText.split(' ');

                words.forEach(word => {
                    const wordGroup = document.createElement('div');
                    wordGroup.classList.add('word-group');

                    word.split('').forEach(char => {
                        const upperChar = char.toUpperCase();

                        if (/[A-Z]/.test(upperChar)) {
                            // It's a letter
                            const num = this.cipherMap[upperChar];

                            const stack = document.createElement('div');
                            stack.classList.add('letter-stack');
                            stack.dataset.number = num;
                            if (num === this.selectedNumber) stack.classList.add('selected');

                            stack.onclick = (e) => {
                                e.stopPropagation();
                                this.selectNumber(num, e.currentTarget);
                            };

                            const slot = document.createElement('div');
                            slot.classList.add('letter-slot');

                            // Determine what to show
                            this.updateStackVisuals(stack, num, slot);

                            const numberDiv = document.createElement('div');
                            numberDiv.classList.add('cipher-number');
                            numberDiv.textContent = num;

                            stack.appendChild(slot);
                            stack.appendChild(numberDiv);
                            wordGroup.appendChild(stack);

                        } else {
                            // Punctuation / Number in text
                            const punc = document.createElement('div');
                            punc.classList.add('punctuation-mark');
                            punc.textContent = char;
                            wordGroup.appendChild(punc);
                        }
                    });

                    contentDiv.appendChild(wordGroup);
                    // Add space after word
                    const space = document.createElement('div');
                    space.classList.add('punctuation-mark');
                    space.innerHTML = '&nbsp;';
                    // contentDiv.appendChild(space); // Actually word-group margin handles this, but let's be safe?
                    // The CSS margin-right on word-group handles inter-word spacing better for flow.
                });

                fieldContainer.appendChild(contentDiv);
                container.appendChild(fieldContainer);
            }
        });
    }

    updateStackVisuals(stackEle, num, slotEle) {
        if (this.revealedNumbers.has(num)) {
            slotEle.textContent = this.reverseCipherMap[num];
            slotEle.classList.add('revealed');
            slotEle.classList.remove('user-guess', 'incorrect-guess');
        } else if (this.userGuesses[num]) {
            slotEle.textContent = this.userGuesses[num];
            slotEle.classList.remove('revealed');

            if (this.userGuesses[num] === this.reverseCipherMap[num]) {
                slotEle.classList.add('user-guess');
                slotEle.classList.remove('incorrect-guess');
            } else {
                slotEle.classList.add('incorrect-guess');
                slotEle.classList.remove('user-guess');
            }
        } else {
            slotEle.innerHTML = '&nbsp;';
            slotEle.classList.remove('revealed', 'user-guess', 'incorrect-guess');
        }

        if (num === this.selectedNumber) {
            stackEle.classList.add('selected');
        } else {
            stackEle.classList.remove('selected');
        }
    }

    selectNumber(num, targetEle = null) {
        if (this.documentSolved) return;

        // Deselect previous
        if (this.selectedNumber !== null) {
            document.querySelectorAll(`.letter-stack[data-number="${this.selectedNumber}"]`)
                .forEach(el => el.classList.remove('selected'));
        }

        this.selectedNumber = num;

        // Select new
        document.querySelectorAll(`.letter-stack[data-number="${this.selectedNumber}"]`)
            .forEach(el => el.classList.add('selected'));

        // On touch devices, show the on-screen keyboard instead of focusing an input
        if (this.isTouchDevice && this.keyboardArea) {
            this.keyboardArea.classList.remove('hidden');
            this.keyboardArea.setAttribute('aria-hidden', 'false');
        }
    }



    handleKeyInput(e) {
        if (this.documentSolved) return;
        if (!this.selectedNumber) return;

        // Ignore modifiers
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        const key = e.key.toUpperCase();
        let changed = false;

        if (e.key === 'Backspace' || e.key === 'Delete') {
            if (this.userGuesses[this.selectedNumber]) {
                delete this.userGuesses[this.selectedNumber];
                changed = true;
            }
        } else if (/[A-Z]/.test(key) && key.length === 1) {
            // Track attempts
            this.totalAttempts++;
            if (key === this.reverseCipherMap[this.selectedNumber]) {
                this.correctAttempts++;
            }

            this.userGuesses[this.selectedNumber] = key;
            changed = true;
        }

        if (changed) {
            // Update visuals only for this number
            const stacks = document.querySelectorAll(`.letter-stack[data-number="${this.selectedNumber}"]`);
            stacks.forEach(stack => {
                const slot = stack.querySelector('.letter-slot');
                this.updateStackVisuals(stack, this.selectedNumber, slot);
            });
            this.checkForCompletion();
        }
    }

    checkForCompletion() {
        // Check if every cipher number that exists in the text has a correct value (either revealed or guessed)

        // First, get all numbers present in the puzzle.
        // We can scan the text again, or just derive from what we generated.
        // Actually, we generated 1-26, but not all might be used.
        // Better to iterate the displayed text and verify.

        let allCorrect = true;
        let isComplete = true; // Are all slots filled?

        // We can just iterate the map. If a number is USED in the text...
        // Let's assume we validate against the full text content we generated.

        // Simple way:
        for (let char in this.cipherMap) {
            const num = this.cipherMap[char];
            // Check if this number is actually used in the displayed record?
            // Optimization: we could track usedNumbers during render or init.
            // For now, let's assume if it's in the map, we check it. 
            // Wait, map has ALL 26 chars. Some might not be in the text.
            // If the user hasn't guessed it, is it wrong?
            // Only strictly enforce visible slots.
        }

        // Let's re-scan the record text to see what's actually on screen.
        let usedNumbers = new Set();

        let summaryFound = false;
        this.currentRecord.fields.forEach(field => {
            if (this.displayFields.includes(field.tag) && field.subfields) {
                if (field.tag === '520') {
                    if (summaryFound) return;
                    summaryFound = true;
                }
                const subfieldsToShow = this.subfieldConfig[field.tag] || this.subfieldConfig['default'];
                subfieldsToShow.forEach(code => {
                    const sf = field.subfields.find(s => s.code === code);
                    if (sf) {
                        sf.data.toUpperCase().split('').forEach(c => {
                            if (/[A-Z]/.test(c)) usedNumbers.add(this.cipherMap[c]);
                        });
                    }
                });
            }
        });

        for (let num of usedNumbers) {
            const correctChar = this.reverseCipherMap[num];
            // Is it revealed?
            if (this.revealedNumbers.has(num)) continue;

            // Is it guessed correctly?
            const userChar = this.userGuesses[num];
            if (!userChar) {
                isComplete = false;
                break;
            }
            if (userChar !== correctChar) {
                allCorrect = false;
            }
        }

        if (isComplete && allCorrect) {
            this.documentSolved = true;
            this.updateMessage("CONGRATULATIONS! You solved the catalog!");
            this.saveStats(true);
            setTimeout(() => this.showStatsModal(), 1500);

            if (window.confetti) {
                window.confetti({
                    particleCount: 150,
                    spread: 70,
                    origin: { y: 0.6 }
                });
            }
        } else if (isComplete && !allCorrect) {
            this.updateMessage("Puzzle full, but something is wrong...");
        } else {
            this.updateMessage("Keep going...");
        }
    }

    setupControls() {
        document.getElementById('btn-newgame').addEventListener('click', () => this.startNewRound());
        document.getElementById('btn-giveup').addEventListener('click', () => {
            if (this.documentSolved) return;
            // Reveal all
            for (let num in this.reverseCipherMap) {
                this.revealedNumbers.add(parseInt(num));
            }
            this.documentSolved = true; // effectively
            this.render();
            this.updateMessage("Solution Revealed.");
        });
        // Create an on-screen keyboard for mobile/touch devices to avoid focus-induced scrolling
        const keyboardArea = document.getElementById('keyboard-area');
        this.keyboardArea = keyboardArea;
        this.isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

        if (keyboardArea) {
            keyboardArea.innerHTML = '';
            const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
            const fragment = document.createDocumentFragment();

            const row = document.createElement('div');
            row.className = 'keyboard-rows';

            letters.forEach(ch => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'kbtn';
                btn.textContent = ch;
                btn.addEventListener('click', () => {
                    if (!this.selectedNumber || this.documentSolved) return;
                    this.handleKeyInput({ key: ch });
                });
                row.appendChild(btn);
            });

            const controls = document.createElement('div');
            controls.className = 'keyboard-controls';
            const back = document.createElement('button');
            back.type = 'button';
            back.className = 'kbtn special';
            back.textContent = '⌫';
            back.addEventListener('click', () => {
                if (!this.selectedNumber || this.documentSolved) return;
                this.handleKeyInput({ key: 'Backspace' });
            });

            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'kbtn special';
            close.textContent = 'Close';
            close.addEventListener('click', () => {
                keyboardArea.classList.add('hidden');
                keyboardArea.setAttribute('aria-hidden', 'true');
            });

            controls.appendChild(back);
            controls.appendChild(close);

            fragment.appendChild(row);
            fragment.appendChild(controls);
            keyboardArea.appendChild(fragment);
        }

        document.getElementById('btn-stats').onclick = () => this.showStatsModal();

        // Hide keyboard when tapping outside stacks or keyboard
        document.addEventListener('click', (e) => {
            const clickedStack = e.target.closest && e.target.closest('.letter-stack');
            const clickedKeyboard = e.target.closest && e.target.closest('#keyboard-area');
            if (!clickedStack && !clickedKeyboard) {
                if (this.selectedNumber !== null) {
                    this.selectedNumber = null;
                    document.querySelectorAll('.letter-stack.selected')
                        .forEach(el => el.classList.remove('selected'));
                }
                if (this.keyboardArea && this.isTouchDevice) {
                    this.keyboardArea.classList.add('hidden');
                    this.keyboardArea.setAttribute('aria-hidden', 'true');
                }
            }
        });
    }

    // --- Stats and Persistence Logic ---

    getTodayString() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    getRecord001(record) {
        if (!record) return null;
        const f001 = record.fields.find(f => f.tag === '001');
        return f001 ? f001.text : null;
    }

    loadStats() {
        const saved = localStorage.getItem('marc_cypher_stats');
        if (saved) return JSON.parse(saved);
        return {
            history: {}, // date -> {solved, record, accuracy}
            played: 0,
            wins: 0,
            streak: 0,
            totalCorrect: 0,
            totalAttempts: 0,
            lastPlayed: null
        };
    }

    saveStats(isWin) {
        const today = this.getTodayString();
        const record001 = this.getRecord001(this.currentRecord);

        // Only save stats if it's the daily puzzle
        const dailyEntry = this.dates.find(e => e.date === today && e.puzzle === 'cypher');
        if (!dailyEntry || dailyEntry.recordNumber !== record001) return;

        if (this.stats.history[today]) return; // Already saved today

        const accuracy = this.totalAttempts > 0 ? Math.round((this.correctAttempts / this.totalAttempts) * 100) : 0;

        this.stats.history[today] = {
            solved: isWin,
            accuracy: accuracy,
            record: record001
        };

        this.stats.played++;
        if (isWin) {
            this.stats.wins++;
            this.stats.totalCorrect += this.correctAttempts;
            this.stats.totalAttempts += this.totalAttempts;

            // Streak logic
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

            if (this.stats.lastPlayed === yesterdayStr) {
                this.stats.streak++;
            } else {
                this.stats.streak = 1;
            }
            this.stats.lastPlayed = today;
        } else {
            this.stats.streak = 0;
        }

        localStorage.setItem('marc_cypher_stats', JSON.stringify(this.stats));
    }

    setupStatsModal() {
        const modal = document.getElementById('stats-modal');
        const closeBtn = modal.querySelector('.close-modal');
        closeBtn.onclick = () => modal.classList.add('hidden');
    }

    showStatsModal() {
        const modal = document.getElementById('stats-modal');

        document.getElementById('stat-streak').textContent = this.stats.streak;
        document.getElementById('stat-played').textContent = this.stats.played;

        const overallAccuracy = this.stats.totalAttempts > 0 ? Math.round((this.stats.totalCorrect / this.stats.totalAttempts) * 100) : 0;
        document.getElementById('stat-accuracy').textContent = overallAccuracy + '%';

        const winRate = this.stats.played > 0 ? Math.round((this.stats.wins / this.stats.played) * 100) : 0;
        document.getElementById('stat-win-rate').textContent = winRate + '%';

        // History
        const historyEl = document.getElementById('stats-history');
        historyEl.innerHTML = '<h3>Recent History</h3>';
        Object.keys(this.stats.history).sort().reverse().slice(0, 5).forEach(date => {
            const entry = this.stats.history[date];
            const div = document.createElement('div');
            div.classList.add('history-item');
            div.innerHTML = `<span>${date}</span><span>${entry.solved ? 'Solved ✓' : 'Failed ✗'} (${entry.accuracy}% acc)</span>`;
            historyEl.appendChild(div);
        });

        modal.classList.remove('hidden');
    }

    startCountdown() {
        const timerEl = document.getElementById('countdown-timer');
        if (!timerEl) return;
        const update = () => {
            const now = new Date();
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);

            const diff = tomorrow - now;
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);

            timerEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        };
        update();
        setInterval(update, 1000);
    }

    updateMessage(msg) {
        document.getElementById('message').textContent = msg;
    }
}


document.addEventListener('DOMContentLoaded', () => {
    const game = new CryptoGame();
    game.init();
});
