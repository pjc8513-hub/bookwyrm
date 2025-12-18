document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    game.init();
});

class Game {
    constructor() {
        this.dates = [];
        this.records = [];
        this.currentRecord = null;
        this.guessedLetters = new Set();
        this.totalGuesses = 0;
        this.won = false;
        this.lost = false; // "lost" might be used for 'give up', or we can repurpose it.
        // Actually, simpler to keep it for 'give up' state where we reveal everything.

        // Relevant fields to display
        this.displayFields = [
            '100', '245', '264', '520', '600', '650', '651', '655', '700'
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

        // Configuration for which subfields to display and in what order
        this.subfieldConfig = {
            '100': ['a', 'd'],
            '264': ['c'],
            'default': ['a']
        };
    }

    async init() {
        await this.loadData();
        this.setupKeyboard();
        this.setupGameControls();
        this.setupTitleGuessModal();
        this.startNewRound();

        document.getElementById('next-record').addEventListener('click', () => {
            this.startNewRound();
        });
    }

    async loadData() {
        try {
            const response = await fetch('data/test.mrc');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const buffer = await response.arrayBuffer();
            const parser = new MarcParser();
            this.records = parser.parse(buffer);
            console.log(`Loaded ${this.records.length} records.`);
        } catch (e) {
            console.error("Failed to load MARC data:", e);
            document.getElementById('message').textContent = "Error loading data. Ensure data/test.mrc exists.";
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
        if (!this.dates) await this.loadDatesCSV();
        const today = new Date().toISOString().slice(0, 10);
        // Find entry for today and puzzle type 'hangman'
        const entry = this.dates.find(e => e.date === today && e.puzzle === 'hangman');
        let recordNumber = null;
        if (entry && entry.recordNumber) {
            recordNumber = entry.recordNumber;
        } else {
            console.warn('No matching date entry for today; falling back to random record');
        }
        if (recordNumber) {
            // Find record with matching 001 field
            const match = this.records.find(r => {
                const field001 = r.fields.find(f => f.tag === '001');
                return field001 && field001.text === recordNumber;
            });
            if (match) {
                this.currentRecord = match;
            } else {
                console.error(`Record number ${recordNumber} not found in MARC data; using random`);
                const randomIndex = Math.floor(Math.random() * this.records.length);
                this.currentRecord = this.records[randomIndex];
            }
        } else {
            const randomIndex = Math.floor(Math.random() * this.records.length);
            this.currentRecord = this.records[randomIndex];
        }
        this.guessedLetters.clear();
        this.totalGuesses = 0;
        this.won = false;
        this.lost = false;
        this.updateUI();
    }

    setupKeyboard() {
        const keyboard = document.getElementById('keyboard');
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

        // clear existing (if any)
        keyboard.innerHTML = '';

        alphabet.split('').forEach(char => {
            const btn = document.createElement('button');
            btn.textContent = char;
            btn.classList.add('key');
            btn.dataset.key = char;
            btn.addEventListener('click', () => this.handleGuess(char));
            keyboard.appendChild(btn);
        });

        // Also handle physical keyboard
        // Remove previous listener potentially? better to just add once.
        // But init is called once.
        document.addEventListener('keydown', (e) => {
            // Only handle if modal is not open?
            if (!document.getElementById('title-guess-modal').classList.contains('hidden')) return;

            const char = e.key.toUpperCase();
            if (alphabet.includes(char)) {
                this.handleGuess(char);
            }
        });
    }

    setupGameControls() {
        document.getElementById('btn-giveup').addEventListener('click', () => this.giveUp());
        document.getElementById('btn-newgame').addEventListener('click', () => this.startNewRound());
    }

    setupTitleGuessModal() {
        const modal = document.getElementById('title-guess-modal');
        const closeBtn = modal.querySelector('.close-modal');
        const cancelBtn = document.getElementById('btn-cancel-guess');
        const submitBtn = document.getElementById('btn-submit-guess');
        const input = document.getElementById('title-input');

        const closeModal = () => {
            modal.classList.add('hidden');
            input.value = '';
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        submitBtn.addEventListener('click', () => {
            const guess = input.value;
            if (guess.trim()) {
                this.handleTitleGuess(guess);
                closeModal();
            }
        });

        // Allow Enter key in input
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const guess = input.value;
                if (guess.trim()) {
                    this.handleTitleGuess(guess);
                    closeModal();
                }
            }
        });
    }

    giveUp() {
        if (this.won || this.lost) return;
        this.lost = true;
        // Reveal all
        this.updateUI();
    }

    handleGuess(char) {
        if (this.won || this.lost || this.guessedLetters.has(char)) return;

        this.guessedLetters.add(char);
        this.totalGuesses++;

        this.checkWinCondition();
        this.updateUI();
    }

    handleTitleGuess(guess) {
        if (this.won || this.lost) return;

        this.totalGuesses++;

        // Normalize guess and target
        const normalize = (str) => str.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

        // Get full title from 245
        const titleField = this.currentRecord.fields.find(f => f.tag === '245');
        let fullTitle = "";
        if (titleField && titleField.subfields) {
            // Combine all subfields for checking? Or just $a?
            // User said "solve for the title" and mostly refers to 245.
            // Usually 245 $a is the main title. $b is subtitle.
            // Let's check against $a first, or maybe $a$b?
            // Let's stick to $a for the "guessing the title" requirement to match the "hidden" part logic
            // which mostly emphasized $a.
            // But let's look at checkWinCondition, it checks $a.
            const sf = titleField.subfields.find(s => s.code === 'a');
            if (sf) fullTitle = sf.data;
        }

        if (normalize(guess) === normalize(fullTitle)) {
            // Correct!
            // Reveal everything
            this.won = true;
            // Also add all letters? Logic in updateUI handles 'won' state.
        } else {
            alert("Incorrect guess!");
        }

        this.updateUI();
    }

    getAllContent() {
        if (!this.currentRecord) return "";
        let content = "";
        let summaryFound = false;
        this.currentRecord.fields.forEach(field => {
            if (this.displayFields.includes(field.tag) && field.subfields) {
                if (field.tag === '520') {
                    if (summaryFound) return;
                    summaryFound = true;
                }
                field.subfields.forEach(sf => {
                    if (sf.code === 'a') content += sf.data;
                });
            }
        });
        return content;
    }

    checkWinCondition() {
        // Win if 245$a is fully revealed
        const titleField = this.currentRecord.fields.find(f => f.tag === '245');
        if (titleField && titleField.subfields) {
            const titleSubfield = titleField.subfields.find(sf => sf.code === 'a');
            if (titleSubfield) {
                const titleText = titleSubfield.data.toUpperCase();
                const isFullyRevealed = titleText.split('').every(char => {
                    return !this.isAlphaNumeric(char) || this.guessedLetters.has(char);
                });

                if (isFullyRevealed) {
                    this.won = true;
                }
            }
        }
    }

    isAlphaNumeric(char) {
        return /[A-Z0-9]/.test(char);
    }

    updateUI() {
        // Update Guess Count
        document.getElementById('guess-count').textContent = `Guesses: ${this.totalGuesses}`;

        // Update Message
        const msgEl = document.getElementById('message');
        if (this.won) msgEl.textContent = `YOU WON! Total Guesses: ${this.totalGuesses}`;
        else if (this.lost) msgEl.textContent = `GAME OVER. Total Guesses: ${this.totalGuesses}`;
        else msgEl.textContent = "";

        // Update Puzzle Area
        const container = document.getElementById('puzzle-container');
        container.innerHTML = '';

        if (!this.currentRecord) return;

        let summaryDisplayed = false;

        this.currentRecord.fields.forEach(field => {
            if (this.displayFields.includes(field.tag) && field.subfields) {
                if (field.tag === '520') {
                    if (summaryDisplayed) return; // Only accept the first 520
                    summaryDisplayed = true;
                }

                // Get subfields to display for this tag
                const subfieldsToShow = this.subfieldConfig[field.tag] || this.subfieldConfig['default'];

                // Iterate over each configured subfield code
                subfieldsToShow.forEach(code => {
                    const sf = field.subfields.find(s => s.code === code);
                    if (sf) {
                        const fieldDiv = document.createElement('div');
                        fieldDiv.classList.add('marc-field');

                        const tagSpan = document.createElement('span');
                        tagSpan.classList.add('field-tag');

                        // Add subfield code indicator if it's not the main one, or just keep it simple?
                        // User request didn't specify showing subfield codes, just the content.
                        // However, for 100 $d, it might be nice to know it's separate? 
                        // Actually, let's just use the main label. 
                        // But if we have multiple subfields for the same tag (like 100 a and d), 
                        // they will appear as separate lines with this loop structure.
                        // This seems acceptable for now.
                        tagSpan.textContent = this.fieldLabels[field.tag] || field.tag;

                        // Inject Guess Button for Title (245) - only on $a
                        if (field.tag === '245' && code === 'a' && !this.won && !this.lost) {
                            const guessBtn = document.createElement('button');
                            guessBtn.textContent = "Guess";
                            guessBtn.classList.add('btn-title-guess');
                            guessBtn.onclick = () => {
                                document.getElementById('title-guess-modal').classList.remove('hidden');
                                document.getElementById('title-input').focus();
                            };
                            tagSpan.appendChild(guessBtn);
                        }

                        fieldDiv.appendChild(tagSpan);

                        const contentDiv = document.createElement('span');
                        contentDiv.classList.add('field-content');

                        // Render logic
                        let text = sf.data;

                        // Check if this specific field/subfield should be always revealed
                        const isAlwaysRevealed =
                            (field.tag === '520') ||
                            (field.tag === '100' && code === 'd') ||
                            (field.tag === '264' && code === 'c');

                        const chars = text.split('');
                        chars.forEach(char => {
                            const charSpan = document.createElement('span');
                            charSpan.classList.add('char');

                            const upperChar = char.toUpperCase();

                            if (this.isAlphaNumeric(upperChar)) {
                                // If game over (lost) or won, reveal everything
                                // OR if it's an always-revealed field
                                if (this.lost || this.won || this.guessedLetters.has(upperChar) || isAlwaysRevealed) {
                                    charSpan.classList.add('revealed');
                                    charSpan.textContent = char;
                                } else {
                                    charSpan.textContent = "_"; // Placeholder for spacing
                                }
                            } else if (char === ' ') {
                                charSpan.classList.add('space');
                                charSpan.innerHTML = '&nbsp;';
                            } else {
                                // Punctuation
                                charSpan.classList.add('punctuation');
                                charSpan.textContent = char;
                            }

                            contentDiv.appendChild(charSpan);
                        });

                        fieldDiv.appendChild(contentDiv);
                        container.appendChild(fieldDiv);
                    }
                });
            }
        });

        // Update Keyboard
        const keys = document.querySelectorAll('.key');
        keys.forEach(key => {
            if (this.guessedLetters.has(key.dataset.key)) {
                key.disabled = true;
            } else {
                key.disabled = false;
            }
        });

        // Update Game Action Buttons
        const giveUpBtn = document.getElementById('btn-giveup');
        const newGameBtn = document.getElementById('btn-newgame');

        if (this.won || this.lost) {
            giveUpBtn.classList.add('hidden');
            newGameBtn.classList.remove('hidden');
        } else {
            giveUpBtn.classList.remove('hidden');
            newGameBtn.classList.add('hidden');
        }
    }
}
